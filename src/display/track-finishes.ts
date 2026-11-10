import * as THREE from 'three';
import { GRID_LANE_OFFSET } from '../shared/car-dimensions';
import { GRID_ROWS, ROAD_HALF, TRACK, roadHalfAt } from '../shared/track';
import { canvas2d, noiseField, random, texture } from './materials';

export function alongTrack(map: THREE.Texture) {
  map.repeat.x = 1 / (1.48 * TRACK.length);
  map.wrapS = THREE.RepeatWrapping;
  return map;
}

export function asphaltMaps() {
  const road = canvas2d(3072, 192);
  const relief = canvas2d(road.canvas.width, road.canvas.height);
  const { width, height } = road.canvas;
  const rng = random(361);
  const binder = noiseField(83, 7, rng);
  const brushMarks = noiseField(29, 113, rng);
  const aggregate = noiseField(928, 154, rng);
  const albedo = road.context.createImageData(width, height);
  const roughness = relief.context.createImageData(width, height);

  for (let y = 0; y < height; y++) {
    const v = y / height;
    for (let x = 0; x < width; x++) {
      const u = x / width;
      const patch = binder(u, v);
      const brushed = brushMarks(u, v + 0.018 * patch);
      const grit = aggregate(u, v);
      const fleck = rng();
      const shade = 211 + (patch - 0.5) * 16 + (brushed - 0.5) * 22 + (grit - 0.5) * 35 + (fleck - 0.5) * 38;
      const i = (y * width + x) * 4;
      albedo.data[i] = shade - 3;
      albedo.data[i + 1] = shade;
      albedo.data[i + 2] = shade + 3;
      albedo.data[i + 3] = 255;
      roughness.data[i] = roughness.data[i + 1] = roughness.data[i + 2] = 189 + 29 * patch + 21 * brushed + grit * 8;
      roughness.data[i + 3] = 255;
    }
  }
  road.context.putImageData(albedo, 0, 0);
  relief.context.putImageData(roughness, 0, 0);

  const toX = (s: number) => s / TRACK.length * width;
  const toY = (offset: number, s: number) => (0.5 - offset / (2 * roadHalfAt(s))) * height;
  const mark = TRACK.anchors;
  const clusters = [
    [17.6, 5.4, -0.26, 0.25], [mark.esses - 3.8, 5.4, -0.83, 0.24],
    [mark.hairpin - 2.0, 8.5, -1.27, 0.24], [mark.hairpin - 1.2, 9.6, 1.30, -0.20],
    [mark.hairpinApex + 0.5, 6.9, -1.01, 0.42], [mark.hairpinApex + 1.3, 7.8, 1.18, -0.44],
    [mark.rearLink - 1.6, 5.4, -0.73, 0.19], [mark.rearBend - 4.0, 4.8, 0.83, -0.38],
    [mark.crest - 8.2, 5.3, -0.34, -0.55], [mark.sweep - 3.1, 5.9, -0.98, 0.31],
    [mark.chicaneEntry - 1.7, 4.7, -0.87, 0.63], [mark.chicaneApexIn + 0.45, 5.4, 0.72, -0.83],
    [mark.chicaneApexOut - 1.26, 6.0, -0.77, 0.64], [mark.sweepApex - 6.8, 6.5, -0.72, 0.53],
    [mark.sweepApex - 1.55, 7.6, 0.92, -0.44],
  ];
  for (const [start, span, offset, drift] of clusters) {
    for (let pass = 0; pass < 5; pass++) {
      const from = start + rng() * 1.6;
      const length = span * (0.47 + rng() * 0.47);
      const begin = toX(from);
      const end = toX(from + length);
      const lane = offset + (rng() - 0.5) * 0.58;
      for (const side of [-1, 1]) {
        const tire = lane + side * 0.36;
        const stroke = 0.049 + rng() * 0.044;
        const strength = 0.11 + rng() * 0.13;
        for (const [context, color] of [[road.context, '32,27,27'], [relief.context, '128,128,128']] as const) {
          const fade = context.createLinearGradient(begin, 0, end, 0);
          fade.addColorStop(0, `rgba(${color},0)`);
          fade.addColorStop(0.34, `rgba(${color},${strength})`);
          fade.addColorStop(0.71, `rgba(${color},${strength * 0.66})`);
          fade.addColorStop(1, `rgba(${color},0)`);
          context.strokeStyle = fade;
          context.lineWidth = stroke / (2 * roadHalfAt(from + length / 2)) * height;
          context.lineCap = 'round';
          context.beginPath();
          context.moveTo(begin, toY(tire, from));
          context.bezierCurveTo(begin + (end - begin) * 0.34, toY(tire + drift * 0.19, from + length * 0.34),
            begin + (end - begin) * 0.63, toY(tire + drift * 0.70, from + length * 0.63), end, toY(tire + drift, from + length));
          context.stroke();
        }
      }
    }
  }

  for (const [s, offset, length, turn] of [[mark.esses + 1.7, 0.69, 1.84, -0.36],
    [mark.chicaneApexIn - 1.66, -0.94, 1.55, 0.62], [mark.chicaneApexOut + 1.24, 1.22, 1.29, -0.45],
    [mark.sweepApex - 5.16, -1.37, 2.20, 0.64]]) {
    const x = toX(s);
    const end = toX(s + length);
    for (const [context, strength] of [[road.context, 0.29], [relief.context, 0.17]] as const) {
      const fade = context.createLinearGradient(x, 0, end, 0);
      fade.addColorStop(0, 'rgba(32,29,28,0)');
      fade.addColorStop(0.32, `rgba(32,29,28,${strength})`);
      fade.addColorStop(1, 'rgba(32,29,28,0)');
      context.strokeStyle = fade;
      context.lineWidth = 0.72;
      context.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const shift = (i - 1) * 0.052;
        context.beginPath();
        context.moveTo(x + i * 0.66, toY(offset + shift, s));
        context.quadraticCurveTo(x + (end - x) * 0.56, toY(offset + turn * 0.12 + shift, s + length * 0.56),
          end - i * 0.54, toY(offset + turn + shift, s + length));
        context.stroke();
      }
    }
  }

  const rough = alongTrack(texture(relief.canvas));
  rough.colorSpace = THREE.NoColorSpace;
  return { color: alongTrack(texture(road.canvas)), rough };
}

