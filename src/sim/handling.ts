export const BASE_TOP_SPEED = 8.05;

export const HANDLING = [
  // Compacto, Cupé, Bólido and Cuña in grid order.
  { steerRate: 14.8, yawGain: 1.045, straightBonus: 0, exitTraction: 0, cornerDrag: 0.94, compliance: 1.07 },
  { steerRate: 11.8, yawGain: 0.99, straightBonus: 0, exitTraction: 0.62, cornerDrag: 0.90, compliance: 0.94 },
  { steerRate: 10.4, yawGain: 0.92, straightBonus: 0.71, exitTraction: 0, cornerDrag: 1.22, compliance: 1.00 },
  { steerRate: 12.0, yawGain: 1.01, straightBonus: 0.04, exitTraction: 0.10, cornerDrag: 0.47, compliance: 0.76 },
] as const;

export type Handling = (typeof HANDLING)[number];

export interface Suspension {
  pitch: number;
  roll: number;
  heave: number;
}

export const settledSuspension = (): Suspension => ({ pitch: 0, roll: 0, heave: 0 });

function clamp(value: number, low: number, high: number) {
  return Math.max(low, Math.min(high, value));
}

export function loadSuspension(body: Suspension, style: Handling, longitudinal: number, lateral: number,
  vertical: number, curb: number, dt: number) {
  const pitch = clamp(-longitudinal * 0.0052, -0.055, 0.080) * style.compliance;
  const roll = clamp(lateral * 0.0063, -0.078, 0.078) * style.compliance;
  const heave = clamp(-vertical * 0.054, -0.065, 0.105) * style.compliance + curb * 0.017;
  const response = 1 - Math.exp(-dt * 11);
  body.pitch += (pitch - body.pitch) * response;
  body.roll += (roll - body.roll) * response;
  body.heave += (heave - body.heave) * response;
}
