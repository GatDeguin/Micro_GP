import { safetyPanelSpacing } from './safety.ts';
import { CURB_WIDTH, TRACK, type SectorId, type TrackHint, type TrackLocation, type TrackPoint, type TrackSurface } from './track.ts';
import type { Course, CourseSector } from './courses.ts';

type PlanPoint = readonly [number, number];
type PlanSection = readonly [PlanPoint] | readonly [PlanPoint, PlanPoint, PlanPoint];

const start = [55, 157] as const;
// End point first, followed by the cubic Bézier handles where the plan uses a bend.
const dockPlan: readonly PlanSection[] = [
  [[222, 157]],
  [[224, 112], [262, 157], [270, 112]],
];
const closedRoad: readonly PlanSection[] = [
  [[207, 112]],
  [[180, 101], [194, 112], [192, 101]],
];
const bypassApproach: readonly PlanSection[] = [
  [[203.42, 94], [211, 112], [203.42, 107]],
  [[203.42, 83]],
  [[210.8, 70], [203.42, 77], [210.8, 76]],
];
const bypassTurn: PlanSection = [[186.5, 70], [210.8, 51.8], [186.5, 51.8]];
const bypass: readonly PlanSection[] = [
  ...bypassApproach, bypassTurn,
  [[182.6, 86.5], [186.5, 77.5], [182.6, 81]],
  [[185.5, 95.5], [182.6, 89.8], [185.5, 92.1]],
  [[180, 101], [185.5, 98.54], [183.04, 101]],
];
const returnPlan: readonly PlanSection[] = [
  [[151, 114], [168, 101], [165, 114]],
  [[112, 88], [134, 114], [125, 102]],
  [[83, 57]],
  [[73, 20], [72, 45], [62, 29]],
  [[147, 13], [88, 8], [117, 8]],
  [[186, 35], [170, 17], [191, 23]],
  [[138, 53], [182, 45], [169, 52]],
  [[91, 53], [122, 53.5], [105, 53]],
  [[55, 53]],
  [[18, 82], [29, 53], [18, 61]],
  [[18, 125]],
  [start, [18, 146], [30, 157]],
];

const originalLength = TRACK.length * 4;
const startX = -3.75;
const startZ = 8.6875;
const pit = {
  entry: 12, full: 33, leave: 99, exit: 118, side: -1, offset: -5.15, halfWidth: 1.6,
  stalls: [36, 49, 62, 75], stationOffset: -8.2, speedLimit: 5.1,
} as const;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const mix = (from: number, to: number, amount: number) => from + (to - from) * amount;

function smooth(value: number, from: number, to: number) {
  const t = clamp01((value - from) / (to - from));
  return t * t * (3 - 2 * t);
}

function band(value: number, begin: number, full: number, leave: number, end: number) {
  return smooth(value, begin, full) * (1 - smooth(value, leave, end));
}

function wrap(distance: number) {
  const remainder = distance % length;
  return remainder < 0 ? remainder + length : remainder;
}

function tracePlan(plan: readonly PlanSection[]) {
  const points = [{ x: start[0] as number, z: start[1] as number, s: 0 }];
  const ends: number[] = [];
  function append(x: number, z: number) {
    const previous = points[points.length - 1];
    points.push({ x, z, s: previous.s + Math.hypot(x - previous.x, z - previous.z) });
  }
  for (const [[x, z], first, second] of plan) {
    const from = points[points.length - 1];
    if (first && second) {
      for (let i = 1; i <= 384; i++) {
        const t = i / 384;
        const u = 1 - t;
        append(u ** 3 * from.x + 3 * u * u * t * first[0] + 3 * u * t * t * second[0] + t ** 3 * x,
          u ** 3 * from.z + 3 * u * u * t * first[1] + 3 * u * t * t * second[1] + t ** 3 * z);
      }
    } else append(x, z);
    ends.push(points[points.length - 1].s);
  }
  return { points, ends };
}

