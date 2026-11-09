import type { RaceSnapshot } from '../shared/protocol';

export function raceAudio() {
  let context: AudioContext | undefined;
  let mix: GainNode | undefined;
  let motors: { oscillator: OscillatorNode; amp: GainNode; pan: StereoPannerNode }[] = [];
  let prior: RaceSnapshot | undefined;

  function unlock() {
    try {
      if (!context) {
        context = new AudioContext();
        mix = context.createGain();
        mix.gain.value = 0.19;
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 435;
        filter.Q.value = 0.7;
        filter.connect(mix);
        mix.connect(context.destination);
        const audio = context;
        motors = Array.from({ length: 4 }, (_, i) => {
          const oscillator = audio.createOscillator();
          oscillator.type = i % 2 === 0 ? 'triangle' : 'sawtooth';
          oscillator.frequency.value = 62 + i * 7;
          const amp = audio.createGain();
          amp.gain.value = 0;
          const pan = audio.createStereoPanner();
          oscillator.connect(amp).connect(pan).connect(filter);
          oscillator.start();
          return { oscillator, amp, pan };
        });
      }
      void context.resume().catch(() => {});
    } catch {
      // Race signals remain readable if audio is unavailable.
    }
  }

  function tone(frequency: number, endFrequency: number, length: number, volume: number, wave: OscillatorType) {
    if (!context || !mix) return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + length);
    const amp = context.createGain();
    amp.gain.setValueAtTime(0.001, now);
    amp.gain.linearRampToValueAtTime(volume, now + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.001, now + length);
    oscillator.connect(amp).connect(mix);
    oscillator.start();
    oscillator.stop(now + length);
  }

  return {
    unlock,
    update(state: RaceSnapshot) {
      if (!context || context.state !== 'running' || !mix) return;
      const now = context.currentTime;
      state.cars.forEach((car, i) => {
        const motor = motors[i];
        const speed = Math.abs(car.speed);
        motor.oscillator.frequency.setTargetAtTime(69 + 9 * i + speed * 23, now, 0.10);
        motor.amp.gain.setTargetAtTime(0.026 + Math.min(speed, 10) * 0.0075, now, 0.10);
        motor.pan.pan.setTargetAtTime(Math.max(-0.8, Math.min(0.8, car.x / 29)), now, 0.10);
        const oldCar = prior?.cars[i];
        if (oldCar && prior?.phase === state.phase && Math.abs(oldCar.speed) - speed > 2.0 && !car.blink) {
          tone(car.braking ? 390 : 128, car.braking ? 170 : 43, 0.095, 0.23, 'triangle');
        }
      });
      if (state.phase === 'grid' && state.lights > (prior?.lights ?? 0)) tone(430, 430, 0.12, 0.52, 'sine');
      if (state.phase === 'race' && prior?.phase === 'grid') tone(820, 820, 0.45, 0.67, 'sine');
      prior = state;
    },
    mute(muted: boolean) {
      if (mix && context) mix.gain.setTargetAtTime(muted ? 0 : 0.19, context.currentTime, 0.09);
    },
  };
}
