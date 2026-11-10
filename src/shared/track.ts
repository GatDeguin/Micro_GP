export const ROAD_HALF = 39 / 16;
export const CURB_WIDTH = 0.34;
export const WALL_HALF = 53.5 / 16;
export const GRID_ROWS = [-2.18, -5.98] as const;
const BRIDGE_HEIGHT = 3.10;
const HAIRPIN_HALF = 3.25;

export const PIT_LANE = {
  entry: 3.2, full: 9.8, leave: 21.8, exit: 28, side: -1,
  offset: -4.48, halfWidth: 1.33, stalls: [12.7, 18.2], speedLimit: 5.1, stationOffset: -7.75,
} as const;

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

const start = [-3.75, 8.6875] as const;
const plan = [
  ['esses', [25.35, 8.6875]],
  ['essesMid', [30.40, 6.69], [27.55, 8.6875], [28.40, 7.69]],
  ['hairpin', [34.10, 4.12], [31.95, 5.915], [32.90, 5.49]],
  ['hairpinApex', [36.52, -2.13], [35.40, 2.57], [36.54, 0.38]],
  ['bridgeApproach', [31.15, -8.55], [36.49, -5.65], [34.10, -8.48]],
  ['rearLink', [24.60, -7.85], [28.65, -8.609], [27.35, -7.43]],
  ['rearBend', [12.95, -12.65], [20.90, -8.415], [17.18, -12.40]],
  ['crest', [2.65, -10.50], [8.73, -12.90], [7.09, -10.98]],
  ['backStraight', [-9.80, -10.20], [-1.40, -10.062], [-5.90, -10.20]],
  ['sweep', [-23.50, -10.20]],
  ['sweepApex', [-33.75, -1.40], [-29.45, -10.20], [-33.20, -6.31]],
  ['front', [-24.00, 8.6875], [-34.30, 3.51], [-30.17, 8.6875]],
  ['end', start],
] as const;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function smoothstep(value: number, from: number, to: number) {
  const t = clamp01((value - from) / (to - from));
  return t * t * (3 - 2 * t);
}