const original = tracePlan([...dockPlan, ...closedRoad, ...returnPlan]);
const route = tracePlan([...dockPlan, ...bypass, ...returnPlan]);
const scale = originalLength / original.ends[original.ends.length - 1];
const detourFrom = route.ends[dockPlan.length - 1] * scale;
const detourTo = route.ends[dockPlan.length + bypass.length - 1] * scale;
const originalDetourTo = original.ends[dockPlan.length + closedRoad.length - 1] * scale;
const extraLength = detourTo - originalDetourTo;
const length = originalLength + extraLength;
const count = Math.ceil(length / 0.39);
const spacing = length / count;

/** Maps a station on the original plan to the current race arc. Replaced stations map by fraction of the bypass. */
export function diqueRoadDistance(originalDistance: number) {
  if (originalDistance <= detourFrom) return originalDistance;
  if (originalDistance >= originalDetourTo) return originalDistance + extraLength;
  return mix(detourFrom, detourTo, (originalDistance - detourFrom) / (originalDetourTo - detourFrom));
}

function originalRoadDistance(distance: number) {
  if (distance <= detourFrom) return distance;
  if (distance >= detourTo) return distance - extraLength;
  return mix(detourFrom, originalDetourTo, (distance - detourFrom) / (detourTo - detourFrom));
}

export function diquePlanPoint(x: number, z: number) {
  return { x: (x - start[0]) * scale + startX, z: (z - start[1]) * scale + startZ };
}

const elevations = [
  [0, 0], [297, 0], [361, 4.8], [385, 4.8], [422, 6.1], [465, 6.1],
  [522, 0.8], [580, -0.7], [632, -0.7], [667, 0], [originalLength, 0],
] as const;

function nominalHeight(distance: number) {
  const s = originalRoadDistance(distance);
  for (let i = 1; i < elevations.length; i++) {
    const [to, high] = elevations[i];
    if (s > to) continue;
    const [from, low] = elevations[i - 1];
    return mix(low, high, smooth(s, from, to));
  }
  return 0;
}

function pointOnTrace(trace: typeof original.points, s: number) {
  const distance = s / scale;
  let low = 0;
  let high = trace.length - 1;
  while (low + 1 < high) {
    const middle = (low + high) >> 1;
    if (trace[middle].s < distance) low = middle;
    else high = middle;
  }
  const from = trace[low];
  const to = trace[high];
  const fraction = clamp01((distance - from.s) / (to.s - from.s));
  return diquePlanPoint(mix(from.x, to.x, fraction), mix(from.z, to.z, fraction));
}

const samples: TrackPoint[] = [];
for (let i = 0; i < count; i++) {
  const s = i * spacing;
  samples.push({ ...pointOnTrace(route.points, s), y: nominalHeight(s), s, dx: 0, dz: 0 });
}

for (let i = 0; i < count; i++) {
  const before = samples[(i + count - 1) % count];
  const after = samples[(i + 1) % count];
  const dx = after.x - before.x;
  const dz = after.z - before.z;
  const magnitude = Math.hypot(dx, dz);
  Object.assign(samples[i], { dx: dx / magnitude, dz: dz / magnitude });
}

const closedCount = Math.ceil((originalDetourTo - detourFrom) / 0.39);
const closedSamples: readonly TrackPoint[] = Array.from({ length: closedCount + 1 }, (_, index) => {
  const s = mix(detourFrom, originalDetourTo, index / closedCount);
  const before = pointOnTrace(original.points, s - .18);
  const after = pointOnTrace(original.points, s + .18);
  const dx = after.x - before.x;
  const dz = after.z - before.z;
  const magnitude = Math.hypot(dx, dz);
  return { ...pointOnTrace(original.points, s), y: 0, s, dx: dx / magnitude, dz: dz / magnitude };
});
const turnStart = route.ends[dockPlan.length + bypassApproach.length - 1] * scale;
const turnEnd = route.ends[dockPlan.length + bypassApproach.length] * scale;
const detour = { from: detourFrom, to: detourTo, apex: (turnStart + turnEnd) * .5, closedSamples };

