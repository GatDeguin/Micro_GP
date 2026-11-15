import type { CourseId } from './protocol.ts';
import { safetyPanels } from './safety.ts';
import { GRID_ROWS, PIT_LANE, TRACK, TRACK_SECTORS, sectorAt } from './track.ts';
import { DIQUE } from './dique-track.ts';

export { DIQUE, diquePlanPoint } from './dique-track.ts';
export type CourseSector = (typeof TRACK_SECTORS)[number];

export interface Course extends Omit<typeof TRACK, 'anchors' | 'crossing'> {
  id: CourseId;
  crossing: Omit<typeof TRACK.crossing, 'x' | 'z'> & { x: number; z: number };
  pit: {
    entry: number;
    full: number;
    leave: number;
    exit: number;
    side: -1 | 1;
    offset: number;
    halfWidth: number;
    stalls: readonly number[];
    stationOffset: number;
    speedLimit: number;
  };
  gridRows: readonly [number, number];
  sectors: readonly CourseSector[];
  sectorAt(s: number, offset?: number): CourseSector;
  safetyPanels: readonly { s: number; side: -1 | 1; tyres: boolean }[];
  checkpoints: readonly number[];
  demoDistances: readonly number[];
  wetAt(s: number, offset: number): number;
}

export const TALLER = {
  ...TRACK, id: 'taller', pit: PIT_LANE, gridRows: GRID_ROWS,
  sectors: TRACK_SECTORS, sectorAt, safetyPanels,
  checkpoints: [0, TRACK.anchors.hairpinApex, TRACK.anchors.crest, TRACK.anchors.sweepApex],
  demoDistances: [6, TRACK.anchors.hairpin, TRACK.anchors.crest, TRACK.anchors.sweep],
  wetAt: () => 0,
} satisfies Course;

export function getCourse(id?: CourseId): Course {
  return id === 'dique' ? DIQUE : TALLER;
}
