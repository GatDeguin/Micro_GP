import type { CarDimensions } from '../shared/car-dimensions.ts';
import { TALLER, type Course } from '../shared/courses.ts';
import type { TrackLocation } from '../shared/track.ts';
import { loopAt } from './loop-road.ts';

const TIRE_PATCH = 0.125;
const GRAVITY = 9.8;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function tireLoad(road: TrackLocation, car: CarDimensions, along: number, across: number, course: Course = TALLER) {
  let curb = 0;
  let escape = 0;
  let gravel = 0;
  let grass = 0;
  let wet = 0;
  for (const axle of [-car.axle, car.axle]) {
    for (const tire of [-car.tireOffset, car.tireOffset]) {
      const s = road.s + axle * along - tire * across;
      const offset = road.offset + axle * across + tire * along;
      const bands = course.surfaceBandsAt(s, offset < 0 ? -1 : 1);
      // Each tire straddles a seam gradually instead of switching its grip all at once.
      const outside = (edge: number) => clamp01((Math.abs(offset) + TIRE_PATCH - edge) / (2 * TIRE_PATCH));
      const pastAsphalt = outside(bands.asphalt);
      const pastCurb = outside(bands.curb);
      const pastEscape = outside(bands.escape);
      const pastGravel = outside(bands.gravel);
      wet += course.wetAt(s, offset) * (1 - pastAsphalt) / 4;
      curb += (pastAsphalt - pastCurb) / 4;
      escape += (pastCurb - pastEscape) / 4;
      gravel += (pastEscape - pastGravel) / 4;
      grass += pastGravel / 4;
    }
  }
  return {
    curb, escape, gravel, grass,
    grip: 1 - 0.18 * wet - 0.21 * curb - 0.15 * escape - 0.39 * gravel - 0.58 * grass,
    drag: 0.54 * curb + 0.80 * escape + 3.80 * gravel + 2.75 * grass,
    speedLoss: 1.40 * curb + 1.65 * escape + 6.30 * gravel + 6.75 * grass,
  };
}

export function slopeFor(road: TrackLocation, along: number, across: number, course: Course = TALLER) {
  if (course.frameAt && loopAt(course, road.s)) {
    const frame = course.frameAt(road.s, road.offset);
    return {
      uphill: GRAVITY * (frame.ty * along - frame.ry * across),
      lateral: GRAVITY * (-frame.ry * along - frame.ty * across),
    };
  }
  const grade = (course.heightAt(road.s + 0.65, road.offset) - course.heightAt(road.s - 0.65, road.offset)) / 1.30;
  const bank = course.bankAt(road.s);
  const scale = GRAVITY / Math.hypot(1, grade, bank);
  return {
    uphill: (grade * along + bank * across) * scale,
    lateral: (bank * along - grade * across) * scale,
  };
}

export function barrierTangent(s: number, side: -1 | 1, course: Course = TALLER) {
  const before = course.sampleAt(s - 0.40);
  const after = course.sampleAt(s + 0.40);
  const beforeOffset = side * course.wallHalfAt(before.s, side);
  const afterOffset = side * course.wallHalfAt(after.s, side);
  const x = after.x - before.x - (after.dz * afterOffset - before.dz * beforeOffset);
  const z = after.z - before.z + (after.dx * afterOffset - before.dx * beforeOffset);
  const length = Math.hypot(x, z);
  return { dx: x / length, dz: z / length };
}