function buildTrack() {
  const raw = [{ x: start[0], z: start[1], s: 0 }] as { x: number; z: number; s: number }[];
  function append(x: number, z: number) {
    const last = raw[raw.length - 1];
    raw.push({ x, z, s: last.s + Math.hypot(x - last.x, z - last.z) });
  }

  const anchors = {} as Record<(typeof plan)[number][0], number>;
  for (const [key, [x, z], first, second] of plan) {
    const from = raw[raw.length - 1];
    if (first && second) {
      for (let i = 1; i <= 128; i++) {
        const t = i / 128;
        const u = 1 - t;
        append(
          u ** 3 * from.x + 3 * u * u * t * first[0] + 3 * u * t * t * second[0] + t ** 3 * x,
          u ** 3 * from.z + 3 * u * u * t * first[1] + 3 * u * t * t * second[1] + t ** 3 * z,
        );
      }
    } else {
      append(x, z);
    }
    anchors[key] = raw[raw.length - 1].s;
  }

  const length = anchors.end;
  const count = Math.ceil(length / 0.28);
  const spacing = length / count;
  function wrap(s: number) {
    const remainder = s % length;
    return remainder < 0 ? remainder + length : remainder;
  }

  function roadHalfAt(distance: number) {
    const s = wrap(distance);
    const widen = smoothstep(s, anchors.hairpin - 5.3, anchors.hairpinApex - 3.3);
    const narrow = 1 - smoothstep(s, anchors.hairpinApex + 4.0, anchors.bridgeApproach + 4.5);
    return ROAD_HALF + (HAIRPIN_HALF - ROAD_HALF) * widen * narrow;
  }

  function pitOpening(distance: number) {
    const s = wrap(distance);
    return smoothstep(s, PIT_LANE.entry, PIT_LANE.full) * (1 - smoothstep(s, PIT_LANE.leave, PIT_LANE.exit));
  }

  function pitRoadHalfAt(distance: number) {
    return mix(ROAD_HALF, -PIT_LANE.offset + PIT_LANE.halfWidth, pitOpening(distance));
  }

  function wallHalfAt(distance: number, side: number) {
    const extra = side < 0 ? (6.05 - WALL_HALF) * pitOpening(distance) : 0;
    return WALL_HALF + roadHalfAt(distance) - ROAD_HALF + extra;
  }

  function isPitLane(distance: number, offset: number) {
    return offset < -ROAD_HALF - 0.12 && offset >= -pitRoadHalfAt(distance);
  }

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
    const shorter = Math.min(...[-1, 1].map(side => {
      const a = side * wallHalfAt(from.s, side);
      const b = side * wallHalfAt(to.s, side);
      return Math.hypot(x - (to.dz * b - from.dz * a), z + (to.dx * b - from.dx * a));
    }));
    edgeDistance.push(edgeDistance[i - 1] + shorter);
  }

  const bridge = {
    from: anchors.essesMid - 0.8, crest: anchors.crest,
    to: anchors.sweepApex + 3.8, height: BRIDGE_HEIGHT,
  };
  function ramp(distance: number, from: number, to: number) {
    const low = edgeDistance[Math.round(from / spacing)];
    const high = edgeDistance[Math.round(to / spacing)];
    const t = clamp01((distance - low) / (high - low));
    // Rounded ends keep wheels settled and leave most of the ramp at a steady grade.
    const blend = 0.18;
    const eased = (end: number) => (end / 2 - blend * Math.sin(Math.PI * end / blend) / (2 * Math.PI)) / (1 - blend);
    if (t < blend) return eased(t);
    if (t > 1 - blend) return 1 - eased(1 - t);
    return (t - blend / 2) / (1 - blend);
  }

  for (let i = 0; i < count; i++) {
    const distance = edgeDistance[i];
    samples[i].y = BRIDGE_HEIGHT * ramp(distance, bridge.from, bridge.crest - 1.36)
      * (1 - ramp(distance, bridge.crest + 1.36, bridge.to));
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

  return { length, samples: samples as readonly TrackPoint[], anchors, bridge, sampleAt, locate, wrap,
    roadHalfAt, wallHalfAt, pitRoadHalfAt, isPitLane };
}

export const TRACK = buildTrack();
export const { roadHalfAt, wallHalfAt, pitRoadHalfAt, isPitLane } = TRACK;

export type SectorId = 'straight' | 'esses' | 'hairpin' | 'bridge' | 'back-straight' | 'sweep' | 'pit';

function sector(id: SectorId, name: string, from: number, to: number, at = (from + to) / 2, offset = 0) {
  const p = TRACK.sampleAt(at);
  return { id, name, from, to, cue: { x: p.x - p.dz * offset, y: p.y, z: p.z + p.dx * offset } };
}

const marks = TRACK.anchors;
const circuitSectors = [
  sector('straight', 'Recta principal', 0, marks.esses),
  sector('esses', 'Enlazadas del Taller', marks.esses, marks.hairpin),
  sector('hairpin', 'Horquilla', marks.hairpin, marks.bridgeApproach, marks.hairpinApex),
  sector('bridge', 'Puente del Arroyo', marks.bridgeApproach, marks.backStraight, marks.crest),
  sector('back-straight', 'Recta del Fondo', marks.backStraight, marks.sweep),
  sector('sweep', 'Curvón de Tribuna', marks.sweep, TRACK.length, marks.sweepApex),
];
const pitSector = sector('pit', 'Calle de boxes', PIT_LANE.entry, PIT_LANE.exit, PIT_LANE.stalls[1], PIT_LANE.offset);
export const TRACK_SECTORS = [...circuitSectors, pitSector] as const;

export function sectorAt(distance: number, offset = 0) {
  const s = TRACK.wrap(distance);
  if (isPitLane(s, offset)) return pitSector;
  return circuitSectors.find(candidate => s < candidate.to) ?? circuitSectors[0];
}
