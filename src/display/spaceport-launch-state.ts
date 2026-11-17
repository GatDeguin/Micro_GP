import type { RaceSnapshot } from '../shared/protocol.ts';

export const LAUNCH_SITE = { x: 26, z: -184, alertRadius: 132, readyRadius: 62 } as const;
const smooth = (x: number, a: number, b: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t);
};

/** Visual-only preflight. Owned cars take priority; AI cannot start it remotely. */
export function createLaunchSequence() {
  const state = { charge: 0, vent: 0, ignition: 0, warning: 0, nearest: Infinity };
  let target = 0, peak = 0, hold = 0, heat: number | undefined, last: number | undefined;
  function reset() { target = peak = hold = 0; state.charge = state.vent = state.ignition = state.warning = 0; }
  return {
    state,
    observe(snapshot: RaceSnapshot) {
      if (heat !== snapshot.heat) { reset(); heat = snapshot.heat; }
      state.nearest = Infinity;
      const live = snapshot.phase === 'race' || snapshot.phase === 'practice' || snapshot.phase === 'demo';
      if (!live) { target = peak = hold = 0; return; }
      const owned = snapshot.cars.some(car => car.active !== false && car.owned);
      for (const car of snapshot.cars) {
        if (car.active === false || (owned && !car.owned) || !Number.isFinite(car.x + car.y + car.z)) continue;
        state.nearest = Math.min(state.nearest, Math.hypot(car.x - LAUNCH_SITE.x, car.y, car.z - LAUNCH_SITE.z));
      }
      target = 1 - smooth(state.nearest, LAUNCH_SITE.readyRadius, LAUNCH_SITE.alertRadius);
      if (target > .6) { peak = Math.max(target, peak); hold = 2; }
    },
    update(now: number) {
      if (!Number.isFinite(now)) return state;
      const dt = last === undefined ? 0 : Math.max(0, Math.min(.1, (now - last) / 1000)); last = now;
      hold = Math.max(0, hold - dt);
      const goal = Math.max(target, peak * smooth(hold, 0, 1.2));
      if (!hold) peak = 0;
      state.charge += (goal - state.charge) * (1 - Math.exp(-dt / (goal > state.charge ? .48 : 1.65)));
      state.vent = smooth(state.charge, .03, .70);
      state.ignition = smooth(state.charge, .48, .94);
      state.warning = smooth(state.charge, .07, .40);
      return state;
    },
  };
}
