import { DIQUE } from './dique-track.ts';
import type { Course, CourseFrame, CourseLoop, CourseSector } from './courses.ts';
import type { SectorId, TrackHint, TrackLocation, TrackPoint, TrackSurface } from './track.ts';

type XYZ = readonly [number, number, number];
type Raw = { x: number; y: number; z: number; s: number; tx: number; ty: number; tz: number; rx: number; ry: number; rz: number };
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (v: number) => { const t = clamp(v); return t * t * (3 - 2 * t); };
const blend = (v: number, from: number, to: number) => smooth((v - from) / (to - from));
const raw: Raw[] = [];
const marks: Record<string, number> = {};
const loopSections: CourseLoop[] = [];
let current: XYZ = [0, 0, 0];

function appendPath(name: string, point: (u: number) => XYZ, steps: number, loopRight?: XYZ) {
  if (!raw.length) raw.push({ x: 0, y: 0, z: 0, s: 0, tx: 1, ty: 0, tz: 0, rx: 0, ry: 0, rz: -1 });
  for (let i = 1; i <= steps; i++) {
    const u = i / steps;
    const p = point(u), a = point(Math.max(0, u - .0001)), b = point(Math.min(1, u + .0001));
    const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const tx = (b[0] - a[0]) / length, ty = (b[1] - a[1]) / length, tz = (b[2] - a[2]) / length;
    const seed = loopRight ?? [tz, 0, -tx];
    const dot = seed[0] * tx + seed[1] * ty + seed[2] * tz;
    const rx = seed[0] - dot * tx, ry = seed[1] - dot * ty, rz = seed[2] - dot * tz;
    const rLength = Math.hypot(rx, ry, rz);
    const prior = raw[raw.length - 1];
    raw.push({ x: p[0], y: p[1], z: p[2], s: prior.s + Math.hypot(p[0] - prior.x, p[1] - prior.y, p[2] - prior.z),
      tx, ty, tz, rx: rx / rLength, ry: ry / rLength, rz: rz / rLength });
  }
  current = point(1);
  marks[name] = raw[raw.length - 1].s;
}

function straight(name: string, to: XYZ) {
  const from = current;
  appendPath(name, u => [mix(from[0], to[0], u), mix(from[1], to[1], smooth(u)), mix(from[2], to[2], u)],
    Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]) * 5));
}

function bend(name: string, first: XYZ, second: XYZ, to: XYZ) {
  const from = current;
  appendPath(name, t => cubic(from, first, second, to, t), curveSteps(from, first, second, to));
}

function curveSteps(from: XYZ, first: XYZ, second: XYZ, to: XYZ) {
  const estimate = Math.hypot(first[0] - from[0], first[1] - from[1], first[2] - from[2])
    + Math.hypot(second[0] - first[0], second[1] - first[1], second[2] - first[2])
    + Math.hypot(to[0] - second[0], to[1] - second[1], to[2] - second[2]);
  return Math.ceil(estimate * 5);
}

function cubic(from: XYZ, first: XYZ, second: XYZ, to: XYZ, t: number): XYZ {
  const u = 1 - t;
  return [0, 1, 2].map(i => u ** 3 * from[i] + 3 * u * u * t * first[i] + 3 * u * t * t * second[i] + t ** 3 * to[i]) as unknown as XYZ;
}

function verticalLoop(name: string, yaw: number) {
  const origin = current;
  const from = raw[raw.length - 1].s;
  const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  // A lateral lane change separates both bottoms. A longitudinally drifting
  // planar circle would cross its own road near the bottom of the loop.
  appendPath(name, u => {
    const angle = u * Math.PI * 2;
    const forward = 11.5 * Math.sin(angle) + 11 * smooth(u);
    const sideways = 24 * smooth(u);
    return [origin[0] + fx * forward + rx * sideways, origin[1] + 11.5 * (1 - Math.cos(angle)),
      origin[2] + fz * forward + rz * sideways];
  }, 700, [rx, 0, rz]);
  loopSections.push({ from, to: marks[name], yaw });
}

