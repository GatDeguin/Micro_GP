import { Vector3, type Camera } from 'three';
import type { CarView, RaceSnapshot } from '../shared/protocol';
import { sectorAt, TRACK, TRACK_SECTORS, type SectorId } from '../shared/track';
import firstTrack from '../../Musica/01.mp3?url';
import secondTrack from '../../Musica/02.mp3?url';
import { buildAudioSamples, buildEngineSamples } from './audio-samples';
import { defaultAudioSettings, type AudioSettings } from './settings';

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
  { idle: 70, sweep: 239, mesh: 2.12, color: 0.70, harmonics: [1, 0.48, 0.22, 0.18, 0.08, 0.06] },
  { idle: 82, sweep: 258, mesh: 2.42, color: 1.05, harmonics: [1, 0.66, 0.40, 0.27, 0.15, 0.11] },
  { idle: 89, sweep: 278, mesh: 2.77, color: 0.82, harmonics: [1, 0.34, 0.13, 0.23, 0.08, 0.04] },
  { idle: 77, sweep: 271, mesh: 2.28, color: 0.98, harmonics: [1, 0.28, 0.50, 0.18, 0.18, 0.08] },
];
const roadTones: Record<SectorId, { frequency: number; gain: number }> = {
  straight: { frequency: 760, gain: 1 }, esses: { frequency: 1020, gain: 0.96 },
  hairpin: { frequency: 830, gain: 1.18 }, bridge: { frequency: 580, gain: 1.08 },
  'back-straight': { frequency: 820, gain: 0.88 }, sweep: { frequency: 930, gain: 1 },
  pit: { frequency: 520, gain: 0.81 },
};
const pitSource = TRACK_SECTORS.find(sector => sector.id === 'pit')!.cue;

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

  const fundamental = style.idle + style.sweep * 0.15;
  const roots = [0.13, 0.48, 0.88].map(rev => 2 * Math.round((style.idle + style.sweep * rev) / 2));
  const clips = buildEngineSamples(context, roots, style.harmonics, 419 + slot * 97);
  const start = context.currentTime + 0.025;
  const engine = clips.map(({ root, coast, power }) => {
    const makeLoop = (sample: AudioBuffer) => {
      const gain = layer(context, engineFilter);
      const source = context.createBufferSource();
      source.buffer = sample;
      source.loop = true;
      source.playbackRate.value = fundamental / root;
      source.connect(gain);
      // Start the bands together so their pitched components track in phase.
      source.start(start);
      return { rate: source.playbackRate, gain: gain.gain };
    };
    return { root, coast: makeLoop(coast), power: makeLoop(power) };
  });

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
    style, output, distanceFilter, engineFilter, engine, gearOscillator: gear, gearGain, whine, whineGain,
    asphalt, asphaltFilter, road, bridge, runoff, grass, skid, skidFilter, scrape,
    previousDistance: 0, lastX: NaN, lastZ: NaN, curbTravel: 0, onCurb: false, deckTravel: 0, deckAt: NaN,
    gear: undefined as number | undefined, shift: undefined as number | undefined,
    shiftAt: -Infinity, shiftDirection: 0,
  };
}

