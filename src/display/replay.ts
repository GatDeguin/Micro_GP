import type { CarView, RaceSnapshot } from '../shared/protocol.ts';

const LEAD_IN_TICKS = 105;
const TAIL_TICKS = 24;
const RESULTS_DELAY = 850;
const TICKS_PER_MS = 0.048;

interface Moment {
  tick: number;
  slot: number;
  rival?: number;
  kind: ReplayKind;
  frames: RaceSnapshot[];
}

export type ReplayKind = 'overtake' | 'finish' | 'recovery';

function overtake(previous: RaceSnapshot, state: RaceSnapshot) {
  for (const [rank, slot] of state.order.entries()) {
    const other = state.order[rank + 1];
    if (previous.order[rank] !== other || previous.order[rank + 1] !== slot) continue;
    const a = state.cars[slot], b = state.cars[other];
    if (a.speed > 2 && Math.hypot(a.x - b.x, a.z - b.z) < 3.5) return { slot, rival: other };
  }
}

export function replayCompanion(cars: readonly CarView[], slot: number) {
  const subject = cars[slot];
  const forwardX = Math.sin(subject.yaw), forwardZ = Math.cos(subject.yaw);
  let best = -1;
  let nearest = 8 * 8;
  for (let i = 0; i < cars.length; i++) {
    if (i === slot || cars[i].active === false) continue;
    const x = cars[i].x - subject.x, z = cars[i].z - subject.z;
    const distance = x * x + z * z;
    if (x * forwardX + z * forwardZ > 0.15 || distance >= nearest) continue;
    nearest = distance;
    best = i;
  }
  return best;
}

export class ReplayHistory {
  private previous?: RaceSnapshot;
  private history: RaceSnapshot[] = [];
  private moments: Moment[] = [];
  private playlist: Moment[] = [];
  private outside = new Set<number>();
  private index = 0;
  private starts = Infinity;
  private automatic: boolean;

  constructor(automatic = true) { this.automatic = automatic; }

  get available() { return this.previous?.phase === 'results' && this.moments.some(moment => moment.frames.length >= 2); }
  get count() { return this.moments.filter(moment => moment.frames.length >= 2).length; }

  startSummary(now: number) {
    if (!this.available) return false;
    this.playlist = this.moments.filter(moment => moment.frames.length >= 2);
    this.index = 0;
    this.starts = now;
    return true;
  }

  stop() {
    this.playlist = [];
    this.index = 0;
    this.starts = Infinity;
  }

  add(state: RaceSnapshot, now: number) {
    const previous = this.previous;
    this.previous = state;
    if (!previous || previous.heat !== state.heat || state.frame < previous.frame ||
        state.phase === 'demo' || state.phase === 'grid') {
      this.history = [];
      this.moments = [];
      this.outside.clear();
      this.stop();
    }
    if (!previous || previous.heat !== state.heat || state.frame <= previous.frame) return;
    const enteringResults = state.phase === 'results' && previous.phase === 'race';
    if (state.phase !== 'race' && !enteringResults) return;
    for (const moment of this.moments) if (state.frame <= moment.tick + TAIL_TICKS) moment.frames.push(state);
    this.history.push(state);
    while (this.history[0].frame < state.frame - LEAD_IN_TICKS) this.history.shift();

    const finish = state.flag && !previous.flag;
    if (finish && state.order.length) {
      const [slot, second] = state.order;
      const a = state.cars[slot], b = state.cars[second];
      const rival = b && Math.hypot(a.x - b.x, a.z - b.z) < 3.4 ? second : undefined;
      this.moments.push({ tick: state.frame, slot, rival, kind: 'finish', frames: this.history.slice() });
    } else if (state.phase === 'race' && !state.flag && previous.phase === 'race') {
      let backOnTrack: number | undefined;
      state.cars.forEach((car, index) => {
        const before = previous.cars[index];
        if (!before || car.active === false) return;
        const runoff = car.sound?.runoff ?? 0;
        if (runoff > 0.5) this.outside.add(index);
        const recovered = this.outside.has(index) && runoff < 0.2 && car.speed > 3;
        if (recovered || (!before.blink && car.blink && Math.hypot(car.x - before.x, car.z - before.z) > 2.5)) {
          this.outside.delete(index);
          backOnTrack ??= index;
        }
      });
      const pass = overtake(previous, state);
      const slot = pass?.slot ?? backOnTrack;
      const kind = pass ? 'overtake' : 'recovery';
      const recent = this.moments.at(-1);
      if (slot !== undefined && (!recent || state.frame - recent.tick > (recent.kind === kind ? 105 : 45))) {
        const sameKind = this.moments.filter(moment => moment.kind === kind);
        if (sameKind.length >= 2) this.moments.splice(this.moments.indexOf(sameKind[0]), 1);
        this.moments.push({ tick: state.frame, slot, rival: pass?.rival, kind, frames: this.history.slice() });
      }
    }
    if (enteringResults && this.automatic) {
      const primary = this.moments.at(-1);
      if (primary && primary.frames.length >= 2) {
        this.playlist = [primary];
        this.starts = now + RESULTS_DELAY;
      }
    }
  }

  sample(now: number) {
    if (this.previous?.phase !== 'results' || now < this.starts) return null;
    for (; this.index < this.playlist.length; this.index++) {
      const { frames, slot, kind, rival } = this.playlist[this.index];
      const tick = frames[0].frame + (now - this.starts) * TICKS_PER_MS;
      const next = frames.findIndex(frame => frame.frame > tick);
      if (next > 0) {
        const from = frames[next - 1], to = frames[next];
        return { from, to, slot, kind, rival, clip: this.index, count: this.playlist.length,
          alpha: (tick - from.frame) / (to.frame - from.frame) };
      }
      this.starts += (frames.at(-1)!.frame - frames[0].frame) / TICKS_PER_MS;
    }
    return null;
  }
}