export function asphaltRelief() {
  const { canvas, context } = canvas2d(256, 256);
  const rng = random(537);
  const pixels = context.createImageData(canvas.width, canvas.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const base = 128 + rng() * 32;
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = base;
    pixels.data[i + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  for (let i = 0; i < 5600; i++) {
    const x = rng() * canvas.width;
    const y = rng() * canvas.height;
    const radius = 0.43 + 1.58 * rng() ** 2;
    const height = Math.floor(82 + 130 * rng());
    context.fillStyle = `rgb(${height},${height},${height})`;
    context.beginPath();
    context.ellipse(x, y, radius, radius * (0.62 + rng() * 0.38), rng() * Math.PI, 0, Math.PI * 2);
    context.fill();
  }
  const map = texture(canvas);
  map.colorSpace = THREE.NoColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.channel = 1;
  return map;
}

export function kerbPaintMap() {
  const { canvas, context } = canvas2d(256, 256);
  const rng = random(1907);
  const wear = noiseField(21, 19, rng);
  const pixels = context.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const p = wear(x / canvas.width, y / canvas.height);
      const speck = rng();
      const shade = 241 + (p - 0.5) * 15 + (speck - 0.5) * 10 - Math.max(0, p + speck - 1.56) * 18;
      const i = (y * canvas.width + x) * 4;
      pixels.data[i] = shade + 1;
      pixels.data[i + 1] = shade;
      pixels.data[i + 2] = shade - 1;
      pixels.data[i + 3] = 255;
    }
  }
  context.putImageData(pixels, 0, 0);
  for (let i = 0; i < 49; i++) {
    const x = rng() * canvas.width;
    const y = rng() * canvas.height;
    const length = 1 + 8 * rng() ** 2;
    context.strokeStyle = i % 4 ? 'rgba(138,132,127,.18)' : 'rgba(255,254,244,.27)';
    context.lineWidth = 0.58 + rng() * 0.42;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + length, y + (rng() - 0.5) * length * 0.42);
    context.stroke();
  }
  const map = texture(canvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  return map;
}