function createMixer(context: AudioContext, initial: AudioSettings) {
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
  const effects = context.createGain();
  effects.gain.value = initial.effects;
  effects.connect(master);

  const voices = motorStyles.map((_, slot) => carVoice(context, master, samples, slot));
  const river = emitter(context, effects);
  const pond = emitter(context, effects);
  const crowd = emitter(context, effects);
  const pitAir = emitter(context, effects);
  const room = layer(context, effects);
  loop(context, samples.water, river.input);
  const stillWater = band(context, 'lowpass', 950);
  stillWater.connect(pond.input);
  loop(context, samples.water, stillWater, 0.46).playbackRate.value = 0.83;
  loop(context, samples.crowd, crowd.input);
  loop(context, samples.room, room);
  loop(context, samples.room, pitAir.input, 0.31).playbackRate.value = 1.65;

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
  let settings = initial;

  function updateMaster() {
    const level = muted || settings.muted ? 0 : 0.72 * settings.master;
    master.gain.setTargetAtTime(level, context.currentTime, 0.075);
  }

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
    const output = emitter(context, effects);
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
    let crowdPass = 0;
    for (let slot = 0; slot < cars.length; slot++) {
      const car = cars[slot];
      const voice = voices[slot];
      if (car.active === false) {
        if (setMix) target(voice.output.gain, 0);
        voice.lastX = voice.lastZ = NaN;
        voice.gear = undefined;
        voice.curbTravel = voice.deckTravel = 0;
        voice.deckAt = NaN;
        voice.onCurb = false;
        continue;
      }
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
      const location = TRACK.locate(car.x, car.z);
      const section = sectorAt(location.s, location.offset).id;
      const tone = roadTones[section];
      const overDeck = section === 'bridge' && car.y > 0.85;
      const deckStep = Math.abs(voice.deckAt - location.s);
      voice.deckAt = overDeck ? location.s : NaN;
      if (!reset && state.phase !== 'demo' && deckStep < 1.6 && motion > 0.3) {
        voice.deckTravel += deckStep;
        if (voice.deckTravel > 2.25) {
          play(samples.deckJoint, loudness * motion * 0.16, pan);
          voice.deckTravel %= 2.25;
        }
      } else voice.deckTravel = 0;
      if (section === 'sweep') crowdPass = Math.max(crowdPass, motion);

      const voiceLevel = (wide ? loudness * 0.89 : dominant ? 0.96 : loudness * 0.68) * (state.phase === 'demo' ? 0.72 : 1);
      const doppler = wide || view === 'chase' ? 1 : 1 + approaching * 0.0027;
      const shiftAge = now - voice.shiftAt;
      const lift = voice.shiftDirection > 0 ? limit(1 - shiftAge / 0.13) : 0;
      const blip = voice.shiftDirection < 0 ? limit(shiftAge / 0.024) * limit(1 - shiftAge / 0.19) ** 1.25 : 0;
      const coastLoad = transmission?.gear === 0 ? 0.30 : 0.24 - 0.20 * motion;
      const load = Math.max((coastLoad + (1 - coastLoad) * throttle) * (1 - 0.95 * lift), blip);
      const engineLevel = 0.5625 * settings.engines * (1 - 0.68 * lift);
      const revAccent = limit(rev - 0.09 * lift + 0.28 * blip, 0, 1.10);
      const pitch = (voice.style.idle + voice.style.sweep * revAccent) * doppler;
      const energized = limit(motion * 1.6 + load * 1.2);
      const response = shiftAge < 0.19 ? 0.018 : 0.062;
      const lowFade = limit((revAccent - 0.19) / 0.18) * Math.PI / 2;
      const highFade = limit((revAccent - 0.62) / 0.21) * Math.PI / 2;
      const bands = [Math.cos(lowFade), Math.sin(lowFade) * Math.cos(highFade), Math.sin(highFade)];
      const loadFade = load * Math.PI / 2;
      // The shared fundamental can add coherently at a crossover. Trim the midpoint.
      const overlapTrim = 1 - 0.15 * (Math.sin(2 * lowFade) + Math.sin(2 * highFade) + Math.sin(2 * loadFade));
      const level = engineLevel * (0.105 + 0.16 * load) * (0.84 + 0.16 * revAccent) * overlapTrim;
      const coastGain = level * Math.cos(loadFade);
      const powerGain = level * Math.sin(loadFade);
      const bridge = overDeck ? limit((car.y - 0.18) / 1.5) : 0;
      target(voice.output.gain, voiceLevel);
      target(voice.output.pan, dominant ? pan * 0.38 : pan);
      target(voice.distanceFilter.frequency, dominant || wide ? 4900 : 1100 + loudness * 4500, 0.12);
      for (const [index, layer] of voice.engine.entries()) {
        const rate = pitch / layer.root;
        target(layer.coast.rate, rate, response);
        target(layer.power.rate, rate, response);
        target(layer.coast.gain, coastGain * bands[index], response);
        target(layer.power.gain, powerGain * bands[index], response);
      }
      target(voice.gearOscillator.frequency, pitch * voice.style.mesh, response);
      target(voice.whine.frequency, pitch * (voice.style.mesh + 1.57), response);
      target(voice.engineFilter.frequency, 700 + 1800 * revAccent + 1500 * load, response);
      target(voice.gearGain.gain, engineLevel * energized * (0.006 + 0.030 * revAccent + 0.012 * load) * voice.style.color, response);
      target(voice.whineGain.gain, engineLevel * energized * revAccent ** 2 * (0.009 + 0.013 * load) * voice.style.color, response);
      const surfaceLevel = motion * settings.effects;
      target(voice.asphalt.gain, surfaceLevel * tone.gain * (0.117 + bridge * 0.046) * (1 - 0.8 * runoff));
      target(voice.asphaltFilter.frequency, tone.frequency + motion * 570 - bridge * 210, 0.11);
      target(voice.bridge.gain, surfaceLevel * bridge * 0.29);
      target(voice.road.playbackRate, 0.55 + 0.90 * motion);
      target(voice.runoff.gain, surfaceLevel * runoff * 0.20);
      target(voice.grass.playbackRate, 0.69 + motion * 0.67);
      target(voice.skidFilter.frequency, 1000 + motion * 1550, 0.045);
      target(voice.skid.gain, (slip * 0.25 + Number(car.braking && car.speed > 0) * motion * 0.07)
        * (1 - runoff * 0.45) * settings.effects, 0.05);
      target(voice.scrape.gain, scrape * surfaceLevel * 0.23, 0.045);
    }

    if (!setMix) return;
    const damp = 1 - pace * 0.42;
    locate(camera, 3.65, -0.156, -6.35, wide);
    river.gain.setTargetAtTime(damp * loudness * 0.070, now, 0.25);
    river.pan.setTargetAtTime(pan, now, 0.18);
    locate(camera, 4.65, -0.156, -0.74, wide);
    pond.gain.setTargetAtTime(damp * loudness * 0.031, now, 0.25);
    pond.pan.setTargetAtTime(pan, now, 0.18);
    locate(camera, -13.65, 0.38, 1.65, wide);
    const cheer = limit((crowdUntil - now) / 1.4);
    crowd.gain.setTargetAtTime(loudness * (damp * 0.037 + cheer * 0.16 + crowdPass * 0.066), now, 0.24);
    crowd.pan.setTargetAtTime(pan, now, 0.18);
    room.gain.setTargetAtTime(0.05, now, 0.21);
    locate(camera, pitSource.x, pitSource.y, pitSource.z, wide);
    pitAir.gain.setTargetAtTime((state.phase === 'practice' ? 0.038 : 0.015) * loudness, now, 0.24);
    pitAir.pan.setTargetAtTime(pan, now, 0.18);
  }

  return {
    update,
    setLevels(value: AudioSettings) {
      settings = value;
      effects.gain.setTargetAtTime(settings.effects, context.currentTime, 0.075);
      updateMaster();
    },
    mute(value: boolean) {
      muted = value;
      if (value) timeline = undefined;
      updateMaster();
    },
  };
}

