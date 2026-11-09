import type { CarView, RaceSnapshot } from '../shared/protocol.ts';

const LEAD_IN_TICKS = 105;
const TAIL_TICKS = 24;
const RESULTS_DELAY = 850;
const TICKS_PER_MS = 0.048;

interface Moment {
  tick: number;
  slot: number;
  finish: boolean;
  frames: RaceSnapshot[];
}

function overtake(previous: RaceSnapshot, state: RaceSnapshot) {
  return state.order.find((slot, rank) => {
    const other = state.order[rank + 1];
    if (previous.order[rank] !== other || previous.order[rank + 1] !== slot) return false;
    const a = state.cars[slot], b = state.cars[other];
    return Math.hypot(a.x - b.x, a.z - b.z) < 3.5;
  });
}

export function replayCompanion(cars: readonly CarView[], slot: number) {
  const subject = cars[slot];
  const forwardX = Math.sin(subject.yaw), forwardZ = Math.cos(subject.yaw);
  let best = -1;
  let nearest = 8 * 8;
  for (let i = 0; i < cars.length; i++) {
    if (i === slot) continue;
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
  private moment?: Moment;
  private starts = Infinity;

  add(state: RaceSnapshot, now: number) {
    const previous = this.previous;
    this.previous = state;
    if (!previous || previous.heat !== state.heat || state.frame < previous.frame ||
        state.phase === 'demo' || state.phase === 'grid') {
      this.history = [];
      this.moment = undefined;
      this.starts = Infinity;
    }
    if (!previous || previous.heat !== state.heat || state.frame <= previous.frame) return;
    const enteringResults = state.phase === 'results' && previous.phase === 'race';
    if (state.phase !== 'race' && !enteringResults) return;
    if (this.moment && state.frame <= this.moment.tick + TAIL_TICKS) this.moment.frames.push(state);
    this.history.push(state);
    while (this.history[0].frame < state.frame - LEAD_IN_TICKS) this.history.shift();

    const finish = state.flag && !previous.flag;
    const slot = finish ? state.order[0]
      : state.phase === 'race' && !state.flag && previous.phase === 'race' ? overtake(previous, state) : undefined;
    const hasTail = !this.moment || state.frame >= this.moment.tick + TAIL_TICKS;
    if (slot !== undefined && !this.moment?.finish && (finish || hasTail)) {
      this.moment = { tick: state.frame, slot, finish, frames: this.history.slice() };
    }
    if (enteringResults && this.moment && this.moment.frames.length >= 2) this.starts = now + RESULTS_DELAY;
  }

  sample(now: number) {
    if (this.previous?.phase !== 'results' || !this.moment || now < this.starts) return null;
    const { frames, slot } = this.moment;
    const tick = frames[0].frame + (now - this.starts) * TICKS_PER_MS;
    const index = frames.findIndex(frame => frame.frame > tick);
    if (index < 1) return null;
    const from = frames[index - 1], to = frames[index];
    return { from, to, slot, alpha: (tick - from.frame) / (to.frame - from.frame) };
  }
}
