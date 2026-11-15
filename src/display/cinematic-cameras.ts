import { PIT_LANE, TRACK } from '../shared/track';
import { DIQUE, TALLER, diqueRoadDistance, type Course } from '../shared/courses';
import { approachingCover } from './track-cover';

const taller = [
  { id: 'hairpin', at: TRACK.anchors.sweepApex, lead: 2.5, side: -1, lift: 2.2, range: 11.5 },
  { id: 'bridge', at: TRACK.crossing.upper, lead: -1.6, side: 1, lift: 3.15, range: 11.5 },
  { id: 'pits', at: PIT_LANE.stalls[0], lead: 3.3, side: -1, lift: 2.1, range: 10.2 },
  { id: 'last-turn', at: TRACK.anchors.front - 0.5, lead: 2.9, side: 1, lift: 2.25, range: 7.8 },
];
const dique = [
  { id: 'crane', at: 179, lead: 4.8, side: 1, lift: 3.2, range: 18 },
  { id: 'bridge', at: 369.45, lead: -2.5, side: 1, lift: 3.4, range: 18 },
  { id: 'spillway', at: 506, lead: -3.7, side: 1, lift: 4.5, range: 17 },
  { id: 'last-turn', at: 736, lead: 2.5, side: 1, lift: 2.8, range: 22 },
].map(station => ({ ...station, at: diqueRoadDistance(station.at) }));
dique.push(
  { id: 'port-entry', at: DIQUE.detour.from + 18, lead: -2.2, side: 1, lift: 4.8, range: 19 },
  { id: 'port-crates', at: DIQUE.detour.apex, lead: 1.5, side: 1, lift: 4.65, range: 20 },
  { id: 'port-return', at: DIQUE.detour.to - 17, lead: 2.4, side: -1, lift: 4.3, range: 20 },
  { id: 'riverbank', at: DIQUE.treatmentDetour.from + 46, lead: 3.6, side: -1, lift: 3.05, range: 28 },
  { id: 'treatment-outfall', at: DIQUE.treatmentDetour.apex, lead: 2.7, side: -1, lift: 4.9, range: 28 },
  { id: 'filter-house', at: DIQUE.treatmentDetour.to - 47, lead: 3.7, side: 1, lift: 3.35, range: 26 },
);

export function cinematicStation(s: number, course: Course = TALLER) {
  if (approachingCover(s, 4, course) > 0.08) return undefined;
  if (course.id === 'dique' && s >= DIQUE.treatmentDetour.from + 4 && s <= DIQUE.treatmentDetour.from + 19) {
    const at = DIQUE.treatmentDetour.from + 12.4;
    const point = course.sampleAt(at);
    const offset = course.wallHalfAt(at, 1) + 1.50;
    return { id: 'tunnel-outfall', at, range: 8, x: point.x - point.dz * offset,
      y: course.heightAt(at, offset) + 4.5, z: point.z + point.dx * offset };
  }
  const stations = course.id === 'dique' ? dique : taller;
  let best = 1;
  let selected: (typeof stations)[number] | undefined;
  for (const station of stations) {
    const half = course.length / 2;
    const relative = Math.abs(course.wrap(s - station.at + half) - half) / station.range;
    if (relative >= best) continue;
    best = relative;
    selected = station;
  }
  if (selected) {
    const { id, at, lead, side, lift, range } = selected;
    const point = course.sampleAt(at + lead);
    const offset = side * (course.wallHalfAt(point.s, side) + 0.73);
    return { id, at, range, x: point.x - point.dz * offset, z: point.z + point.dx * offset,
      y: course.heightAt(point.s, offset) + lift };
  }
}