export function runoffMap(kind: 'grass' | 'escape' | 'gravel' = 'grass') {
  const { canvas, context } = canvas2d(1536, 72);
  const rng = random(kind === 'grass' ? 831 : kind === 'gravel' ? 3167 : 6501);
  const paint = noiseField(48, 5, rng);
  const abrasion = noiseField(163, 24, rng);
  const pixels = context.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const u = x / canvas.width;
      const v = y / canvas.height;
      const grain = abrasion(u, v);
      const flake = Math.max(0, (grain - 0.70) * 2.12) * (0.43 + 0.57 * rng());
      const roller = 0.5 + 0.5 * Math.sin(v * 9.0 + 1.3 * paint(u, v));
      const worn = paint(u, v) * 25 + 12 * roller + 9 * (rng() - 0.5);
      const i = (y * canvas.width + x) * 4;
      if (kind === 'grass') {
        pixels.data[i] = 49 + worn + 67 * flake;
        pixels.data[i + 1] = 103 + worn + 29 * flake;
        pixels.data[i + 2] = 39 + worn * 0.68 + 22 * flake;
      } else if (kind === 'gravel') {
        const stone = (grain - 0.5) * 57 + 22 * (rng() - 0.5) + 45 * flake + 0.44 * worn;
        pixels.data[i] = 146 + stone;
        pixels.data[i + 1] = 125 + stone;
        pixels.data[i + 2] = 91 + stone * 0.81;
      } else {
        const edge = Math.min(y, canvas.height - 1 - y);
        const dashes = edge >= 4 && edge < 7 && x % 15 < 8 ? 29 : 0;
        const aggregate = (grain - 0.5) * 24 + worn * 0.64 + dashes;
        pixels.data[i] = 87 + aggregate;
        pixels.data[i + 1] = 92 + aggregate;
        pixels.data[i + 2] = 89 + aggregate;
      }
      pixels.data[i + 3] = 255;
    }
  }
  context.putImageData(pixels, 0, 0);
  return alongTrack(texture(canvas));
}

export function gridMap() {
  const { canvas, context } = canvas2d(1024, 1280);
  const width = ROAD_HALF * 2;
  const spacing = GRID_ROWS[0] - GRID_ROWS[1];
  const rows = [[GRID_LANE_OFFSET, GRID_ROWS[0] + 1.15, 4], [-GRID_LANE_OFFSET, GRID_ROWS[0] - 0.63, 3]];
  const from = Math.min(...rows.map(([, first, count]) => first - (count - 1) * spacing)) - 0.75;
  const to = 0.82;
  const depth = to - from;
  const rect = (x: number, z: number, w: number, d: number) => {
    context.fillRect((0.5 + x / width) * canvas.width, ((z - from) / depth) * canvas.height,
      w / width * canvas.width, d / depth * canvas.height);
  };
  const tile = width / 12;
  for (let across = 0; across < 12; across++) {
    for (let column = 0; column < 2; column++) {
      context.fillStyle = (across + column) % 2 === 0 ? '#eee4ce' : '#25262a';
      rect(-ROAD_HALF + across * tile, (column - 1) * tile, tile + 0.003, tile + 0.003);
    }
  }
  for (const [lane, first, count] of rows) {
    for (let i = 0; i < count; i++) {
      const s = first - i * spacing;
      const span = 0.91;
      const ink = 0.051;
      context.fillStyle = i < 2 ? '#dfd6bc' : '#d2c7ab';
      rect(lane - span / 2, s + 0.28, span, ink);
      for (const side of [-1, 1]) rect(lane + side * (span / 2 - ink / 2) - ink / 2, s - 0.35, ink, 0.67);
    }
  }

  const rng = random(783);
  const mask = context.getImageData(0, 0, canvas.width, canvas.height);
  const rowBytes = canvas.width * 4;
  const smoothWear = noiseField(71, 93, rng);
  for (let y = 1; y < canvas.height - 1; y++) {
    for (let x = 1; x < canvas.width - 1; x++) {
      const i = y * rowBytes + x * 4;
      if (mask.data[i + 3] < 100) continue;
      const wear = smoothWear(x / canvas.width, y / canvas.height);
      const speckle = rng();
      const edge = mask.data[i - 1] < 128 || mask.data[i + 7] < 128 || mask.data[i - rowBytes + 3] < 128;
      const abrasion = speckle < 0.039 + (edge ? 0.16 : 0.048) * wear;
      if (abrasion) mask.data[i + 3] = 54 + speckle * 138;
      const shade = 1 - (0.03 + wear * 0.12) * rng();
      for (let c = 0; c < 3; c++) mask.data[i + c] *= shade;
    }
  }
  context.putImageData(mask, 0, 0);
  return { map: texture(canvas), depth, center: (from + to) / 2 };
}