// Front apron, two physically separated inverted test rigs, a rising figure
// eight and a full spiral tower. All distances are measured in three dimensions.
straight('pitStraight', [220, 0, 0]);
bend('eastTurn', [248, 0, 0], [270, 0, -22], [270, 0, -50]);
straight('loopOneEntry', [270, 0, -110]);
verticalLoop('loopOneExit', Math.PI);
straight('loopOneLanding', [246, 0, -158]);
bend('eightApproach', [246, 0, -198], [215, 0, -220], [180, 0, -220]);
bend('eightEntry', [145, 0, -220], [110, 0, -245], [110, 0, -280]);
const eightStart = marks.eightEntry;
appendPath('eightExit', u => {
  const angle = -Math.PI / 2 + 2 * Math.PI * u;
  return [180 + 70 * Math.sin(angle), 18 * smooth(u), -280 + 40 * Math.sin(2 * angle)];
}, 2300);
// Quarter and three-quarter phases meet in plan on different decks.
const crossingRaw = [raw[raw.length - 1 - 2300 + 575], raw[raw.length - 1 - 2300 + 1725]];
bend('spiralEntry', [110, 18, -315], [95, 18, -340], [95, 18, -375]);
appendPath('spiralExit', u => [50 + 45 * Math.cos(-2 * Math.PI * u), 18 + 12 * smooth(u),
  -375 + 45 * Math.sin(-2 * Math.PI * u)], 1600);
bend('towerBridge', [95, 30, -445], [40, 26, -470], [-30, 26, -470]);
straight('descent', [-160, 14, -470]);
bend('westTurn', [-196, 14, -470], [-225, 4, -441], [-225, 4, -405]);
straight('loopTwoEntry', [-225, 4, -360]);
verticalLoop('loopTwoExit', 0);
straight('loopTwoLanding', [-201, 0, -270]);
const length = DIQUE.length * 2;
// Preserve the installed launch-pad/loop footprint while routing the final
// sector through the campus. Global rescaling would move every rig relative to
// its buildings. Only the broad final return bend absorbs the distance fit.
const scale = .7485877167530371;
const world = (x: number, z: number): XYZ => [x / scale, 0, z / scale];
type CampusCurve = readonly [string, XYZ, XYZ, XYZ];
function campusCurves(returnX: number): CampusCurve[] {
  return [
    ['campusEntry', world(-150.466, -183), world(-128, -186), world(-128, -170)],
    ['courtyardApproach', world(-128, -150), world(-128, -134), world(-112, -134)],
    // Two quarter circles avoid the folded inner ribbon of a single tight
    // reversing cubic. The eight-metre centreline radius leaves a usable apex.
    ['chicaneIn', world(-107.581722, -134), world(-104, -130.418278), world(-104, -126)],
    ['courtyardTurn', world(-104, -121.581722), world(-107.581722, -118), world(-112, -118)],
    ['chicaneOut', world(-120.836556, -118), world(-128, -110.836556), world(-128, -102)],
    ['returnStraight', world(-128, -85), world(returnX, -77), world(returnX, -62)],
    ['returnTurn', world(returnX, -32), world(-124, 0), world(-98, 0)],
  ];
}
const campusStart = current;
function campusLength(returnX: number) {
  let total = 98 / scale, from = campusStart;
  for (const [, first, second, to] of campusCurves(returnX)) {
    let prior = from;
    const steps = curveSteps(from, first, second, to);
    for (let i = 1; i <= steps; i++) {
      const next = cubic(from, first, second, to, i / steps);
      total += Math.hypot(next[0] - prior[0], next[1] - prior[1], next[2] - prior[2]);
      prior = next;
    }
    from = to;
  }
  return total;
}
const remaining = length / scale - marks.loopTwoLanding;
let west = -148, east = -129;
if (remaining < campusLength(east) || remaining > campusLength(west)) throw new Error(`Campus return distance ${remaining * scale} is outside ${campusLength(east) * scale}–${campusLength(west) * scale}`);
for (let i = 0; i < 36; i++) {
  const middle = (west + east) / 2;
  if (campusLength(middle) > remaining) west = middle;
  else east = middle;
}
for (const [name, first, second, to] of campusCurves((west + east) / 2)) bend(name, first, second, to);
straight('end', [0, 0, 0]);
for (const p of raw) { p.x *= scale; p.y *= scale; p.z *= scale; p.s *= scale; }
for (const key of Object.keys(marks)) marks[key] *= scale;
for (const loop of loopSections) { loop.from *= scale; loop.to *= scale; }
const loops = loopSections as readonly CourseLoop[];
const count = Math.ceil(length / .30);
const spacing = length / count;
const wrap = (s: number) => ((s % length) + length) % length;
const gap = (a: number, b: number) => Math.abs(wrap(a - b + length / 2) - length / 2);
const frames: CourseFrame[] = [];
const samples: TrackPoint[] = [];

