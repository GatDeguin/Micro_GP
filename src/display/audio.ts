import { Vector3, type Camera } from 'three';
import type { CarView, RaceSnapshot } from '../shared/protocol';
import { buildAudioSamples } from './audio-samples';

type View = 'general' | 'chase' | 'trackside' | 'replay';

interface RaceMix {
  state: RaceSnapshot;
  cars: readonly CarView[];
  camera: Camera;
  view: View;
  focus: number;
  tick: number;
  dt: number;
}

const limit = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value));
// Compacto, Cupé, Bólido, Cuña. Each has its own motor sweep and gear whine.
const motorStyles = [
  { idle: 70, sweep: 239, mesh: 2.12, color: 0.70, brush: 0.80, harmonics: [1, 0.48, 0.22, 0.18, 0.08, 0.06] },
  { idle: 82, sweep: 258, mesh: 2.42, color: 1.05, brush: 1.15, harmonics: [1, 0.66, 0.40, 0.27, 0.15, 0.11] },
  { idle: 89, sweep: 278, mesh: 2.77, color: 0.82, brush: 0.65, harmonics: [1, 0.34, 0.13, 0.23, 0.08, 0.04] },
  { idle: 77, sweep: 271, mesh: 2.28, color: 0.98, brush: 1.00, harmonics: [1, 0.28, 0.50, 0.18, 0.18, 0.08] },
];

function emitter(context: AudioContext, destination: AudioNode) {
  const gain = context.createGain();
  const pan = context.createStereoPanner();
  gain.gain.value = 0;
  gain.connect(pan).connect(destination);
  return {
    gain: gain.gain,
    pan: pan.pan,
    input: gain,
    disconnect() { gain.disconnect(); pan.disconnect(); },
  };
}

function band(context: AudioContext, type: BiquadFilterType, frequency: number, q = 0.7) {
  const filter = context.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = q;
  return filter;
}

function loop(context: AudioContext, buffer: AudioBuffer, destination: AudioNode, offset = 0) {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(destination);
  source.start(0, offset * buffer.duration);
  return source;
}

function layer(context: AudioContext, destination: AudioNode) {
  const gain = context.createGain();
  gain.gain.value = 0;
  gain.connect(destination);
  return gain;
}

function carVoice(context: AudioContext, destination: AudioNode, samples: ReturnType<typeof buildAudioSamples>, slot: number) {
  const style = motorStyles[slot];
  const output = emitter(context, destination);
  const distanceFilter = band(context, 'lowpass', 4800);
  distanceFilter.connect(output.input);
  const engineFilter = band(context, 'lowpass', 960);
  engineFilter.connect(distanceFilter);

  const oscillator = context.createOscillator();
  const fundamental = style.idle + style.sweep * 0.15;
  oscillator.frequency.value = fundamental;
  const harmonics = Float32Array.from([0, ...style.harmonics]);
  oscillator.setPeriodicWave(context.createPeriodicWave(new Float32Array(harmonics.length), harmonics));
  const motor = layer(context, engineFilter);
  oscillator.connect(motor);
  oscillator.start();

  const gear = context.createOscillator();
  gear.frequency.value = fundamental * style.mesh;
  const gearGain = layer(context, distanceFilter);
  gear.connect(gearGain);
  gear.start();

  const whine = context.createOscillator();
  whine.frequency.value = fundamental * (style.mesh + 1.57);
  const whineGain = layer(context, distanceFilter);
  whine.connect(whineGain);
  whine.start();

  const drive = layer(context, distanceFilter);
  const driveFilter = band(context, 'bandpass', 740, 0.66);
  driveFilter.connect(drive);
  const brush = loop(context, samples.drive, driveFilter, slot * 0.22);

  const asphalt = layer(context, distanceFilter);
  const asphaltFilter = band(context, 'bandpass', 960, 0.53);
  asphaltFilter.connect(asphalt);
  const road = loop(context, samples.asphalt, asphaltFilter, slot * 0.19);
  const bridge = layer(context, distanceFilter);
  const deckResonance = band(context, 'bandpass', 260 + slot * 12, 3.7);
  road.connect(deckResonance).connect(bridge);
  const skid = layer(context, distanceFilter);
  const skidFilter = band(context, 'bandpass', 1880, 1.6);
  skidFilter.connect(skid);
  road.connect(skidFilter);

  const runoff = layer(context, distanceFilter);
  const grass = loop(context, samples.runoff, runoff, slot * 0.18);
  const scrape = layer(context, distanceFilter);
  loop(context, samples.scrape, scrape, slot * 0.21);

  return {
    style, output, distanceFilter, engineFilter, oscillator, motor, gearOscillator: gear, gearGain, whine, whineGain, drive, driveFilter, brush,
    asphalt, asphaltFilter, road, bridge, runoff, grass, skid, skidFilter, scrape,
    previousDistance: 0, lastX: NaN, lastZ: NaN, curbTravel: 0, onCurb: false,
    gear: undefined as number | undefined, shift: undefined as number | undefined,
    shiftAt: -Infinity, shiftDirection: 0,
  };
}

