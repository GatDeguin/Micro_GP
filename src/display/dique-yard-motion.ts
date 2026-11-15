import { diquePlanPoint } from '../shared/dique-track.ts';

export const forkliftYard = {
  start: diquePlanPoint(168, 142).x,
  end: diquePlanPoint(191, 142).x,
  z: diquePlanPoint(168, 142).z,
  forkReach: 1.98,
  withdrawal: 2.30,
  cycle: 42,
};

const { start, end, forkReach, withdrawal } = forkliftYard;
const a = start - forkReach;
const b = end - forkReach;
const offA = a - withdrawal;
const offB = b - withdrawal;
const carry = 0.68;

// Vehicle position, fork height above the inserted position, and pallet position.
// Stops at each end leave time to line up, release the load and clear the bay.
const cycle = [
  [0, offA, 0, start], [1, offA, 0, start], [3, a, 0, start],
  [4.2, a, carry, start], [14.8, b, carry, end], [16, b, 0, end],
  [17, b, 0, end], [19, offB, 0, end], [22.2, offB, 0, end],
  [24.2, b, 0, end], [25.5, b, carry, end], [36.1, a, carry, start],
  [37.3, a, 0, start], [38.3, a, 0, start], [40.3, offA, 0, start],
  [forkliftYard.cycle, offA, 0, start],
] as const;

export function sampleDiqueForklift(seconds: number) {
  const time = (seconds % forkliftYard.cycle + forkliftYard.cycle) % forkliftYard.cycle;
  const index = cycle.findIndex(segment => time < segment[0]);
  const [from, x0, lift0, cargo0] = cycle[index - 1];
  const [to, x1, lift1, cargo1] = cycle[index];
  const t = (time - from) / (to - from);
  const blend = t * t * (3 - 2 * t);
  return {
    x: x0 + (x1 - x0) * blend,
    speed: (x1 - x0) * 6 * t * (1 - t) / (to - from),
    lift: lift0 + (lift1 - lift0) * blend,
    cargoX: cargo0 + (cargo1 - cargo0) * blend,
  };
}