function interpolate(a: Raw | CourseFrame, b: Raw | CourseFrame, t: number, offset = 0): CourseFrame {
  let tx = mix(a.tx, b.tx, t), ty = mix(a.ty, b.ty, t), tz = mix(a.tz, b.tz, t);
  const size = Math.hypot(tx, ty, tz); tx /= size; ty /= size; tz /= size;
  let rx = mix(a.rx, b.rx, t), ry = mix(a.ry, b.ry, t), rz = mix(a.rz, b.rz, t);
  const dot = rx * tx + ry * ty + rz * tz; rx -= tx * dot; ry -= ty * dot; rz -= tz * dot;
  const rightSize = Math.hypot(rx, ry, rz); rx /= rightSize; ry /= rightSize; rz /= rightSize;
  return { x: mix(a.x, b.x, t) - rx * offset, y: mix(a.y, b.y, t) - ry * offset, z: mix(a.z, b.z, t) - rz * offset,
    tx, ty, tz, rx, ry, rz, nx: ty * rz - tz * ry, ny: tz * rx - tx * rz, nz: tx * ry - ty * rx };
}

let cursor = 1;
for (let i = 0; i < count; i++) {
  const s = i * spacing;
  while (raw[cursor].s < s) cursor++;
  const a = raw[cursor - 1], b = raw[cursor];
  const f = interpolate(a, b, (s - a.s) / (b.s - a.s));
  frames.push(f);
  const horizontal = Math.hypot(f.tx, f.tz);
  samples.push({ x: f.x, y: f.y, z: f.z, s, dx: horizontal > 1e-4 ? f.tx / horizontal : 0,
    dz: horizontal > 1e-4 ? f.tz / horizontal : -1 });
}

function frameAt(distance: number, offset = 0): CourseFrame {
  const s = wrap(distance), index = Math.floor(s / spacing), t = s / spacing - index;
  return interpolate(frames[index], frames[(index + 1) % count], t, offset);
}

function sampleAt(distance: number): TrackPoint {
  const s = wrap(distance), f = frameAt(s), horizontal = Math.hypot(f.tx, f.tz);
  const loop = horizontal < 1e-4 ? loops.find(loop => s >= loop.from && s <= loop.to) : undefined;
  return { x: f.x, y: f.y, z: f.z, s, dx: horizontal > 1e-4 ? f.tx / horizontal : Math.sin(loop?.yaw ?? 0),
    dz: horizontal > 1e-4 ? f.tz / horizontal : Math.cos(loop?.yaw ?? 0) };
}

const pit = { entry: 14, full: 28, leave: 85, exit: 103, side: -1 as const, offset: -5.25, halfWidth: 1.60,
  stalls: [34, 47, 60, 73], stationOffset: -9.5, speedLimit: 5.1 };
