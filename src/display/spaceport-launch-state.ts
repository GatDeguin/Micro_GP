import type { RaceSnapshot } from '../shared/protocol.ts';

export const LAUNCH_SITE = { x: 26, z: -184, alertRadius: 132, readyRadius: 62, triggerRadius: 120 } as const;
export const LAUNCH_DURATION = 14;
const smooth = (x: number, a: number, b: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t);
};
export interface RocketLaunchState {
  phase: 'ready' | 'ignition' | 'ascent' | 'clearing' | 'rearming';
  charge: number; vent: number; ignition: number; warning: number;
  altitude: number; opacity: number; smoke: number; elapsed: number; serial: number; nearest: number;
}

/** One timeline drives geometry, particles and audio. Each driver's lap can trigger once. */
export function createLaunchSequence() {
  const state: RocketLaunchState = { phase: 'ready', charge: 0, vent: 0, ignition: 0, warning: 0,
    altitude: 0, opacity: 1, smoke: 0, elapsed: 0, serial: 0, nearest: Infinity };
  const usedLaps = new Map<number, number>();
  let target = 0, pending = false, heat: number | undefined, phase: RaceSnapshot['phase'] | undefined;
  let last: number | undefined;
  function reset() {
    target = 0; pending = false; last = undefined; usedLaps.clear();
    Object.assign(state, { phase: 'ready', charge: 0, vent: 0, ignition: 0, warning: 0,
      altitude: 0, opacity: 1, smoke: 0, elapsed: 0, nearest: Infinity });
  }
  return {
    state,
    observe(snapshot: RaceSnapshot) {
      if (heat !== snapshot.heat || phase !== snapshot.phase) { reset(); heat = snapshot.heat; phase = snapshot.phase; }
      state.nearest = Infinity;
      if (!['race', 'practice', 'demo'].includes(snapshot.phase)) return;
      const owned = snapshot.cars.some(car => car.active !== false && car.owned);
      let eligibleDistance = Infinity;
      for (let slot = 0; slot < snapshot.cars.length; slot++) {
        const car = snapshot.cars[slot];
        if (car.active === false || (owned && !car.owned) || !Number.isFinite(car.x + car.y + car.z + car.lap)) continue;
        const distance = Math.hypot(car.x - LAUNCH_SITE.x, car.y, car.z - LAUNCH_SITE.z);
        state.nearest = Math.min(state.nearest, distance);
        if (usedLaps.get(slot) === car.lap) continue;
        eligibleDistance = Math.min(eligibleDistance, distance);
        if (distance <= LAUNCH_SITE.triggerRadius) {
          // Drivers passing together share this launch, including during its cooldown.
          usedLaps.set(slot, car.lap);
          if (state.phase === 'ready') pending = true;
        }
      }
      target = 1 - smooth(eligibleDistance, LAUNCH_SITE.readyRadius, LAUNCH_SITE.alertRadius);
    },
    update(now: number) {
      if (!Number.isFinite(now)) return state;
      const dt = last === undefined || now < last ? 0 : Math.min(.1, (now - last) / 1000);
      last = now;
      if (pending) { pending = false; state.phase = 'ignition'; state.elapsed = 0; state.serial++; }
      if (state.phase === 'ready') {
        state.charge += (target - state.charge) * (1 - Math.exp(-dt / .48));
        state.vent = smooth(state.charge, .03, .70) * .4;
        state.warning = smooth(state.charge, .07, .40);
        return state;
      }
      const t = state.elapsed += dt;
      state.phase = t < .8 ? 'ignition' : t < 10.8 ? 'ascent' : t < 12.6 ? 'clearing' : 'rearming';
      state.charge = 1 - smooth(t, 12.6, LAUNCH_DURATION);
      state.warning = state.charge;
      state.ignition = smooth(t, 0, .55) * (1 - smooth(t, 9.2, 10.8));
      state.altitude = t < 12.6 ? 4.8 * Math.max(0, Math.min(10, t - .8)) ** 2 : 0;
      state.opacity = t < 12.6 ? 1 - smooth(t, 9.2, 10.8) : smooth(t, 12.6, 13.6);
      state.smoke = smooth(t, 0, .7) * (1 - smooth(t, 12.6, LAUNCH_DURATION));
      state.vent = Math.max(state.smoke, state.ignition);
      if (t >= LAUNCH_DURATION) {
        Object.assign(state, { phase: 'ready', charge: 0, vent: 0, ignition: 0, warning: 0,
          altitude: 0, opacity: 1, smoke: 0, elapsed: 0 });
        target = 0;
      }
      return state;
    },
  };
}
