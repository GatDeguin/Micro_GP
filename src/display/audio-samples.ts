const sampleRate = 24_000;
const tau = Math.PI * 2;

function random(seed: number) {
  return () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 0x1_0000_0000;
  };
}

function whiteNoise(length: number, seed: number) {
  const next = random(seed);
  const noise = new Float32Array(length);
  for (let i = 0; i < length; i++) noise[i] = 2 * next() - 1;
  return noise;
}

function bandNoise(source: Float32Array, low: number, high: number, periodic: boolean) {
  const result = new Float32Array(source.length);
  const upperExponent = -tau * high / sampleRate;
  const lowerExponent = -tau * low / sampleRate;
  const upperPole = Math.exp(upperExponent);
  const lowerPole = Math.exp(lowerExponent);
  const upperFeed = 1 - upperPole;
  const lowerFeed = 1 - lowerPole;
  let upper = 0;
  let lower = 0;
  if (periodic) {
    for (let i = 0; i < source.length; i++) {
      upper = upperFeed * source[i] + upperPole * upper;
      lower = lowerFeed * source[i] + lowerPole * lower;
    }
    // Start both filters in steady state for this exact repeating sequence.
    upper /= -Math.expm1(upperExponent * source.length);
    lower /= -Math.expm1(lowerExponent * source.length);
  }
  for (let i = 0; i < source.length; i++) {
    upper = upperFeed * source[i] + upperPole * upper;
    lower = lowerFeed * source[i] + lowerPole * lower;
    result[i] = upper - lower;
  }
  return result;
}

function buffer(context: BaseAudioContext, data: Float32Array, peak: number, periodic: boolean) {
  const result = context.createBuffer(1, data.length, sampleRate);
  const channel = result.getChannelData(0);
  let offset = 0;
  let average = 0;
  if (periodic) {
    let quietest = Infinity;
    for (let i = 0; i < data.length; i++) average += data[i];
    average /= data.length;
    // Move the seam to a quiet join without fading or disturbing the periodic signal.
    for (let i = 2; i < data.length - 1; i++) {
      const previous = data[i - 1] - data[i - 2];
      const jump = data[i] - data[i - 1];
      const following = data[i + 1] - data[i];
      const score = Math.abs(jump) + 0.65 * (Math.abs(jump - previous) + Math.abs(following - jump));
      if (score < quietest) {
        quietest = score;
        offset = i;
      }
    }
  }
  const join = periodic ? (data[(offset + data.length - 1) % data.length] + data[offset]) / 2 : 0;
  let maximum = 0;
  for (let i = 0; i < data.length; i++) {
    const end = data.length - 1 - i;
    const edge = periodic ? Math.min(1, i / 18, end / 18) : Math.min(1, i / 20, end / 360);
    // Blend less than a millisecond of each edge to the same value and slope.
    const weight = periodic ? edge * edge * (3 - 2 * edge) : edge;
    channel[i] = join + (data[(i + offset) % data.length] - join) * weight - average;
    maximum = Math.max(maximum, Math.abs(channel[i]));
  }
  const gain = peak / Math.max(0.0001, maximum);
  for (let i = 0; i < channel.length; i++) channel[i] *= gain;
  return result;
}

type NoiseLayer = [low: number, high: number, level: number, waves: number, motion: number];

function loop(context: BaseAudioContext, seconds: number, seed: number, peak: number,
  layers: readonly NoiseLayer[], detail?: (samples: Float32Array) => void) {
  const samples = new Float32Array(Math.round(seconds * sampleRate));
  const noise = whiteNoise(samples.length, seed);
  for (const [low, high, level, waves, motion] of layers) {
    const band = bandNoise(noise, low, high, true);
    const phaseStep = tau * waves / samples.length;
    for (let i = 0; i < samples.length; i++) {
      samples[i] += band[i] * level * (1 + motion * Math.sin(i * phaseStep + low));
    }
  }
  detail?.(samples);
  return buffer(context, samples, peak, true);
}