function interpolate(index: number, t: number, s: number): TrackPoint {
  const from = samples[index];
  const to = samples[(index + 1) % count];
  const dx = mix(from.dx, to.dx, t);
  const dz = mix(from.dz, to.dz, t);
  const magnitude = Math.hypot(dx, dz);
  return { x: mix(from.x, to.x, t), y: nominalHeight(s), z: mix(from.z, to.z, t), s, dx: dx / magnitude, dz: dz / magnitude };
}

function sampleAt(distance: number) {
  const s = wrap(distance);
  const index = Math.min(count - 1, Math.floor(s / spacing));
  return interpolate(index, s / spacing - index, s);
}

const segments = samples.map((from, i) => {
  const to = samples[(i + 1) % count];
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  return { dx, dz, inverseSquaredLength: 1 / (dx * dx + dz * dz) };
});

function locate(x: number, z: number, hint?: TrackHint): TrackLocation {
  function nearest(first: number, size: number, preferredY?: number) {
    let best = { index: first, fraction: 0, metric: Infinity, height: Infinity };
    for (let step = 0; step < size; step++) {
      const index = (first + step + count) % count;
      const start = samples[index];
      const segment = segments[index];
      const x0 = x - start.x;
      const z0 = z - start.z;
      const fraction = clamp01((x0 * segment.dx + z0 * segment.dz) * segment.inverseSquaredLength);
      const lateralX = x0 - fraction * segment.dx;
      const lateralZ = z0 - fraction * segment.dz;
      const height = mix(start.y, samples[(index + 1) % count].y, fraction);
      const vertical = preferredY === undefined ? 0 : 2.7 * (height - preferredY) ** 2;
      const metric = lateralX * lateralX + lateralZ * lateralZ + vertical;
      if (metric < best.metric - 1e-8 || (Math.abs(metric - best.metric) <= 1e-8 && height < best.height)) {
        best = { index, fraction, metric, height };
      }
    }
    const point = interpolate(best.index, best.fraction, wrap((best.index + best.fraction) * spacing));
    return { best, position: { ...point, offset: (z - point.z) * point.dx - (x - point.x) * point.dz } };
  }

  let preferredY = hint?.y;
  if (hint?.s !== undefined && Number.isFinite(hint.s)) {
    const radius = Math.ceil(14 / spacing);
    const first = Math.floor(wrap(hint.s) / spacing) - radius;
    const { best, position } = nearest(first, 2 * radius + 1);
    const distance = wallHalfAt(position.s, Math.sign(position.offset)) + 1.8;
    const index = (best.index - first + count) % count;
    if (index > 0 && index < 2 * radius && best.metric <= distance * distance) return position;
    preferredY ??= sampleAt(hint.s).y;
  }
  return nearest(0, count, preferredY).position;
}

function findCrossing() {
  // The plan places the crossover on the western return and the diagonal deck.
  const upperEnd = diqueRoadDistance(385);
  const lowerBegin = Math.floor(diqueRoadDistance(580) / spacing);
  const lowerEnd = diqueRoadDistance(632);
  for (let i = Math.floor(diqueRoadDistance(361) / spacing); samples[i].s < upperEnd; i++) {
    const upper = samples[i];
    const u = segments[i];
    for (let j = lowerBegin; samples[j].s < lowerEnd; j++) {
      const lower = samples[j];
      const v = segments[j];
      const determinant = u.dx * v.dz - u.dz * v.dx;
      if (Math.abs(determinant) < 1e-8) continue;
      const x = lower.x - upper.x;
      const z = lower.z - upper.z;
      const t = (x * v.dz - z * v.dx) / determinant;
      const q = (x * u.dz - z * u.dx) / determinant;
      if (t >= 0 && t < 1 && q >= 0 && q < 1) {
        return { x: upper.x + u.dx * t, z: upper.z + u.dz * t, upper: upper.s + t * spacing, lower: lower.s + q * spacing };
      }
    }
  }
  throw new Error('The Dique center lines must intersect within the bridge and tunnel.');
}

const intersection = findCrossing();
const { upper, lower } = intersection;