const pitOpening = (s: number) => blend(wrap(s), pit.entry, pit.full) * (1 - blend(wrap(s), pit.leave, pit.exit));
function roadHalfAt(s: number) {
  const at = wrap(s);
  const apron = 1 - blend(at, marks.pitStraight - 15, marks.pitStraight + 15) + blend(at, length - 45, length - 12);
  const rig = loops.reduce((amount, loop) => Math.max(amount,
    blend(at, loop.from - 12, loop.from - 5) * (1 - blend(at, loop.to + 5, loop.to + 12))), 0);
  return 3.05 + .45 * apron - .33 * rig;
}
const pitRoadHalfAt = (s: number) => mix(roadHalfAt(s), -pit.offset + pit.halfWidth, pitOpening(s));
const isPitLane = (s: number, offset: number) => offset < -roadHalfAt(s) - .12 && offset >= -pitRoadHalfAt(s);
const wallHalfAt = (s: number, side: number) => (side < 0 ? pitRoadHalfAt(s) : roadHalfAt(s)) + .74;
function surfaceBandsAt(s: number, side: number) {
  const asphalt = side < 0 ? pitRoadHalfAt(s) : roadHalfAt(s), wall = wallHalfAt(s, side);
  const curb = asphalt + .28, escape = wall - .12;
  return { asphalt, curb, escape, gravel: escape, wall };
}
function surfaceAt(s: number, offset: number): TrackSurface {
  const edge = Math.abs(offset), bands = surfaceBandsAt(s, Math.sign(offset));
  return edge <= bands.asphalt ? 'asphalt' : edge <= bands.curb ? 'curb' : edge <= bands.escape ? 'escape' : 'grass';
}

// World-space grid for recovery, and a tight longitudinal window while driving.
// Vertical scoring and the s hint prevent switching decks at the eight/spiral.
const gridSize = 15;
const grid = new Map<string, number[]>();
for (let i = 0; i < count; i++) {
  const p = samples[i], q = samples[(i + 1) % count];
  for (let x = Math.floor(Math.min(p.x, q.x) / gridSize); x <= Math.floor(Math.max(p.x, q.x) / gridSize); x++) {
    for (let z = Math.floor(Math.min(p.z, q.z) / gridSize); z <= Math.floor(Math.max(p.z, q.z) / gridSize); z++) {
      const key = `${x},${z}`, bucket = grid.get(key);
      if (bucket) bucket.push(i); else grid.set(key, [i]);
    }
  }
}
function locate(x: number, z: number, hint?: TrackHint): TrackLocation {
  const hintS = hint?.s !== undefined && Number.isFinite(hint.s) ? wrap(hint.s) : undefined;
  const y = hint?.y ?? (hintS === undefined ? undefined : frameAt(hintS).y);
  let best = Infinity, bestS = 0, horizontalBest = Infinity;
  function consider(index: number) {
    const a = samples[(index + count) % count], b = samples[(index + 1 + count) % count];
    const dx = b.x - a.x, dz = b.z - a.z, dy = b.y - a.y;
    const denominator = dx * dx + dz * dz + (y === undefined ? 0 : dy * dy);
    const t = denominator > 1e-10 ? clamp(((x - a.x) * dx + (z - a.z) * dz + (y === undefined ? 0 : (y - a.y) * dy)) / denominator) : 0;
    const px = a.x + dx * t, pz = a.z + dz * t, py = a.y + dy * t;
    const flatDistance = (x - px) ** 2 + (z - pz) ** 2;
    const s = wrap(a.s + spacing * t);
    const score = flatDistance + (y === undefined ? 0 : (y - py) ** 2)
      + (hintS === undefined ? 0 : Math.min(25, gap(s, hintS) ** 2 * .002));
    if (score < best) { best = score; bestS = s; horizontalBest = flatDistance; }
  }
  if (hintS !== undefined) {
    const radius = Math.ceil(18 / spacing), center = Math.floor(hintS / spacing);
    for (let i = center - radius; i <= center + radius; i++) consider(i);
    if (horizontalBest < 100 && best < 125 && gap(bestS, hintS) < 17) return location(bestS);
  }
  const cellX = Math.floor(x / gridSize), cellZ = Math.floor(z / gridSize);
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    for (const index of grid.get(`${cellX + dx},${cellZ + dz}`) ?? []) consider(index);
  }
  if (!Number.isFinite(best)) for (let i = 0; i < count; i++) consider(i);
  return location(bestS);
  function location(s: number) {
    const point = sampleAt(s), frame = frameAt(s);
    return { ...point, offset: -(x - point.x) * frame.rx - (z - point.z) * frame.rz
      - (y === undefined ? 0 : (y - point.y) * frame.ry) };
  }
}

