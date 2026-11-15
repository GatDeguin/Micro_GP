import { diqueRoadDistance, type Course } from './courses.ts';

export type ArcadeKind = 'turbo' | 'shield' | 'oil' | 'pop';
export type ArcadeTrap = 'oil' | 'pop';
export type ArcadeEventKind = ArcadeKind | 'slip' | 'explosion' | 'jump' | 'land' | 'block';

export interface ArcadePickup {
  s: number;
  offset: number;
  kind: ArcadeKind;
}

export interface ArcadeRamp {
  /** The takeoff lip. The deck starts at s - length. */
  s: number;
  offset: number;
  length: number;
  halfWidth: number;
  height: number;
}

export interface ArcadeLayout {
  pickups: readonly ArcadePickup[];
  ramps: readonly ArcadeRamp[];
}

export interface ArcadeHazard {
  id: number;
  kind: ArcadeTrap;
  x: number;
  y: number;
  z: number;
}

export interface ArcadeEvent {
  id: number;
  frame: number;
  kind: ArcadeEventKind;
  x: number;
  y: number;
  z: number;
  slot: number;
  strength: number;
}

export interface ArcadeView {
  available: readonly boolean[];
  hazards: readonly ArcadeHazard[];
  events: readonly ArcadeEvent[];
}

export interface ArcadeCarView {
  turbo: boolean;
  shield: boolean;
  skid: boolean;
  /** Height above the road, including the rise on the ramp. */
  jump: number;
}

function row(s: number, left: ArcadeKind, right: ArcadeKind, spacing: number): ArcadePickup[] {
  return [{ s, offset: -spacing, kind: left }, { s, offset: spacing, kind: right }];
}

const taller: ArcadeLayout = {
  pickups: [
    ...row(8.8, 'turbo', 'shield', 1.22),
    ...row(59, 'oil', 'pop', 1.24),
    ...row(82.8, 'shield', 'turbo', 1.14),
    ...row(125.4, 'pop', 'oil', 1.27),
    ...row(155.0, 'shield', 'oil', 1.15),
  ],
  ramps: [
    { s: 20.0, offset: 0.77, length: 2.9, halfWidth: 0.93, height: 0.31 },
    { s: 109.2, offset: -0.60, length: 2.65, halfWidth: 0.86, height: 0.25 },
  ],
};

const dique: ArcadeLayout = {
  pickups: [
    ...row(28, 'turbo', 'shield', 1.70),
    ...row(82, 'oil', 'pop', 1.65),
    ...row(134, 'shield', 'oil', 1.60),
    ...row(diqueRoadDistance(316), 'oil', 'pop', 1.70),
    ...row(diqueRoadDistance(420), 'turbo', 'shield', 1.61),
    ...row(diqueRoadDistance(536), 'shield', 'pop', 1.73),
    ...row(diqueRoadDistance(696), 'pop', 'turbo', 1.80),
  ],
  ramps: [
    { s: 63, offset: 1.04, length: 3.48, halfWidth: 1.17, height: 0.40 },
    { s: diqueRoadDistance(445), offset: -0.94, length: 3.4, halfWidth: 1.08, height: 0.37 },
    { s: diqueRoadDistance(686), offset: 1.08, length: 3.25, halfWidth: 1.13, height: 0.36 },
  ],
};

export function arcadeLayout(course: Course): ArcadeLayout {
  return course.id === 'dique' ? dique : taller;
}

export const arcadeTrapRadius = { oil: 0.78, pop: 0.61 } as const;
