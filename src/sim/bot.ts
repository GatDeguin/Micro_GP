import type { CarDimensions } from '../shared/car-dimensions.ts';
import type { Difficulty, DriveInput } from '../shared/protocol.ts';
import { roadHalfAt, TRACK, wallHalfAt, type TrackLocation } from '../shared/track.ts';
import { arcDelta } from './progress.ts';

const pace = [7.40, 7.38, 7.59, 7.43];
const cornering = [1, 1.015, 0.93, 1.10];
const previewDistances = [2.2, 4.4, 6.6, 8.8];
const behavior = {
  rookie: { pace: 0.86, reaction: 0.30, precision: 1.66, prediction: 0.33, room: 0.17, lateral: 10.3 },
  club: { pace: 1.0, reaction: 0.16, precision: 1.85, prediction: 0.43, room: 0.10, lateral: 12.2 },
  pro: { pace: 1.105, reaction: 0.085, precision: 2.07, prediction: 0.56, room: 0.06, lateral: 13.7 },
} satisfies Record<Difficulty, Record<string, number>>;

export function angleDifference(angle: number) {
  if (angle > Math.PI) return angle - Math.PI * 2;
  if (angle < -Math.PI) return angle + Math.PI * 2;
  return angle;
}

export interface BotPlan {
  lane: number;
  time: number;
  wrongWay: number;
}

interface BotCar {
  active: boolean;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  road: TrackLocation;
  dimensions: CarDimensions;
  bot: BotPlan;
}

type Behavior = (typeof behavior)[Difficulty];

function curvePace(car: BotCar, top: number, lateral: number) {
  let previousHeading = Math.atan2(car.road.dx, car.road.dz);
  let safeSpeed = top;
  for (const distance of previewDistances) {
    const point = TRACK.sampleAt(car.road.s + distance);
    const heading = Math.atan2(point.dx, point.dz);
    const curvature = angleDifference(heading - previousHeading) / previewDistances[0];
    previousHeading = heading;
    if (Math.abs(curvature) < 0.01) continue;
    // The inside lane has a smaller turning radius. Start slowing before its braking point.
    const laneFactor = Math.max(0.55, 1 + curvature * car.bot.lane);
    const cornerSpeedSquared = lateral * laneFactor / Math.abs(curvature);
    const brakingRoom = Math.max(0, distance - 3.2);
    safeSpeed = Math.min(safeSpeed, Math.sqrt(cornerSpeedSquared + 2 * 4.2 * brakingRoom));
  }
  return safeSpeed;
}

function traffic(cars: readonly BotCar[], car: BotCar, lane: number, settings: Behavior) {
  let gap = 9;
  let trafficSpeed = 0;
  let rearRisk = 0;
  for (const other of cars) {
    if (other === car || !other.active) continue;
    const combinedWidth = car.dimensions.halfWidth + other.dimensions.halfWidth + settings.room;
    if (Math.abs(other.road.offset - lane) >= combinedWidth) continue;

    const lead = arcDelta(car.road.s, other.road.s);
    const speed = other.speed * Math.cos(other.yaw - Math.atan2(other.road.dx, other.road.dz));
    if (lead >= -0.40) {
      const open = Math.max(0, lead - car.dimensions.front - other.dimensions.rear);
      if (open < gap) {
        gap = open;
        trafficSpeed = speed;
      }
    } else {
      const open = -lead - car.dimensions.rear - other.dimensions.front;
      const closing = Math.max(0, speed - car.speed);
      rearRisk = Math.max(rearRisk, 1.25 - open + closing * settings.prediction);
    }
  }
  return { gap, trafficSpeed, rearRisk };
}

export function botDrive(cars: readonly BotCar[], index: number, preferred: number, difficulty: Difficulty,
  coolingDown: boolean, dt: number): DriveInput {
  const car = cars[index];
  const settings = behavior[difficulty];
  const look = TRACK.sampleAt(car.road.s + 1.8 + Math.max(0, car.speed) * 0.31);
  const widest = (side: number) => side * Math.min(roadHalfAt(look.s) + 0.065,
    wallHalfAt(look.s, side) - car.dimensions.halfWidth - 0.11);
  const outer = widest(1);
  const inner = widest(-1);
  car.bot.lane = Math.max(inner, Math.min(outer, car.bot.lane));
  car.bot.time -= dt;

  if (car.bot.time <= 0) {
    const currentPlan = car.bot.lane;
    let nextLane = currentPlan;
    let best = -Infinity;
    // A clear shoulder is a short-term escape, while a fast car approaching from behind keeps its lane.
    for (const candidate of [preferred, -preferred, Math.sign(preferred) > 0 ? outer : inner,
      Math.sign(preferred) > 0 ? inner : outer]) {
      const { gap, trafficSpeed, rearRisk } = traffic(cars, car, candidate, settings);
      const forward = Math.min(9, gap + settings.prediction * trafficSpeed);
      const shoulder = Math.abs(candidate) > Math.abs(preferred) ? 1.85 : 0;
      const score = forward - rearRisk * 1.45 - shoulder - 0.56 * Math.abs(candidate - car.road.offset)
        - (candidate === preferred ? 0 : 0.78) - 0.23 * Math.abs(candidate - currentPlan);
      if (score > best) {
        nextLane = candidate;
        best = score;
      }
    }
    car.bot.lane = nextLane;
    car.bot.time = settings.reaction;
  }

  const clear = traffic(cars, car, car.bot.lane, settings);
  const changingLane = Math.abs(car.bot.lane - car.road.offset) > 0.40;
  const current = changingLane ? traffic(cars, car, car.road.offset, settings) : clear;
  const aimX = look.x - look.dz * car.bot.lane - car.x;
  const aimZ = look.z + look.dx * car.bot.lane - car.z;
  const heading = Math.atan2(car.road.dx, car.road.dz);
  const steering = angleDifference(car.yaw - Math.atan2(aimX, aimZ));
  const headroom = 0.28 + settings.room;
  const following = (space: ReturnType<typeof traffic>) => space.trafficSpeed * 0.94 + (space.gap - headroom) * 2.1;
  const target = following(clear);
  // Keep braking for traffic in the swept lane until the car has actually moved clear of it.
  const sweptLimit = changingLane && target > following(current) ? Math.max(0.42, following(current)) : Infinity;
  const desired = Math.min(
    curvePace(car, coolingDown ? 4.7 : pace[index] * settings.pace, settings.lateral * cornering[index]),
    Math.max(0, target), sweptLimit,
  );
  const brakingMargin = desired < 1.4 ? 0.045 : 0.35;
  car.bot.wrongWay = Math.cos(car.yaw - heading) < -0.35 ? car.bot.wrongWay + dt : 0;
  return {
    x: Math.max(-1, Math.min(1, steering * settings.precision)),
    gas: car.speed < desired,
    brake: car.speed > desired + brakingMargin,
  };
}
