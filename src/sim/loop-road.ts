import type { Course } from '../shared/courses.ts';
import type { TrackLocation } from '../shared/track.ts';

/** The road station remains authoritative where an XZ projection folds over itself. */
export function loopAt(course: Course, s: number) {
  if (!course.loops?.length) return undefined;
  const station = course.wrap(s);
  return course.loops.find(loop => station >= loop.from && station <= loop.to);
}

export function courseHeading(course: Course, road: Pick<TrackLocation, 's' | 'dx' | 'dz'>) {
  return loopAt(course, road.s)?.yaw ?? Math.atan2(road.dx, road.dz);
}

export function positionOnRoad(car: { x: number; z: number; road: TrackLocation }, s: number, offset: number, course: Course) {
  const road = course.sampleAt(s);
  const frame = course.frameAt!(road.s, offset);
  car.x = frame.x;
  car.z = frame.z;
  car.road = { ...road, offset };
}