function createMixer(context: AudioContext) {
  const samples = buildAudioSamples(context);
  const master = context.createGain();
  master.gain.value = 0;
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -13;
  compressor.knee.value = 10;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.13;
  master.connect(compressor).connect(context.destination);

  const voices = motorStyles.map((_, slot) => carVoice(context, master, samples, slot));
  const river = emitter(context, master);
  const pond = emitter(context, master);
  const crowd = emitter(context, master);
  const room = layer(context, master);
  loop(context, samples.water, river.input);
  const stillWater = band(context, 'lowpass', 950);
  stillWater.connect(pond.input);
  loop(context, samples.water, stillWater, 0.46).playbackRate.value = 0.83;
  loop(context, samples.crowd, crowd.input);
  loop(context, samples.room, room);

  const direction = new Vector3();
  const screen = new Vector3();
  const cameraRight = new Vector3();
  const cameraForward = new Vector3();
  let distance = 0;
  let pan = 0;
  let loudness = 0;
  let nextMix = 0;
  let timeline: View | undefined;
  let previousState: RaceSnapshot | undefined;
  let lastImpact = -1;
  let crowdUntil = 0;
  let variation = 0;
  let transients = 0;
  let previousTick = -1;
  let muted = false;

  function locate(camera: Camera, x: number, y: number, z: number, wide: boolean) {
    direction.set(x, y, z).sub(camera.position);
    distance = direction.length();
    const inFront = direction.dot(cameraForward) > 0.01;
    const horizontal = inFront
      ? screen.set(x, y, z).project(camera).x
      : direction.dot(cameraRight) / 7;
    pan = limit(horizontal * (wide ? 0.75 : 0.54), -0.82, 0.82);
    loudness = wide ? limit(1.02 - distance / 105, 0.46, 0.83) : 1 / (1 + (distance / 11) ** 1.55);
  }

  function play(buffers: readonly AudioBuffer[], level: number, side: number, id = variation++) {
    if (transients >= 18 || level < 0.012) return;
    const source = context.createBufferSource();
    source.buffer = buffers[id % buffers.length];
    source.playbackRate.value = 0.94 + ((id * 13) % 11) * 0.012;
    const output = emitter(context, master);
    output.gain.value = level;
    output.pan.value = side;
    source.connect(output.input);
    transients++;
    source.onended = () => {
      transients--;
      source.disconnect();
      output.disconnect();
    };
    source.start();
  }

  function update({ state, cars, camera, view, focus, tick, dt }: RaceMix) {
    if (context.state !== 'running' || muted) return;
    const now = context.currentTime;
    const wide = view === 'general';
    const replay = view === 'replay';
    const changedView = timeline !== view;
    const reset = timeline === undefined || (timeline === 'replay') !== replay
      || tick < previousTick || state.heat !== previousState?.heat;
    timeline = view;
    previousTick = tick;
    cameraRight.setFromMatrixColumn(camera.matrixWorld, 0);
    cameraForward.setFromMatrixColumn(camera.matrixWorld, 2).negate();

    if (reset) {
      previousState = state;
      lastImpact = -1;
      crowdUntil = 0;
      for (const hit of state.impacts ?? []) {
        if (hit.frame <= tick) lastImpact = Math.max(lastImpact, hit.id);
      }
    }
    if (previousState !== state) {
      const prior = previousState;
      if (state.phase === 'grid' && state.lights > 0
        && (!prior || prior.heat !== state.heat || state.lights > prior.lights)) {
        play(samples.relay, 0.39, 0, state.lights);
      }
      if (prior?.phase === 'grid' && state.phase === 'race') play(samples.go, 0.51, 0);
      if (state.flag && !prior?.flag) {
        play(samples.finish, 0.43, 0);
        crowdUntil = now + 1.8;
      }
      previousState = state;
    }
    for (const hit of state.impacts ?? []) {
      if (hit.id <= lastImpact || hit.frame > tick) continue;
      lastImpact = hit.id;
      locate(camera, hit.x, hit.y, hit.z, wide);
      play(samples[hit.kind], loudness * (0.10 + 0.38 * limit(hit.strength)), pan, hit.id);
    }

    const setMix = now >= nextMix || changedView || reset;
    if (setMix) nextMix = now + 0.028;
    const target = (parameter: AudioParam, value: number, response = 0.075) =>
      parameter.setTargetAtTime(value, now, response);
    let pace = 0;
    for (let slot = 0; slot < cars.length; slot++) {
      const car = cars[slot];
      const voice = voices[slot];
      const speed = Math.abs(car.speed);
      const motion = limit(speed / 12.8);
      const throttle = limit(car.sound?.throttle ?? (car.braking ? 0 : motion * 0.8));
      const curb = limit(car.sound?.curb ?? 0);
      const runoff = limit(car.sound?.runoff ?? 0);
      const slip = limit(car.sound?.slip ?? 0);
      const scrape = limit(car.sound?.scrape ?? 0);
      const transmission = car.transmission;
      const rev = limit(transmission?.rev ?? motion);
      const dominant = slot === focus && !wide;
      if (dominant || wide) pace = Math.max(pace, motion);
      locate(camera, car.x, car.y + 0.23, car.z, wide);
      const travel = Math.hypot(car.x - voice.lastX, car.z - voice.lastZ);
      voice.lastX = car.x;
      voice.lastZ = car.z;
      const approaching = dt > 0 && !changedView && !reset
        ? limit((voice.previousDistance - distance) / dt, -16, 16)
        : 0;
      voice.previousDistance = distance;
      if (reset) voice.shiftAt = -Infinity;
      const previousGear = voice.gear;
      const shifted = transmission && !reset && previousGear !== undefined && previousGear !== transmission.gear
        && voice.shift !== transmission.shift;
      if (shifted) {
        const driveGear = transmission.gear > 0 && previousGear > 0;
        voice.shiftDirection = driveGear ? Math.sign(transmission.gear - previousGear) : 0;
        voice.shiftAt = now;
        const shiftSamples = voice.shiftDirection < 0 || transmission.gear === -1 ? samples.downshift : samples.upshift;
        const strike = driveGear ? 0.17 + 0.12 * motion : 0.11;
        play(shiftSamples, loudness * strike, pan, transmission.shift + slot);
      }
      voice.gear = transmission?.gear;
      voice.shift = transmission?.shift;
      const onCurb = curb > 0.14 && speed > 1.25 && !car.blink;
      if (onCurb && !reset) {
        if (travel < 1.1) voice.curbTravel += travel;
        if (!voice.onCurb || voice.curbTravel >= 0.645) {
          play(samples.curb, (0.08 + 0.17 * motion) * Math.sqrt(curb) * loudness, pan);
          voice.curbTravel %= 0.645;
        }
      } else {
        voice.curbTravel = 0;
      }
      voice.onCurb = onCurb;
      if (!setMix && !shifted) continue;

      const voiceLevel = (wide ? loudness * 0.89 : dominant ? 0.96 : loudness * 0.68) * (state.phase === 'demo' ? 0.72 : 1);
      const doppler = wide || view === 'chase' ? 1 : 1 + approaching * 0.0027;
      const shiftAge = now - voice.shiftAt;
      const lift = voice.shiftDirection > 0 ? limit(1 - shiftAge / 0.13) : 0;
      const blip = voice.shiftDirection < 0 ? limit(shiftAge / 0.024) * limit(1 - shiftAge / 0.19) ** 1.25 : 0;
      const load = Math.max(throttle * (1 - 0.92 * lift), blip);
      const engaged = 1 - 0.68 * lift;
      const revAccent = limit(rev - 0.09 * lift + 0.28 * blip, 0, 1.10);
      const pitch = (voice.style.idle + voice.style.sweep * revAccent + 12 * load) * doppler;
      const energized = limit(motion * 1.6 + load * 1.2);
      const response = shiftAge < 0.19 ? 0.018 : 0.062;
      const bridge = limit((car.y - 0.18) / 1.34);
      target(voice.output.gain, voiceLevel);
      target(voice.output.pan, dominant ? pan * 0.38 : pan);
      target(voice.distanceFilter.frequency, dominant || wide ? 4900 : 1100 + loudness * 4500, 0.12);
      target(voice.oscillator.frequency, pitch, response);
      target(voice.gearOscillator.frequency, pitch * voice.style.mesh, response);
      target(voice.whine.frequency, pitch * (voice.style.mesh + 1.57), response);
      target(voice.engineFilter.frequency, 495 + 1100 * revAccent + 1370 * load, response);
      target(voice.motor.gain, engaged * (0.008 + energized * (0.065 + 0.059 * load)), response);
      target(voice.gearGain.gain, engaged * energized * (0.009 + 0.044 * revAccent + 0.018 * load) * voice.style.color, response);
      target(voice.whineGain.gain, engaged * energized * revAccent ** 2 * (0.014 + 0.018 * load) * voice.style.color, response);
      target(voice.drive.gain, energized * (0.027 + 0.087 * load + 0.056 * revAccent) * voice.style.brush * engaged, response);
      target(voice.driveFilter.frequency, 535 + 1280 * revAccent + 485 * load, response);
      target(voice.brush.playbackRate, (0.67 + 1.06 * revAccent) * doppler, response);
      target(voice.asphalt.gain, motion * (0.117 + bridge * 0.046) * (1 - 0.8 * runoff));
      target(voice.asphaltFilter.frequency, 680 + motion * 570 - bridge * 360, 0.11);
      target(voice.bridge.gain, motion * bridge * 0.20);
      target(voice.road.playbackRate, 0.55 + 0.90 * motion);
      target(voice.runoff.gain, motion * runoff * 0.20);
      target(voice.grass.playbackRate, 0.69 + motion * 0.67);
      target(voice.skidFilter.frequency, 1000 + motion * 1550, 0.045);
      target(voice.skid.gain, (slip * 0.25 + Number(car.braking && car.speed > 0) * motion * 0.07) * (1 - runoff * 0.45), 0.05);
      target(voice.scrape.gain, scrape * motion * 0.23, 0.045);
    }

    if (!setMix) return;
    const damp = 1 - pace * 0.42;
    locate(camera, 3.8, 0, -5.9, wide);
    river.gain.setTargetAtTime(damp * loudness * 0.070, now, 0.25);
    river.pan.setTargetAtTime(pan, now, 0.18);
    locate(camera, 5.5, 0, -0.5, wide);
    pond.gain.setTargetAtTime(damp * loudness * 0.031, now, 0.25);
    pond.pan.setTargetAtTime(pan, now, 0.18);
    locate(camera, -13.65, 0.6, 1.65, wide);
    const cheer = limit((crowdUntil - now) / 1.4);
    crowd.gain.setTargetAtTime(loudness * (damp * 0.037 + cheer * 0.16), now, 0.24);
    crowd.pan.setTargetAtTime(pan, now, 0.18);
    room.gain.setTargetAtTime(0.05, now, 0.21);
  }

  return {
    update,
    mute(value: boolean) {
      muted = value;
      if (value) timeline = undefined;
      master.gain.setTargetAtTime(value ? 0 : 0.72, context.currentTime, 0.075);
    },
  };
}

export function raceAudio() {
  let context: AudioContext | undefined;
  let mixer: ReturnType<typeof createMixer> | undefined;
  let muted = false;

  return {
    unlock() {
      try {
        context ??= new AudioContext();
        if (!mixer) {
          mixer = createMixer(context);
          mixer.mute(muted);
        }
        if (context.state === 'suspended') void context.resume().catch(() => {});
      } catch {
        // The race remains playable on devices without Web Audio.
      }
    },
    update(frame: RaceMix) { mixer?.update(frame); },
    mute(value: boolean) {
      if (muted === value) return;
      muted = value;
      mixer?.mute(value);
    },
  };
}
