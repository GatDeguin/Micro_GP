import type { CarView, RaceSnapshot } from '../shared/protocol.ts';
import { PIT_LANE } from '../shared/track.ts';

interface Position { x: number; y: number; z: number }

export function nearestCar(cars: readonly CarView[], point: Position, radius: number) {
  let closest: CarView | undefined;
  let nearest = radius ** 2;
  for (const car of cars) {
    if (car.active === false || Math.abs(car.y - point.y) > 1.25) continue;
    const distance = (car.x - point.x) ** 2 + (car.z - point.z) ** 2;
    if (distance >= nearest) continue;
    nearest = distance;
    closest = car;
  }
  return closest;
}

export function crowdCue(previous: RaceSnapshot | undefined, current: RaceSnapshot, finish: Position) {
  if (!previous || current.heat !== previous.heat || current.frame <= previous.frame || previous.phase !== 'race') return null;
  if (current.flag && !previous.flag) return 'finish';
  if (current.phase !== 'race') return null;

  for (const [index, slot] of current.order.entries()) {
    const car = current.cars[slot];
    const oldIndex = previous.order.indexOf(slot);
    if (!car || oldIndex <= index || !nearestCar([car], finish, 12)) continue;
    const passed = previous.order.slice(index, oldIndex).some(rival => {
      const other = current.cars[rival];
      return other && other.lap === car.lap && current.order.indexOf(rival) > index && nearestCar([other], car, 5.5);
    });
    if (passed) return 'pass';
  }
  return null;
}

export function marshalSignal(snapshot: RaceSnapshot, cautionUntil: number) {
  if (snapshot.phase === 'demo') return 'idle';
  if (snapshot.phase === 'grid') return 'red';
  if (snapshot.flag || snapshot.phase === 'results') return 'checkered';
  if (snapshot.frame < cautionUntil) return 'yellow';
  return 'green';
}

export function pitGateOpen(snapshot: RaceSnapshot, approach: Position, wasOpen: boolean) {
  if (snapshot.phase !== 'race' && snapshot.phase !== 'practice') return false;
  const traffic = snapshot.cars.filter(car => car.pitReady || Math.abs(car.speed) < PIT_LANE.speedLimit + 1.25);
  return Boolean(nearestCar(traffic, approach, wasOpen ? 3.6 : 2.65));
}
