import { TALLER, type Course } from '../shared/courses.ts';
import type { TrackPoint } from '../shared/track.ts';

type CrossingPoint = Pick<TrackPoint, 'x' | 'y' | 'z' | 's'>;

export function arcDelta(from: number, to: number, length = TALLER.length) {
  const difference = to - from;
  if (difference > length / 2) return difference - length;
  if (difference < -length / 2) return difference + length;
  return difference;
}

function crossGate(from: CrossingPoint, to: CrossingPoint, gate: TrackPoint, course: Course) {
  const before = (from.x - gate.x) * gate.dx + (from.z - gate.z) * gate.dz;
  const after = (to.x - gate.x) * gate.dx + (to.z - gate.z) * gate.dz;
  if (before > 0 || after <= 0) return null;

  const fraction = -before / (after - before);
  const x = from.x + (to.x - from.x) * fraction - gate.x;
  const y = from.y + (to.y - from.y) * fraction;
  const z = from.z + (to.z - from.z) * fraction - gate.z;
  const offset = z * gate.dx - x * gate.dz;
  return Math.abs(y - gate.y) <= 0.45 && Math.abs(offset) <= course.wallHalfAt(gate.s, Math.sign(offset)) ? fraction : null;
}

export class LapProgress {
  lap = 0;
  private armed = false;
  private next = 0;
  private lastGateDistance = -Infinity;
  private routeDistance: number;
  private rankedDistance: number;
  private readonly gates: readonly TrackPoint[];
  private readonly course: Course;

  constructor(gridDistance: number, course: Course = TALLER) {
    this.course = course;
    this.gates = course.checkpoints.map(course.sampleAt);
    this.routeDistance = gridDistance;
    this.rankedDistance = gridDistance;
  }

  private get nextGateDistance() {
    const laps = this.next === 0 && this.armed ? this.lap + 1 : this.lap;
    return laps * this.course.length + this.gates[this.next].s;
  }

  get distance() {
    return Math.max(this.lastGateDistance, Math.min(this.nextGateDistance - 0.001, this.rankedDistance));
  }

  get checkpoint() {
    return (this.next + this.gates.length - 1) % this.gates.length;
  }

  advance(from: CrossingPoint, to: CrossingPoint, forward: boolean) {
    const delta = arcDelta(from.s, to.s, this.course.length);
    if (Math.abs(delta) > 1.2 || Math.hypot(to.x - from.x, to.z - from.z) > 0.55) return null;

    this.routeDistance += delta;
    this.rankedDistance += forward ? delta : Math.min(0, delta);
    if (!forward || delta <= 0 || Math.abs(this.routeDistance - this.nextGateDistance) > 1.2) return null;

    const gate = this.gates[this.next];
    const fraction = crossGate(from, to, gate, this.course);
    if (fraction === null) return null;

    this.lastGateDistance = this.nextGateDistance;
    this.routeDistance = this.lastGateDistance + Math.max(0, arcDelta(gate.s, to.s, this.course.length));
    this.rankedDistance = this.routeDistance;
    if (this.next === 0) {
      if (this.armed) this.lap++;
      this.armed = true;
    }
    this.next = (this.next + 1) % this.gates.length;
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
