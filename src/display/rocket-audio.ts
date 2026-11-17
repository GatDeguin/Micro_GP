import type { RocketLaunchState } from './spaceport-launch-state.ts';

/** A single worker-generated loop; no nodes or buffers are allocated per launch. */
export function createRocketVoice(context: BaseAudioContext, buffer: AudioBuffer, destination: AudioNode) {
  const source = context.createBufferSource(), filter = context.createBiquadFilter();
  const gain = context.createGain(), pan = context.createStereoPanner();
  source.buffer = buffer; source.loop = true;
  filter.type = 'lowpass'; filter.Q.value = .65; filter.frequency.value = 180;
  gain.gain.value = 0;
  source.connect(filter).connect(gain).connect(pan).connect(destination); source.start();
  return {
    update(state: Readonly<RocketLaunchState> | undefined, distance: number, side: number, enabled: boolean, at = context.currentTime) {
      const ignition = enabled && state ? state.ignition : 0;
      const attenuation = 1 / (1 + (Math.max(0, distance) / 125) ** 1.6);
      // Short bass attack, a textured roar on ascent, then natural distance rolloff.
      const attack = state ? Math.exp(-(((state.elapsed - .55) / .26) ** 2)) : 0;
      gain.gain.setTargetAtTime(ignition * (.40 + attack * .12) * attenuation, at, ignition ? .065 : .10);
      pan.pan.setTargetAtTime(Math.max(-.85, Math.min(.85, side)), at, .14);
      filter.frequency.setTargetAtTime(220 + ignition * 2100 * attenuation, at, .16);
      source.playbackRate.setTargetAtTime(.78 + ignition * .20, at, .18);
    },
  };
}
