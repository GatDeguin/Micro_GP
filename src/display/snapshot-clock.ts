import type { RaceSnapshot } from '../shared/protocol.ts';

const TICKS_PER_MS = 60 / 1000;
const PHASE_GAIN = 0.12;
const MAX_PHASE_STEP = 3 * TICKS_PER_MS;
const SUSPENSION_MS = 420;
const MAX_SNAPSHOTS = 32;

interface SnapshotSample {
  from: RaceSnapshot;
  to: RaceSnapshot;
  alpha: number;
}

export class SnapshotClock {
  private readonly delayTicks: number;
  private snapshots: RaceSnapshot[] = [];
  private anchorTick = 0;
  private anchorAt = 0;
  private lastArrival = -Infinity;
  private lastSample = -Infinity;
  private displayedTick = -Infinity;

  constructor(delayMs: number) {
    this.delayTicks = Math.max(0, delayMs) * TICKS_PER_MS;
  }

  private tickAt(now: number) {
    return this.anchorTick + (now - this.anchorAt) * TICKS_PER_MS;
  }

  private reset(state: RaceSnapshot, now: number) {
    this.snapshots = [state];
    this.anchorTick = this.displayedTick = state.frame;
    this.anchorAt = now;
  }

  add(state: RaceSnapshot, now: number): void {
    const newest = this.snapshots.at(-1);
    if (!newest || newest.frame < 0 || state.frame < newest.frame || state.heat !== newest.heat
      || state.phase !== newest.phase || now - this.lastArrival > SUSPENSION_MS) {
      this.reset(state, now);
      this.lastArrival = now;
      return;
    }
    if (state.frame === newest.frame) {
      this.snapshots[this.snapshots.length - 1] = state;
      return;
    }

    // A packet nudges the phase of the local clock without setting the pace of playback.
    const predicted = this.tickAt(now);
    const correction = (state.frame - predicted) * PHASE_GAIN;
    this.anchorTick = predicted + Math.max(-MAX_PHASE_STEP, Math.min(MAX_PHASE_STEP, correction));
    this.anchorAt = this.lastArrival = now;
    this.snapshots.push(state);
    if (this.snapshots.length > MAX_SNAPSHOTS) this.snapshots.shift();
  }

  sample(now: number): SnapshotSample | undefined {
    const newest = this.snapshots.at(-1);
    if (!newest) return undefined;
    if (this.lastSample !== -Infinity && now - this.lastSample > SUSPENSION_MS) this.reset(newest, now);
    this.lastSample = now;

    const target = this.tickAt(now) - this.delayTicks;
    const tick = Math.min(newest.frame, Math.max(this.snapshots[0].frame, this.displayedTick, target));
    this.displayedTick = tick;
    while (this.snapshots.length > 1 && this.snapshots[1].frame <= tick) this.snapshots.shift();

    const [from, to] = this.snapshots;
    if (!to || tick === from.frame) return { from, to: from, alpha: 0 };
    return { from, to, alpha: (tick - from.frame) / (to.frame - from.frame) };
  }
}
