import { PIT_LANE, TRACK, wallHalfAt } from '../shared/track';
import { approachingCover } from './track-cover';

const stations = [
  { id: 'hairpin', at: TRACK.anchors.sweepApex, lead: 2.5, side: -1, lift: 2.2, range: 11.5 },
  { id: 'bridge', at: TRACK.crossing.upper, lead: -1.6, side: 1, lift: 3.15, range: 11.5 },
  { id: 'pits', at: PIT_LANE.stalls[0], lead: 3.3, side: -1, lift: 2.1, range: 10.2 },
  { id: 'last-turn', at: TRACK.anchors.front - 0.5, lead: 2.9, side: 1, lift: 2.25, range: 7.8 },
].map(({ id, at, lead, side, lift, range }) => {
  const p = TRACK.sampleAt(at + lead);
  const offset = side * (wallHalfAt(p.s, side) + 0.73);
  return {
    id, at, range, x: p.x - p.dz * offset, z: p.z + p.dx * offset,
    y: TRACK.heightAt(p.s, offset) + lift,
  };
});

export function cinematicStation(s: number) {
  if (approachingCover(s, 4) > 0.08) return undefined;
  let best = 1;
  let selected: (typeof stations)[number] | undefined;
  for (const station of stations) {
    const half = TRACK.length / 2;
    const relative = Math.abs(TRACK.wrap(s - station.at + half) - half) / station.range;
    if (relative >= best) continue;
    best = relative;
    selected = station;
  }
  return selected;
}