const anchors = {
  crane: 178, chicaneIn: diqueRoadDistance(239), chicaneOut: diqueRoadDistance(262),
  crest: diqueRoadDistance(443.5), spillway: diqueRoadDistance(507),
  upperCross: upper, lowerCross: lower, maleconFirst: diqueRoadDistance(662), maleconLast: diqueRoadDistance(739),
};
const crossing = {
  ...intersection, upperFrom: diqueRoadDistance(361), upperTo: diqueRoadDistance(385),
  lowerFrom: lower - 6, lowerTo: lower + 6, clearance: 4.9,
};
const tunnel = { from: diqueRoadDistance(580), to: diqueRoadDistance(632), archTo: diqueRoadDistance(584),
  taperTo: diqueRoadDistance(587), clearance: 2.75, archClearance: 2.93 };
const bridge = { from: diqueRoadDistance(297), crest: anchors.crest, to: diqueRoadDistance(580), height: 6.1 };
const chicane = { from: detour.from, apexIn: anchors.chicaneIn, apexOut: anchors.chicaneOut, to: diqueRoadDistance(320) };

function roadHalfAt(distance: number) {
  const road = wrap(distance);
  const s = originalRoadDistance(road);
  const craneWidth = 1.4 * band(s, 146, 163, 198, 217);
  const chicaneWidth = 0.55 * band(s, 220, 231, 236, 252) - 0.60 * band(s, 247, 259, 265, 276)
    + 0.75 * band(s, 272, 288, 292, 317);
  const elevatedWidth = -0.10 * band(s, 347, 361, 385, 397);
  const descentWidth = 1.30 * band(s, 482, 495, 513, 533);
  const tunnelWidth = 0.10 * band(s, 568, 580, 632, 642);
  const maleconWidth = 0.90 * band(s, 647, 660, 708, 725);
  const approved = 3.10 + craneWidth + chicaneWidth + elevatedWidth + descentWidth + tunnelWidth + maleconWidth;
  const extent = band(road, detour.from, detour.from + 5, detour.to - 3, detour.to);
  const bypassWidth = mix(3, 2.72, smooth(road, detour.to - 14, detour.to - 7));
  return mix(approved, bypassWidth, extent);
}

function pitRoadHalfAt(distance: number) {
  return mix(roadHalfAt(distance), -pit.offset + pit.halfWidth, band(wrap(distance), pit.entry, pit.full, pit.leave, pit.exit));
}

function isPitLane(distance: number, offset: number) {
  return offset * pit.side > roadHalfAt(distance) + 0.12 && offset * pit.side <= pitRoadHalfAt(distance);
}

function wallHalfAt(distance: number, side: number) {
  const road = wrap(distance);
  const s = originalRoadDistance(road);
  const asphalt = side === pit.side ? pitRoadHalfAt(road) : roadHalfAt(road);
  const works = band(road, detour.from, detour.from + 9, detour.to - 3, detour.to);
  const narrow = Math.max(works * .86, band(s, 351, 361, 385, 394), band(s, 570, 580, 632, 642));
  return asphalt + mix(1.12, 0.42, narrow);
}

function surfaceBandsAt(distance: number, side: number) {
  const road = wrap(distance);
  const s = originalRoadDistance(road);
  const isPitchedPit = side === pit.side && s >= pit.entry && s <= pit.exit;
  const asphalt = isPitchedPit ? pitRoadHalfAt(road) : roadHalfAt(road);
  const wall = wallHalfAt(road, side);
  const curb = isPitchedPit ? asphalt : Math.min(wall, asphalt + CURB_WIDTH);
  const escape = curb + (wall - curb) * 0.84 * Math.max(band(s, 220, 233, 289, 311), band(s, 474, 494, 526, 540));
  const gravel = escape + (wall - escape) * 0.86 * Math.max(band(s, 140, 159, 208, 229), band(s, 644, 664, 719, 751));
  return { asphalt, curb, escape, gravel, wall };
}

function surfaceAt(s: number, offset: number): TrackSurface {
  const bands = surfaceBandsAt(s, Math.sign(offset));
  const edge = Math.abs(offset);
  if (edge <= bands.asphalt) return 'asphalt';
  if (edge <= bands.curb) return 'curb';
  if (edge <= bands.escape) return 'escape';
  if (edge <= bands.gravel) return 'gravel';
  return 'grass';
}