function createSoundtrack(context: AudioContext) {
  const tracks = [firstTrack, secondTrack];
  const track = new Audio();
  track.preload = 'none';
  track.src = tracks[0];
  const volume = context.createGain();
  volume.gain.value = 0;
  context.createMediaElementSource(track).connect(volume).connect(context.destination);

  let index = 0;
  let enabled = false;
  let target = 0;
  function setPlaying(value: boolean) {
    enabled = value;
    if (!value) track.pause();
    else if (track.paused) void track.play().catch(() => {});
  }
  track.addEventListener('ended', () => {
    index = (index + 1) % tracks.length;
    track.src = tracks[index];
    setPlaying(enabled);
  });
  const levels = { demo: 0.23125, grid: 0.11625, race: 0.175, practice: 0.175, results: 0.23125 };
  return {
    setPlaying,
    mix(phase: RaceSnapshot['phase'], view: View, level: number) {
      const next = (view === 'replay' ? 0.13125 : levels[phase]) * level;
      if (next === target) return;
      target = next;
      volume.gain.setTargetAtTime(next, context.currentTime, 0.28);
    },
  };
}

export function raceAudio(initial = defaultAudioSettings) {
  let context: AudioContext | undefined;
  let mixer: ReturnType<typeof createMixer> | undefined;
  let soundtrack: ReturnType<typeof createSoundtrack> | undefined;
  let muted = false;
  let settings = initial;

  function updatePlayback() {
    soundtrack?.setPlaying(!muted && !settings.muted && settings.master > 0 && settings.music > 0);
  }

  return {
    unlock() {
      try {
        context ??= new AudioContext();
        if (!mixer) {
          mixer = createMixer(context, settings);
          mixer.mute(muted);
        }
        if (context.state === 'suspended') void context.resume().catch(() => {});
        soundtrack ??= createSoundtrack(context);
        updatePlayback();
      } catch {
        // The race remains playable on devices without Web Audio.
      }
    },
    update(frame: RaceMix) {
      mixer?.update(frame);
      const music = settings.muted ? 0 : settings.master * settings.music;
      soundtrack?.mix(frame.state.phase, frame.view, music);
    },
    setLevels(value: AudioSettings) {
      settings = value;
      mixer?.setLevels(settings);
      updatePlayback();
    },
    mute(value: boolean) {
      if (muted === value) return;
      muted = value;
      mixer?.mute(value);
      updatePlayback();
    },
  };
}