const lower = crossingRaw[0].s, upper = crossingRaw[1].s;
const crossing = { x: crossingRaw[0].x, z: crossingRaw[0].z, lower, upper,
  lowerFrom: lower - 8, lowerTo: lower + 8, upperFrom: upper - 8, upperTo: upper + 8,
  clearance: crossingRaw[1].y - crossingRaw[0].y - .42 };
const anchors = { ...marks, upperCross: upper, lowerCross: lower, eightStart: eightStart * scale,
  loopOne: (loops[0].from + loops[0].to) / 2, loopTwo: (loops[1].from + loops[1].to) / 2,
  spiral: (marks.spiralEntry + marks.spiralExit) / 2 };
function sector(id: SectorId, name: string, from: number, to: number, at = (from + to) / 2): CourseSector {
  const p = sampleAt(at);
  return { id, name, from, to, cue: { x: p.x, y: p.y, z: p.z } };
}
const sectors = [
  sector('straight', 'Recta de integración', 0, marks.eastTurn),
  sector('bridge', 'Ensayo de inversión magnética I', marks.eastTurn, marks.eightEntry, anchors.loopOne),
  sector('esses', 'Ocho de los prototipos', marks.eightEntry, marks.eightExit, upper),
  sector('bridge', 'Espiral de la torre', marks.eightExit, marks.towerBridge, anchors.spiral),
  sector('back-straight', 'Puente de transferencia', marks.towerBridge, marks.westTurn),
  sector('bridge', 'Ensayo de inversión magnética II', marks.westTurn, marks.loopTwoLanding, anchors.loopTwo),
  sector('chicane', 'Patio de integración', marks.loopTwoLanding, marks.chicaneOut),
  sector('sweep', 'Calle de los laboratorios', marks.chicaneOut, length),
];
const pitSector = sector('pit', 'Boxes de integración', pit.entry, pit.exit, pit.stalls[1]);
const safetyPanels: Course['safetyPanels'] = [marks.eastTurn - 20, marks.westTurn - 20, marks.chicaneIn, marks.returnTurn - 20]
  .flatMap(s => Array.from({ length: 7 }, (_, i) => ({ s: s + (i - 3) * 1.5, side: 1 as const, tyres: i % 2 === 0 })));

export const SPACEPORT = {
  id: 'spaceport', length, samples: samples as readonly TrackPoint[], sampleAt, frameAt, locate, wrap, anchors, loops,
  crossing, bridge: { from: marks.eightEntry, crest: marks.spiralExit, to: marks.westTurn, height: 30 * scale },
  tunnel: { from: lower - 5, to: lower + 5, archTo: lower - 2, taperTo: lower + 2, clearance: crossing.clearance, archClearance: crossing.clearance },
  chicane: { from: marks.loopTwoLanding, apexIn: marks.chicaneIn, apexOut: marks.chicaneOut - 15, to: marks.chicaneOut },
  pit, gridRows: [-2.18, -5.98], roadHalfAt, wallHalfAt, pitRoadHalfAt, isPitLane, bankAt: () => 0,
  heightAt: (s: number, offset: number) => frameAt(s, offset).y, surfaceAt, surfaceBandsAt,
  sectors: [...sectors, pitSector], sectorAt: (s: number, offset = 0) => isPitLane(s, offset) ? pitSector
    : sectors.find(sector => wrap(s) < sector.to) ?? sectors[0],
  safetyPanels, checkpoints: [0, marks.eightEntry, marks.spiralExit, marks.loopTwoLanding],
  demoDistances: [14, anchors.loopOne, upper, anchors.spiral], wetAt: () => 0,
} satisfies Course & { anchors: typeof anchors };
