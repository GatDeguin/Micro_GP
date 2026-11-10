export const ROAD_HALF = 39 / 16;
export const CURB_WIDTH = 0.34;
export const WALL_HALF = 53.5 / 16;
export const GRID_ROWS = [-2.18, -5.98] as const;
const BRIDGE_HEIGHT = 3.10;
const HAIRPIN_HALF = 3.25;
export const BRIDGE_DECK_DEPTH = 0.34;

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

export interface TrackHint {
  s?: number;
  y?: number;
}

const start = [-3.75, 8.6875] as const;
const crossingPoint = [-18.8, 2.30] as const;
const crossingSlope = 8.15 / 13.4;
const upperLineZ = (x: number) => crossingPoint[1] - (x - crossingPoint[0]) * crossingSlope;
const plan = [
  ['esses', [25.35, 8.6875]],
  ['essesMid', [30.40, 6.69], [27.55, 8.6875], [28.40, 7.69]],
  ['hairpin', [34.10, 4.12], [31.95, 5.915], [32.90, 5.49]],
  ['hairpinApex', [36.52, -2.13], [35.40, 2.57], [36.54, 0.38]],
  ['bridgeApproach', [31.15, -8.55], [36.49, -5.65], [34.10, -8.48]],
  ['rearLink', [24.60, -7.85], [28.65, -8.609], [27.35, -7.43]],
  ['rearBend', [12.95, -12.65], [20.90, -8.415], [17.18, -12.40]],
  ['crest', [2.65, -10.50], [8.73, -12.90], [7.08, -12.05]],
  ['backStraight', [-5.40, -5.85], [0.02, -9.58], [-2.85, upperLineZ(-2.85)]],
  ['upperCross', crossingPoint],
  ['upperExit', [-24.40, upperLineZ(-24.40)]],
  ['sweep', [-30.20, 8.10], [-26.43, upperLineZ(-26.43)], [-28.02, 8.30]],
  ['sweepApex', [-36.00, -0.95], [-34.15, 7.738], [-36.23, 3.15]],
  ['westBack', [-29.50, -13.20], [-35.75, -5.40], [-34.60, -12.90]],
  ['lowerLine', [-21.50, -8.50], [-25.03, -13.463], [-22.30, -11.70]],
  ['lowerCross', crossingPoint],
  ['front', [-10.62, 8.6875], [-17.8616, 6.0535], [-14.4891, 8.6875]],
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

  const crossing = {
    x: crossingPoint[0], z: crossingPoint[1], lower: anchors.lowerCross, upper: anchors.upperCross,
    lowerFrom: anchors.lowerCross - 5.25, lowerTo: anchors.lowerCross + 6.25,
    upperFrom: anchors.upperCross - 5.60, upperTo: anchors.upperCross + 5.60,
    clearance: BRIDGE_HEIGHT - BRIDGE_DECK_DEPTH,
  };
  const tunnel = {
    from: anchors.lowerCross - 11.00, archTo: anchors.lowerCross - 6.70,
    taperTo: anchors.lowerCross - 5.30, to: anchors.lowerCross - 2.06,
    clearance: 2.50, archClearance: 2.58,
  };
  const bridge = {
    from: anchors.essesMid - 0.8, crest: anchors.crest,
    to: anchors.lowerLine - 0.55, height: BRIDGE_HEIGHT,
  };
  function ramp(distance: number, from: number, to: number, blend: number) {
    const low = edgeDistance[Math.round(from / spacing)];
    const high = edgeDistance[Math.round(to / spacing)];
    const t = clamp01((distance - low) / (high - low));
    // Rounded ends keep wheels settled and leave most of the ramp at a steady grade.
    const eased = (end: number) => (end / 2 - blend * Math.sin(Math.PI * end / blend) / (2 * Math.PI)) / (1 - blend);
    if (t < blend) return eased(t);
    if (t > 1 - blend) return 1 - eased(1 - t);
    return (t - blend / 2) / (1 - blend);
  }

  for (let i = 0; i < count; i++) {
    const distance = edgeDistance[i];
    samples[i].y = BRIDGE_HEIGHT * ramp(distance, bridge.from, bridge.crest - 1.36, 0.18)
      * (1 - ramp(distance, crossing.upperTo + 0.18, bridge.to, 0.09));
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

  function locate(x: number, z: number, hint?: TrackHint): TrackLocation {
    let closestDistance = Infinity;
    let closestIndex = 0;
    let closestT = 0;
    let closestHeight = Infinity;
    function scan(first: number, size: number, preferredY?: number) {
      closestDistance = closestHeight = Infinity;
      for (let j = 0; j < size; j++) {
        const i = (first + j + count) % count;
        const segment = segments[i];
        const a = samples[i];
        const b = samples[(i + 1) % count];
        const xFromStart = x - a.x;
        const zFromStart = z - a.z;
        const t = clamp01((xFromStart * segment.x + zFromStart * segment.z) * segment.invLengthSquared);
        const dx = xFromStart - segment.x * t;
        const dz = zFromStart - segment.z * t;
        const y = mix(a.y, b.y, t);
        const vertical = preferredY === undefined ? 0 : 2.7 * (y - preferredY) ** 2;
        const distance = dx * dx + dz * dz + vertical;
        if (distance < closestDistance - 0.000001 || (Math.abs(distance - closestDistance) <= 0.000001 && y < closestHeight)) {
          closestDistance = distance;
          closestHeight = y;
          closestIndex = i;
          closestT = t;
        }
      }
    }

    function location() {
      const point = interpolate(closestIndex, closestT, wrap((closestIndex + closestT) * spacing));
      return { ...point, offset: (z - point.z) * point.dx - (x - point.x) * point.dz };
    }

    let preferredY = hint?.y;
    if (hint?.s !== undefined && Number.isFinite(hint.s)) {
      // Use the previous branch while the vehicle remains near it, including both levels of the crossing.
      const radius = Math.ceil(13 / spacing);
      const first = Math.floor(wrap(hint.s) / spacing) - radius;
      scan(first, 2 * radius + 1);
      const local = location();
      const maxOffset = wallHalfAt(local.s, Math.sign(local.offset)) + 1.8;
      const step = (closestIndex - first + count) % count;
      if (step > 0 && step < 2 * radius && closestDistance <= maxOffset * maxOffset) return local;
      preferredY ??= sampleAt(hint.s).y;
    }
    scan(0, count, preferredY);
    return location();
  }

  return { length, samples: samples as readonly TrackPoint[], anchors, bridge, crossing, tunnel, sampleAt, locate, wrap,
    roadHalfAt, wallHalfAt, pitRoadHalfAt, isPitLane };
}

export const TRACK = buildTrack();
export const { roadHalfAt, wallHalfAt, pitRoadHalfAt, isPitLane } = TRACK;

export type SectorId = 'straight' | 'esses' | 'hairpin' | 'bridge' | 'back-straight' | 'sweep' | 'pit' | 'underpass' | 'tunnel';

function sector(id: SectorId, name: string, from: number, to: number, at = (from + to) / 2, offset = 0) {
  const p = TRACK.sampleAt(at);
  return { id, name, from, to, cue: { x: p.x - p.dz * offset, y: p.y, z: p.z + p.dx * offset } };
}

const marks = TRACK.anchors;
const circuitSectors = [
  sector('straight', 'Recta principal', 0, marks.esses),
  sector('esses', 'Enlazadas del Taller', marks.esses, marks.hairpin),
  sector('hairpin', 'Horquilla', marks.hairpin, marks.bridgeApproach, marks.hairpinApex),
  sector('bridge', 'Puente del Arroyo', marks.bridgeApproach, TRACK.crossing.upperTo, marks.crest),
  sector('back-straight', 'Recta elevada', TRACK.crossing.upperTo, marks.sweep),
  sector('sweep', 'Curvón de Tribuna', marks.sweep, TRACK.length, marks.sweepApex),
];
const pitSector = sector('pit', 'Calle de boxes', PIT_LANE.entry, PIT_LANE.exit, PIT_LANE.stalls[1], PIT_LANE.offset);
const underpass = sector('underpass', 'Paso bajo el puente', TRACK.crossing.lowerFrom, TRACK.crossing.lowerTo, TRACK.crossing.lower);
const tunnelSector = sector('tunnel', 'Túnel del Taller', TRACK.tunnel.from, TRACK.tunnel.to);
export const TRACK_SECTORS = [...circuitSectors, pitSector, underpass, tunnelSector] as const;

export function sectorAt(distance: number, offset = 0) {
  const s = TRACK.wrap(distance);
  if (isPitLane(s, offset)) return pitSector;
  if (s >= tunnelSector.from && s <= tunnelSector.to) return tunnelSector;
  if (s >= underpass.from && s <= underpass.to) return underpass;
  return circuitSectors.find(candidate => s < candidate.to) ?? circuitSectors[0];
}