function grains(samples: Float32Array, seed: number, count: number, level: number,
  frequency: number, duration: number, pitchFall: number) {
  const next = random(seed);
  for (let grain = 0; grain < count; grain++) {
    const start = Math.floor(next() * samples.length);
    const hz = frequency * (0.62 + next() * 0.86);
    const frames = Math.round(sampleRate * duration * (0.53 + next()));
    const gain = level * (0.38 + 0.62 * next());
    for (let i = 0; i < frames; i++) {
      const phase = i / frames;
      const window = Math.sin(Math.PI * phase) ** 2;
      const angle = tau * hz * (i / sampleRate) * (1 - pitchFall * phase / 2);
      samples[(start + i) % samples.length] += gain * window * Math.sin(angle);
    }
  }
}

function murmurs(samples: Float32Array) {
  const next = random(946);
  const duration = samples.length / sampleRate;
  // The highest formant is close to 1 kHz, so a small, interpolated layer is enough.
  const voices = new Float32Array(Math.ceil(samples.length / 3));
  const phaseStep = tau / voices.length;
  for (const [voice, hz] of [139, 188, 116, 152, 206, 127].entries()) {
    const cycles = Math.round(hz * duration);
    const offset = tau * next();
    for (let i = 0; i < voices.length; i++) {
      const phase = phaseStep * i;
      const syllable = 0.5 + 0.5 * Math.sin((6 + voice) * phase + offset);
      const swell = 0.48 + 0.52 * Math.sin((2 + voice % 3) * phase - offset) ** 2;
      const pitch = cycles * phase + offset + 0.85 * Math.sin((7 + voice) * phase + offset);
      const formants = 0.42 * Math.sin(2 * pitch) + 0.33 * Math.sin(3 * pitch) + 0.21 * Math.sin(5 * pitch);
      voices[i] += 0.018 * syllable ** 2 * swell * formants;
    }
  }
  const stride = voices.length / samples.length;
  for (let i = 0; i < samples.length; i++) {
    const position = stride * i;
    const left = Math.floor(position);
    const right = (left + 1) % voices.length;
    samples[i] += voices[left] + (voices[right] - voices[left]) * (position - left);
  }
}

function ring(samples: Float32Array, time: number, hz: number, level: number, decay: number, bend = 0) {
  const start = Math.round(time * sampleRate);
  const end = Math.min(samples.length, start + Math.ceil(8 * sampleRate / decay));
  for (let i = start; i < end; i++) {
    const t = (i - start) / sampleRate;
    const envelope = Math.min(1, t * 1800) * Math.exp(-decay * t);
    samples[i] += level * envelope * Math.sin(tau * (hz + bend * t / 2) * t);
  }
}

function strike(samples: Float32Array, time: number, seed: number, low: number, high: number, level: number, decay: number) {
  const start = Math.round(time * sampleRate);
  const length = Math.min(samples.length - start, Math.ceil(8 * sampleRate / decay));
  const noise = bandNoise(whiteNoise(length, seed), low, high, false);
  for (let i = 0; i < length; i++) {
    samples[start + i] += noise[i] * level * Math.min(1, i / 9) * Math.exp(-decay * i / sampleRate);
  }
}

function variants(context: BaseAudioContext, durations: readonly number[], peak: number,
  render: (samples: Float32Array, variant: number) => void) {
  return durations.map((seconds, variant) => {
    const samples = new Float32Array(Math.round(seconds * sampleRate));
    render(samples, variant);
    return buffer(context, samples, peak, false);
  });
}

const engineBands = [
  { coast: [1, 0.65, 0.30, 0.46, 0.35, 0.29], power: [1, 1.20, 1.42, 1.10, 0.88, 0.67], noise: 0.12 },
  { coast: [0.88, 0.82, 0.48, 0.61, 0.46, 0.38], power: [0.84, 1.25, 1.50, 1.55, 1.20, 0.99], noise: 0.18 },
  { coast: [0.75, 0.72, 0.63, 0.55, 0.58, 0.48], power: [0.67, 1.02, 1.27, 1.56, 1.70, 1.55], noise: 0.24 },
];

