import { TRACK } from '../shared/track';

function roofDistance(s: number, from: number, to: number) {
  const length = TRACK.wrap(to - from);
  const position = TRACK.wrap(s - from);
  return position <= length ? 0 : Math.min(position - length, TRACK.length - position);
}

export function coverClearance(s: number) {
  const { crossing, tunnel } = TRACK;
  const deck = roofDistance(s, crossing.lowerFrom, crossing.lowerTo) === 0 ? crossing.clearance : Infinity;
  const roof = roofDistance(s, tunnel.from, tunnel.to) === 0 ? tunnel.clearance : Infinity;
  return Math.min(deck, roof);
}

export function approachingCover(s: number, margin: number) {
  const { crossing, tunnel } = TRACK;
  const distance = Math.min(roofDistance(s, crossing.lowerFrom, crossing.lowerTo), roofDistance(s, tunnel.from, tunnel.to));
  const t = Math.max(0, 1 - distance / margin);
  return t * t * (3 - 2 * t);
}
