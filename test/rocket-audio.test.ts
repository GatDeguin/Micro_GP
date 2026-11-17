import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAudioSamples } from '../src/display/audio-samples.ts';
import { createRocketVoice } from '../src/display/rocket-audio.ts';
import { createLaunchSequence } from '../src/display/spaceport-launch-state.ts';

test('rocket PCM has no loop seam, DC offset, clipping or invalid samples', () => {
  const bank = buildAudioSamples({ createBuffer(_channels: number, length: number, _rate: number) {
    const data = new Float32Array(length); return { getChannelData() { return data; } };
  } });
  const data = bank.rocket.getChannelData();
  assert.equal(data.length, 96000); assert.ok(data.every(Number.isFinite));
  const peak = data.reduce((value, sample) => Math.max(value, Math.abs(sample)), 0);
  const rms = Math.sqrt(data.reduce((sum, sample) => sum + sample * sample, 0) / data.length);
  const mean = data.reduce((sum, sample) => sum + sample, 0) / data.length;
  assert.ok(peak < .8 && rms > .03 && rms < .25);
  assert.ok(Math.abs(mean) < .001); assert.equal(data[0], data.at(-1));
});

test('rocket voice attenuates with distance, obeys lifecycle mute and reuses its audio graph', () => {
  let created = 0, started = 0;
  const parameter = () => ({ value: 0, setTargetAtTime(value: number) { this.value = value; } });
  const node = () => { created++; return { connect(destination: unknown) { return destination; },
    gain: parameter(), pan: parameter(), frequency: parameter(), Q: parameter(), playbackRate: parameter(), start() { started++; } }; };
  let output: ReturnType<typeof node>;
  const context = { currentTime: 0, createBufferSource: node, createBiquadFilter: node,
    createGain() { output = node(); return output; }, createStereoPanner: node };
  const voice = createRocketVoice(context as unknown as BaseAudioContext, {} as AudioBuffer, {} as AudioNode);
  const state = { ...createLaunchSequence().state, ignition: 1, elapsed: 1 };
  voice.update(state, 60, 0, true); const near = output!.gain.value;
  voice.update(state, 700, 0, true); assert.ok(output!.gain.value < near * .1);
  for (let i = 0; i < 100; i++) {
    voice.update(state, 60, 0, true); assert.ok(output!.gain.value > 0);
    voice.update(state, 60, 0, false); assert.equal(output!.gain.value, 0);
    voice.update(undefined, 60, 0, true); assert.equal(output!.gain.value, 0);
    voice.update(createLaunchSequence().state, 60, 0, true); assert.equal(output!.gain.value, 0);
  }
  assert.equal(created, 4); assert.equal(started, 1);
});
