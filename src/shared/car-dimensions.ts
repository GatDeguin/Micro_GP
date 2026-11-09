export const GRID_LANE_OFFSET = 0.93;
export const WHEEL_SIDE = 0.417;
export const WHEEL_RADIUS = 0.207;

const renderScale = [1.4125, 1.3688, 1.65] as const;

// Model-local nose, tail and axle distances include the bumpers and lamp housings.
const envelopes = [
  [0.934, 0.931, 0.563],
  [1.102, 1.021, 0.610],
  [1.044, 1.021, 0.585],
  [1.084, 1.011, 0.605],
] as const;

export interface CarDimensions {
  renderScale: typeof renderScale;
  front: number;
  rear: number;
  halfWidth: number;
  axle: number;
  tireOffset: number;
}

export const CAR_DIMENSIONS: readonly CarDimensions[] = envelopes.map(([nose, tail, axle]) => ({
  renderScale,
  front: nose * renderScale[2],
  rear: tail * renderScale[2],
  halfWidth: 0.559 * renderScale[0],
  axle: axle * renderScale[2],
  tireOffset: (WHEEL_SIDE + 0.084) * renderScale[0],
}));