export function buildEngineSamples(context: BaseAudioContext, roots: readonly number[], harmonics: readonly number[], seed: number) {
  return roots.map((root, band) => {
    const profile = engineBands[band];
    const render = (spectrum: readonly number[], loaded: boolean) => {
      const length = sampleRate / 2;
      const result = context.createBuffer(1, length, sampleRate);
      const channel = result.getChannelData(0);
      const noise = bandNoise(whiteNoise(length, seed + band * 101 + Number(loaded) * 487),
        loaded ? 420 : 180, (loaded ? 2400 : 1130) + band * 570, true);
      const partials = harmonics.map((amplitude, i) => amplitude * spectrum[i]);
      let energy = 0;
      for (let i = 0; i < length; i++) {
        const cycle = tau * i / length;
        // Roots are even integers, so a half-second loop ends on the same phase.
        const phase = root * cycle / 2 + 0.09 * Math.sin(7 * cycle + seed) + 0.04 * Math.sin(13 * cycle);
        const pulse = 0.62 + 0.38 * Math.cos(phase - 0.8);
        let value = noise[i] * pulse * profile.noise * (loaded ? 2.0 : 1);
        for (let h = 0; h < partials.length; h++) {
          value += partials[h] * Math.sin((h + 1) * phase + h * 0.27);
        }
        channel[i] = value;
        energy += value * value;
      }
      const gain = 0.27 / Math.sqrt(energy / length);
      for (let i = 0; i < length; i++) channel[i] *= gain;
      return result;
    };
    return { root, coast: render(profile.coast, false), power: render(profile.power, true) };
  });
}

