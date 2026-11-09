export const ROAD_HALF = 39 / 16;
export const CURB_WIDTH = 0.34;
export const WALL_HALF = 53.5 / 16;
export const GRID_ROWS = [-2.18, -5.98] as const;
const BRIDGE_HEIGHT = 2.15;

export interface TrackPoint {
  x: number;
  y: number;
  z: number;
  s: number;
  dx: number;
  dz: number;
}

export interface TrackLocation extends TrackPoint {
  offset: number;
}

const curves = [
  // The short counter-curve gives the hairpin its stepped entry from the front straight.
  [686.3, 364, 726.6, 360.1, 755.7, 332.2],
  [778.5, 310.3, 807.0, 305.7, 831.0, 301.6],
  [865.2, 295.8, 891.8, 272.6, 896.3, 237.9],
  [906.3, 159.9, 864.9, 134.2, 815.9, 129.2],
  [768.9, 124.4, 735.3, 103.9, 702.3, 76.9],
  [659.3, 41.7, 599.1, 45.7, 548.1, 69.7],
  [501.1, 91.8, 466.8, 120.3, 432.8, 119.2],
  [396.8, 118.0, 370.8, 103.6, 335.8, 88.8],
  [297.8, 72.8, 265.3, 71.9, 224.3, 83.6],
  [159.3, 102.2, 108.1, 159.1, 104.8, 222.1],
  [101.2, 290.8, 120.3, 321.1, 176.8, 344.1],
  [213.7, 359.1, 250.5, 364, 298.5, 364],
];

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function buildTrack() {
  const raw = [{ x: -3.75, z: 8.6875, s: 0 }];
  function append(planX: number, planY: number) {
    const x = (planX - 500) / 16;
    const z = (planY - 225) / 16;
    const last = raw[raw.length - 1];
    raw.push({ x, z, s: last.s + Math.hypot(x - last.x, z - last.z) });
  }

  let startX = 645.5;
  let startY = 364;
  append(startX, startY);
  for (const [ax, ay, bx, by, endX, endY] of curves) {
    for (let i = 1; i <= 96; i++) {
      const t = i / 96;
      const u = 1 - t;
      append(
        u ** 3 * startX + 3 * u * u * t * ax + 3 * u * t * t * bx + t ** 3 * endX,
        u ** 3 * startY + 3 * u * u * t * ay + 3 * u * t * t * by + t ** 3 * endY,
      );
    }
    startX = endX;
    startY = endY;
  }
  append(440, 364);

  const length = raw[raw.length - 1].s;
  const count = Math.ceil(length / 0.28);
  const spacing = length / count;
  const samples: TrackPoint[] = [];
  let cursor = 1;
  for (let i = 0; i < count; i++) {
    const s = i * spacing;
    while (raw[cursor].s < s) cursor++;
    const from = raw[cursor - 1];
    const to = raw[cursor];
    const t = (s - from.s) / (to.s - from.s);
    samples.push({ x: mix(from.x, to.x, t), z: mix(from.z, to.z, t), s, y: 0, dx: 0, dz: 0 });
  }

  for (let i = 0; i < count; i++) {
    const from = samples[(i + count - 1) % count];
    const to = samples[(i + 1) % count];
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const magnitude = Math.hypot(dx, dz);
    samples[i].dx = dx / magnitude;
    samples[i].dz = dz / magnitude;
  }

  // Use the tighter edge of each cross-section to limit the grade across the full track width.
  const edgeDistance = [0];
  for (let i = 1; i < count; i++) {
    const from = samples[i - 1];
    const to = samples[i];
    const x = to.x - from.x;
    const z = to.z - from.z;
    const nx = (to.dz - from.dz) * WALL_HALF;
    const nz = (to.dx - from.dx) * WALL_HALF;
    const shorter = Math.min(Math.hypot(x - nx, z + nz), Math.hypot(x + nx, z - nz));
    edgeDistance.push(edgeDistance[i - 1] + shorter);
  }

  function ramp(distance: number, from: number, to: number) {
    const low = edgeDistance[Math.round(from / spacing)];
    const high = edgeDistance[Math.round(to / spacing)];
    const t = clamp01((distance - low) / (high - low));
    return t * t * (3 - 2 * t);
  }

  for (let i = 0; i < count; i++) {
    const distance = edgeDistance[i];
    samples[i].y = BRIDGE_HEIGHT * ramp(distance, 8.3, 54.3) * (1 - ramp(distance, 57.6, 94.5));
  }

  function wrap(s: number) {
    const remainder = s % length;
    return remainder < 0 ? remainder + length : remainder;
  }

  function interpolate(index: number, t: number, s: number): TrackPoint {
    const from = samples[index];
    const to = samples[(index + 1) % count];
    const dx = mix(from.dx, to.dx, t);
    const dz = mix(from.dz, to.dz, t);
    const magnitude = Math.hypot(dx, dz);
    return {
      x: mix(from.x, to.x, t), y: mix(from.y, to.y, t), z: mix(from.z, to.z, t),
      s, dx: dx / magnitude, dz: dz / magnitude,
    };
  }

  function sampleAt(distance: number): TrackPoint {
    const s = wrap(distance);
    const position = s / spacing;
    const index = Math.min(count - 1, Math.floor(position));
    return interpolate(index, position - index, s);
  }

  const segments = samples.map((from, i) => {
    const to = samples[(i + 1) % count];
    const x = to.x - from.x;
    const z = to.z - from.z;
    return { x, z, invLengthSquared: 1 / (x * x + z * z) };
  });

  function locate(x: number, z: number): TrackLocation {
    let closestDistance = Infinity;
    let closestIndex = 0;
    let closestT = 0;
    for (let i = 0; i < count; i++) {
      const segment = segments[i];
      const xFromStart = x - samples[i].x;
      const zFromStart = z - samples[i].z;
      const t = clamp01((xFromStart * segment.x + zFromStart * segment.z) * segment.invLengthSquared);
      const dx = xFromStart - segment.x * t;
      const dz = zFromStart - segment.z * t;
      const squaredDistance = dx * dx + dz * dz;
      if (squaredDistance < closestDistance) {
        closestDistance = squaredDistance;
        closestIndex = i;
        closestT = t;
      }
    }
    const point = interpolate(closestIndex, closestT, wrap((closestIndex + closestT) * spacing));
    return { ...point, offset: (z - point.z) * point.dx - (x - point.x) * point.dz };
  }

  return { length, samples: samples as readonly TrackPoint[], sampleAt, locate };
}

export const TRACK = buildTrack();
