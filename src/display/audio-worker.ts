import { prepareAudioBank, type EngineSampleSpec } from './audio-samples';

export interface PCMClip { samples: Float32Array<ArrayBuffer>; rate: number }
type EffectBuffers = ReturnType<typeof prepareAudioBank<AudioBuffer>>['effects'];
export interface PCMBank {
  effects: { [K in keyof EffectBuffers]: EffectBuffers[K] extends AudioBuffer[] ? PCMClip[] : PCMClip };
  engines: { root: number; coast: PCMClip; power: PCMClip }[][];
}

class SampleBuffer implements PCMClip {
  readonly samples: Float32Array<ArrayBuffer>;

  constructor(length: number, readonly rate: number) { this.samples = new Float32Array(length); }

  getChannelData() { return this.samples; }
}

self.addEventListener('message', (event: MessageEvent<EngineSampleSpec[]>) => {
  const transfer: ArrayBuffer[] = [];
  const bank = prepareAudioBank({ createBuffer(_channels, length, rate) {
    const buffer = new SampleBuffer(length, rate);
    transfer.push(buffer.samples.buffer);
    return buffer;
  } }, event.data);
  self.postMessage(bank, { transfer });
});