export function buildAudioSamples(context: BaseAudioContext) {
  return {
    asphalt: loop(context, 2.25, 1417, 0.51, [
      [170, 670, 0.49, 3, 0.16], [720, 2650, 0.63, 5, 0.10], [2870, 6500, 0.18, 13, 0.11],
    ]),
    runoff: loop(context, 2.75, 3421, 0.55, [
      [115, 490, 0.65, 5, 0.21], [530, 2150, 0.81, 9, 0.21], [2500, 6200, 0.24, 17, 0.18],
    ], samples => grains(samples, 63, 70, 0.18, 2650, 0.007, 0.29)),
    water: loop(context, 5.25, 5179, 0.44, [
      [155, 770, 0.74, 3, 0.12], [900, 2480, 0.37, 7, 0.13], [2950, 5200, 0.14, 11, 0.07],
    ], samples => grains(samples, 781, 62, 0.106, 860, 0.044, 0.47)),
    crowd: loop(context, 5.75, 8167, 0.42, [
      [175, 590, 0.50, 4, 0.23], [570, 1270, 0.34, 7, 0.16], [1510, 2600, 0.08, 10, 0.13],
    ], murmurs),
    room: loop(context, 4.8, 2789, 0.38, [
      [41, 154, 0.71, 3, 0.10], [152, 635, 0.31, 4, 0.16], [690, 2000, 0.11, 7, 0.12],
    ], samples => {
      for (let i = 0; i < samples.length; i++) {
        const phase = tau * 50 * i / sampleRate;
        samples[i] += 0.010 * Math.sin(phase) + 0.007 * Math.sin(2 * phase + 0.61);
      }
    }),
    scrape: loop(context, 1.7, 4483, 0.50, [
      [355, 1050, 0.40, 7, 0.13], [950, 2620, 0.78, 17, 0.24], [2600, 6500, 0.32, 33, 0.24],
    ], samples => grains(samples, 96, 43, 0.092, 1850, 0.013, 0.28)),
    upshift: variants(context, [0.083, 0.092, 0.104], 0.65, (samples, i) => {
      // The contact climbs from a brief brush to a brighter locking click.
      strike(samples, 0, 1831 + i * 43, 760, 4300, 0.72, 176);
      strike(samples, 0.017 + i * 0.003, 137 + i * 79, 1700, 7650, 1, 278);
    }),
    downshift: variants(context, [0.108, 0.124, 0.136], 0.67, (samples, i) => {
      const catchTime = 0.026 + i * 0.005;
      strike(samples, 0, 2287 + i * 37, 1250, 5900, 0.54, 175);
      strike(samples, catchTime, 581 + i * 61, 285, 2550, 1.08, 120);
      strike(samples, catchTime + 0.019, 819 + i * 31, 630, 3200, 0.34, 204);
    }),
    curb: variants(context, [0.103, 0.117, 0.128, 0.112], 0.70, (samples, i) => {
      const second = 0.026 + i * 0.004;
      strike(samples, 0, 123 + i * 19, 580, 3900, 1.10, 128);
      ring(samples, 0, 578 + 53 * i, 0.46, 119, -820);
      ring(samples, 0, 1620 + 160 * i, 0.21, 164);
      strike(samples, second, 741 + i * 43, 420, 3150, 0.62, 171);
      ring(samples, second, 480 + 45 * i, 0.23, 141);
    }),
    deckJoint: variants(context, [0.115, 0.126, 0.14], 0.61, (samples, i) => {
      strike(samples, 0, 453 + i * 37, 125, 1800, 0.76, 100);
      ring(samples, 0, 212 + 18 * i, 0.63, 74, -170);
      ring(samples, 0.014, 338 + 22 * i, 0.28, 94);
    }),
    car: variants(context, [0.146, 0.168, 0.153, 0.182], 0.78, (samples, i) => {
      const echo = 0.018 + 0.004 * i;
      strike(samples, 0, 914 + 37 * i, 600, 7100, 0.99, 142);
      ring(samples, 0, 330 + 29 * i, 0.53, 88, -940);
      ring(samples, 0, 1270 + 131 * i, 0.39, 77);
      ring(samples, 0, 2810 - 105 * i, 0.27, 95);
      ring(samples, 0, 4580 - 208 * i, 0.09, 149);
      strike(samples, echo, 357 + 61 * i, 1050, 6700, 0.51, 146);
      ring(samples, echo, 1660 + 163 * i, 0.15, 89);
    }),
    wall: variants(context, [0.148, 0.161, 0.177], 0.77, (samples, i) => {
      strike(samples, 0, 346 + 29 * i, 200, 2600, 0.93, 115);
      ring(samples, 0, 189 + 25 * i, 0.64, 87, -430);
      ring(samples, 0, 575 + 54 * i, 0.25, 107);
      strike(samples, 0.027 + i * 0.005, 497 + i * 27, 250, 1750, 0.36, 138);
    }),
    fence: variants(context, [0.199, 0.243, 0.226], 0.74, (samples, i) => {
      strike(samples, 0, 181 + i * 43, 660, 7000, 0.88, 112);
      ring(samples, 0, 930 + 95 * i, 0.35, 59, -440);
      ring(samples, 0.004, 1640 + 146 * i, 0.44, 46, 220);
      ring(samples, 0.008, 2817 - 142 * i, 0.22, 57);
      strike(samples, 0.024 + i * 0.005, 509 + i * 53, 1050, 6300, 0.60, 117);
      strike(samples, 0.051 + i * 0.009, 804 + i * 57, 910, 5190, 0.37, 117);
    }),
    relay: variants(context, [0.103, 0.118], 0.65, (samples, i) => {
      strike(samples, 0, 912 + i * 91, 1160, 8100, 1.02, 219);
      ring(samples, 0, 730 + 115 * i, 0.41, 171);
      ring(samples, 0, 2470 + 172 * i, 0.24, 185);
      strike(samples, 0.019 + i * 0.008, 569 + i * 67, 1000, 6100, 0.46, 231);
    }),
    go: variants(context, [0.335, 0.371], 0.78, (samples, i) => {
      strike(samples, 0, 852 + i * 37, 970, 5100, 0.58, 168);
      const first = 562 + 23 * i;
      const second = 845 + 30 * i;
      ring(samples, 0.009, first, 0.51, 27);
      ring(samples, 0.011, first * 2.02, 0.11, 39);
      ring(samples, 0.086, second, 0.78, 19);
      ring(samples, 0.086, second * 2.02, 0.13, 33);
    }),
    finish: variants(context, [0.47, 0.52], 0.81, (samples, i) => {
      for (const [note, time] of [0, 0.116 + i * 0.013].entries()) {
        const hz = (note === 0 ? 1015 : 1353) + i * 44;
        strike(samples, time, 614 + i * 83 + note * 31, 1700, 6700, 0.34, 152);
        ring(samples, time, hz, 0.63, 13 + note * 2);
        ring(samples, time, hz * 1.51, 0.26, 21);
        ring(samples, time, hz * 2.32, 0.20, 29);
        ring(samples, time, hz * 3.74, 0.075, 48);
      }
    }),
  };
}
