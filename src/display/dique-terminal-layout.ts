import { diquePlanPoint } from '../shared/dique-track.ts';

export const freightLane = {
  from: diquePlanPoint(216, 85.7),
  to: diquePlanPoint(238, 85.7),
  gate: diquePlanPoint(234.7, 90.65),
  period: 36,
};

export function sampleFreightTruck(seconds: number) {
  const time = (seconds % freightLane.period + freightLane.period) % freightLane.period;
  const returning = time >= 19;
  const duration = returning ? 11 : 9.5;
  const blend = Math.max(0, Math.min(1, (time - (returning ? 20.5 : 2.5)) / duration));
  const span = freightLane.to.x - freightLane.from.x;
  const eased = blend * blend * (3 - 2 * blend);
  return {
    x: freightLane.from.x + span * (returning ? 1 - eased : eased),
    speed: (returning ? -1 : 1) * span * 6 * blend * (1 - blend) / duration,
    inspection: time > 12.2 && time < 19,
  };
}