function bankAt(distance: number) {
  const s = originalRoadDistance(wrap(distance));
  const crane = band(s, 146, 171, 189, 217) * Math.tan(8 * Math.PI / 180);
  const spillway = band(s, 474, 498, 514, 539) * Math.tan(5 * Math.PI / 180);
  const malecon = band(s, 713, 732, 742, originalLength) * Math.tan(4 * Math.PI / 180);
  return crane - spillway + malecon;
}

function heightAt(s: number, offset: number) {
  return nominalHeight(wrap(s)) + bankAt(s) * offset;
}

function wetAt(distance: number, offset: number) {
  const road = wrap(distance);
  const s = originalRoadDistance(road);
  const margins = band(offset, -roadHalfAt(road) - 0.12, -roadHalfAt(road) + 0.18, -1.02, -0.20);
  return band(s, 146, 163, 204, 217) * margins;
}

function sector(id: SectorId, name: string, from: number, to: number, at = (from + to) / 2, offset = 0): CourseSector {
  const point = sampleAt(at);
  return { id, name, from, to, cue: { x: point.x - point.dz * offset, y: heightAt(at, offset), z: point.z + point.dx * offset } };
}

const dock = sector('straight', 'Recta del muelle', 0, 146, 75);
const crane = sector('hairpin', 'Horquilla de la grúa', 146, detour.from, anchors.crane);
const containers = sector('chicane', 'Desvío de contenedores', detour.from, diqueRoadDistance(320), detour.apex);
const deck = sector('bridge', 'Puente diagonal', diqueRoadDistance(320), diqueRoadDistance(388), upper);
const crest = sector('back-straight', 'Coronación del dique', diqueRoadDistance(388), diqueRoadDistance(465), anchors.crest);
const spillway = sector('esses', 'Curva del vertedero', diqueRoadDistance(465), diqueRoadDistance(511), anchors.spillway);
const returnRoad = sector('underpass', 'Descenso al túnel', diqueRoadDistance(511), diqueRoadDistance(642), lower);
const malecon = sector('sweep', 'Doble curva del malecón', diqueRoadDistance(642), length, anchors.maleconLast);
const garage = sector('pit', 'Boxes del muelle', pit.entry, pit.exit, pit.stalls[1], pit.offset);
const covered = sector('tunnel', 'Túnel del dique', tunnel.from, tunnel.to, lower);
const circuitSectors = [dock, crane, containers, deck, crest, spillway, returnRoad, malecon];

function sectorAt(distance: number, offset = 0) {
  const s = wrap(distance);
  if (isPitLane(s, offset)) return garage;
  if (s >= tunnel.from && s <= tunnel.to) return covered;
  return circuitSectors.find(candidate => s < candidate.to) ?? dock;
}

const safetyPanels: Course['safetyPanels'] = [
  { s: anchors.crane, side: 1, count: 9 }, { s: anchors.spillway, side: -1, count: 7 },
  { s: anchors.maleconFirst, side: 1, count: 5 }, { s: anchors.maleconLast, side: 1, count: 5 },
].flatMap(section => Array.from({ length: section.count }, (_, i) => ({
  s: section.s + (i - (section.count - 1) / 2) * safetyPanelSpacing,
  side: section.side as -1 | 1,
  tyres: i > 0 && i < section.count - 1 && i % 2 === 0,
})));

export const DIQUE = {
  id: 'dique', length, samples: samples as readonly TrackPoint[], sampleAt, locate, wrap, anchors, crossing, tunnel, bridge, chicane,
  pit, detour, gridRows: [-2.18, -5.98], roadHalfAt, wallHalfAt, pitRoadHalfAt, isPitLane, bankAt, heightAt, surfaceAt, surfaceBandsAt,
  sectors: [...circuitSectors, garage, covered], sectorAt, safetyPanels, wetAt,
  checkpoints: [0, detour.apex, diqueRoadDistance(388), diqueRoadDistance(642)],
  demoDistances: [10, anchors.crane, upper, anchors.maleconFirst],
} satisfies Course & { anchors: typeof anchors };
