import { TRACK, WALL_HALF, type TrackPoint } from '../shared/track.ts';

type CrossingPoint = Pick<TrackPoint, 'x' | 'z' | 's'>;

// Meta, Horquilla, Ese Alta and Curvón in travel order.
const gates = [
  TRACK.sampleAt(0),
  TRACK.locate(25, 1.25),
  TRACK.locate(11.875, -9.375),
  TRACK.locate(-24.1875, -1.4375),
];

function arcDelta(from: number, to: number) {
  const difference = to - from;
  if (difference > TRACK.length / 2) return difference - TRACK.length;
  if (difference < -TRACK.length / 2) return difference + TRACK.length;
  return difference;
}

function crossGate(from: CrossingPoint, to: CrossingPoint, gate: TrackPoint) {
  const before = (from.x - gate.x) * gate.dx + (from.z - gate.z) * gate.dz;
  const after = (to.x - gate.x) * gate.dx + (to.z - gate.z) * gate.dz;
  if (before > 0 || after <= 0) return null;

  const fraction = -before / (after - before);
  const x = from.x + (to.x - from.x) * fraction - gate.x;
  const z = from.z + (to.z - from.z) * fraction - gate.z;
  return Math.abs(z * gate.dx - x * gate.dz) <= WALL_HALF ? fraction : null;
}

export class LapProgress {
  lap = 0;
  private armed = false;
  private next = 0;
  private lastGateDistance = -Infinity;
  private routeDistance: number;
  private rankedDistance: number;

  constructor(gridDistance: number) {
    this.routeDistance = gridDistance;
    this.rankedDistance = gridDistance;
  }

  private get nextGateDistance() {
    const laps = this.next === 0 && this.armed ? this.lap + 1 : this.lap;
    return laps * TRACK.length + gates[this.next].s;
  }

  get distance() {
    return Math.max(this.lastGateDistance, Math.min(this.nextGateDistance - 0.001, this.rankedDistance));
  }

  advance(from: CrossingPoint, to: CrossingPoint, forward: boolean) {
    const delta = arcDelta(from.s, to.s);
    if (Math.abs(delta) > 1.2 || Math.hypot(to.x - from.x, to.z - from.z) > 0.55) return null;

    this.routeDistance += delta;
    this.rankedDistance += forward ? delta : Math.min(0, delta);
    if (!forward || delta <= 0 || Math.abs(this.routeDistance - this.nextGateDistance) > 1.2) return null;

    const gate = gates[this.next];
    const fraction = crossGate(from, to, gate);
    if (fraction === null) return null;

    this.lastGateDistance = this.nextGateDistance;
    this.routeDistance = this.lastGateDistance + Math.max(0, arcDelta(gate.s, to.s));
    this.rankedDistance = this.routeDistance;
    if (this.next === 0) {
      if (this.armed) this.lap++;
      this.armed = true;
    }
    this.next = (this.next + 1) % gates.length;
    return fraction;
  }

  rewind() {
    const behind = this.distance - 0.75;
    const safe = this.armed ? Math.max(this.lastGateDistance, behind) : Math.min(-0.75, behind);
    this.routeDistance = safe;
    this.rankedDistance = safe;
    return safe;
  }
}
