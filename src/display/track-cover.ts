import { TALLER, type Course } from '../shared/courses';

function roofDistance(course: Course, s: number, from: number, to: number) {
  const length = course.wrap(to - from);
  const position = course.wrap(s - from);
  return position <= length ? 0 : Math.min(position - length, course.length - position);
}

export function coverClearance(s: number, course = TALLER as Course) {
  const { crossing, tunnel } = course;
  const deck = roofDistance(course, s, crossing.lowerFrom, crossing.lowerTo) === 0 ? crossing.clearance : Infinity;
  const roof = roofDistance(course, s, tunnel.from, tunnel.to) === 0 ? tunnel.clearance : Infinity;
  return Math.min(deck, roof);
}

export function approachingCover(s: number, margin: number, course = TALLER as Course) {
  const { crossing, tunnel } = course;
  const distance = Math.min(roofDistance(course, s, crossing.lowerFrom, crossing.lowerTo), roofDistance(course, s, tunnel.from, tunnel.to));
  const t = Math.max(0, 1 - distance / margin);
  return t * t * (3 - 2 * t);
}
