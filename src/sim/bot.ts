import type { CarDimensions } from '../shared/car-dimensions.ts';
import type { Difficulty, DriveInput } from '../shared/protocol.ts';
import type { Course } from '../shared/courses.ts';
import type { TrackLocation } from '../shared/track.ts';
import { arcDelta } from './progress.ts';
import { courseHeading, loopAt } from './loop-road.ts';
import { BASE_TOP_SPEED, STRAIGHT_SPEED_GAIN } from './handling.ts';

const pace = [7.92, 7.86, 8.08, 7.96];
const cornering = [1, 1.015, 0.93, 1.10];
const previewStep = 1.8;
const behavior = {
  rookie: { pace: 0.86, diquePace: .64, spaceportPace: .80, reaction: 0.30, precision: 1.66, prediction: 0.33, room: 0.17, lateral: 10.3 },
  club: { pace: 1.0, diquePace: .80, spaceportPace: 1, reaction: 0.16, precision: 1.85, prediction: 0.43, room: 0.10, lateral: 12.2 },
  pro: { pace: 1.105, diquePace: .92, spaceportPace: 1.05, reaction: 0.085, precision: 2.07, prediction: 0.56, room: 0.06, lateral: 13.7 },
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
  commitment?: number;
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

function curvePace(car: BotCar, top: number, lateral: number, course: Course) {
  let previousHeading = courseHeading(course, car.road);
  let safeSpeed = top;
  // A boost or a handover from a fast human needs a longer braking horizon.
  const preview = Math.max(10.8, car.speed * car.speed / 12 + 3.2);
  for (let distance = previewStep; distance <= preview; distance += previewStep) {
    const point = course.sampleAt(car.road.s + distance);
    const heading = courseHeading(course, point);
    const curvature = angleDifference(heading - previousHeading) / previewStep;
    previousHeading = heading;
    if (Math.abs(curvature) < 0.01) continue;
    // The inside lane has a smaller turning radius. Start slowing before its braking point.
    const laneFactor = Math.max(0.55, 1 + curvature * car.bot.lane);
    const bank = course.bankAt(point.s - previewStep * 0.5);
    const bankSupport = 9.8 * bank * Math.sign(curvature) / Math.hypot(1, bank);
    const wetGrip = 1 - 0.18 * course.wetAt(point.s, car.bot.lane);
    const cornerSpeedSquared = (lateral * wetGrip + bankSupport) * laneFactor / Math.abs(curvature);
    const brakingRoom = Math.max(0, distance - 3.2);
    safeSpeed = Math.min(safeSpeed, Math.sqrt(cornerSpeedSquared + 2 * 4.5 * brakingRoom));
  }
  return safeSpeed;
}

function traffic(cars: readonly BotCar[], car: BotCar, lane: number, settings: Behavior, course: Course) {
  let gap = 9;
  let trafficSpeed = 0;
  let rearRisk = 0;
  let blocked = false;
  for (const other of cars) {
    if (other === car || !other.active) continue;
    const lead = arcDelta(car.road.s, other.road.s, course.length);
    if (Math.abs(lead) > 20) continue;
    const heading = other.yaw - courseHeading(course, other.road);
    const speed = other.speed * Math.cos(heading);
    // Normal corner tracking has a small yaw error; extrapolating that error treats
    // two parallel racing lines as a merge and makes both drivers yield forever.
    const crossing = Math.sign(heading) * Math.max(0, Math.abs(Math.sin(heading)) - 0.14);
    const across = -other.speed * crossing;
    const halfLength = Math.max(other.dimensions.front, other.dimensions.rear);
    const width = other.dimensions.halfWidth + Math.abs(crossing) * halfLength;
    const combinedWidth = car.dimensions.halfWidth + width + settings.room;
    const predictedOffset = other.road.offset + Math.max(-0.65, Math.min(0.65, across * settings.prediction));
    const nearOffset = Math.min(other.road.offset, predictedOffset) - combinedWidth;
    const farOffset = Math.max(other.road.offset, predictedOffset) + combinedWidth;
    const longitudinalRoom = car.dimensions.front + other.dimensions.rear - 0.25;
    const futureLead = lead + (speed - car.speed) * settings.prediction;
    const movingToward = (lane - car.road.offset) * (predictedOffset - car.road.offset) > 0;
    // A free destination is not enough: the move must not cut across a car beside us.
    if (movingToward && Math.abs(lane - car.road.offset) > 0.15 && Math.abs(lead) < longitudinalRoom
      && Math.abs(futureLead) < longitudinalRoom
      && Math.max(lane, car.road.offset) > nearOffset && Math.min(lane, car.road.offset) < farOffset) blocked = true;
    if (lane <= nearOffset || lane >= farOffset) continue;
    if (lead > 0.05) {
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
  return { gap, trafficSpeed, rearRisk, blocked };
}

export function botDrive(cars: readonly BotCar[], index: number, preferred: number, difficulty: Difficulty,
  coolingDown: boolean, dt: number, course: Course): DriveInput {
  const car = cars[index];
  const settings = behavior[difficulty];
  const look = course.sampleAt(car.road.s + 1.64 + Math.max(0, car.speed) * 0.34);
  const entry = car.road.s + 1.2;
  const widest = (side: number) => side * Math.min(Math.min(course.roadHalfAt(entry), course.roadHalfAt(look.s)) + 0.06,
    Math.min(course.wallHalfAt(entry, side), course.wallHalfAt(look.s, side)) - car.dimensions.halfWidth - 0.18);
  const outer = widest(1);
  const inner = widest(-1);
  car.bot.lane = Math.max(inner, Math.min(outer, car.bot.lane));
  car.bot.time -= dt;
  car.bot.commitment = Math.max(0, (car.bot.commitment ?? 0) - dt);

  if (car.bot.time <= 0) {
    const currentPlan = car.bot.lane;
    let nextLane = Math.max(inner, Math.min(outer, car.road.offset));
    let best = -Infinity;
    // A clear shoulder is a short-term escape, while a fast car approaching from behind keeps its lane.
    for (const wanted of [currentPlan, preferred, -preferred, Math.sign(preferred) > 0 ? outer : inner,
      Math.sign(preferred) > 0 ? inner : outer]) {
      const candidate = Math.max(inner, Math.min(outer, wanted));
      const { gap, trafficSpeed, rearRisk, blocked } = traffic(cars, car, candidate, settings, course);
      if (blocked) continue;
      const forward = Math.min(9, gap + settings.prediction * trafficSpeed);
      const shoulder = Math.abs(candidate) > Math.abs(preferred) ? 1.85 : 0;
      const wet = course.wetAt(look.s, candidate);
      const committed = car.bot.commitment > 0 && Math.abs(candidate - currentPlan) > 0.1 ? 1.7 : 0;
      const score = forward - rearRisk * 1.45 - shoulder - wet * 0.45 - 0.56 * Math.abs(candidate - car.road.offset)
        - (candidate === preferred ? 0 : 0.78) - 0.38 * Math.abs(candidate - currentPlan) - committed;
      if (score > best) {
        nextLane = candidate;
        best = score;
      }
    }
    if (Math.abs(nextLane - currentPlan) > 0.4) car.bot.commitment = 0.65 + settings.reaction;
    car.bot.lane = nextLane;
    car.bot.time = settings.reaction;
  }

  const clear = traffic(cars, car, car.bot.lane, settings, course);
  const changingLane = Math.abs(car.bot.lane - car.road.offset) > 0.40;
  const current = changingLane ? traffic(cars, car, car.road.offset, settings, course) : clear;
  const aimX = look.x - look.dz * car.bot.lane - car.x;
  const aimZ = look.z + look.dx * car.bot.lane - car.z;
  const heading = courseHeading(course, car.road);
  const aim = loopAt(course, car.road.s)
    ? heading + Math.atan2(car.road.offset - car.bot.lane, arcDelta(car.road.s, look.s, course.length))
    : Math.atan2(aimX, aimZ);
  const steering = angleDifference(car.yaw - aim);
  const headroom = 0.28 + settings.room;
  const following = (space: ReturnType<typeof traffic>) => space.trafficSpeed * 0.94 + (space.gap - headroom) * 2.1;
  const target = following(clear);
  // Keep braking for traffic in the swept lane until the car has actually moved clear of it.
  const sweptLimit = changingLane && target > following(current) ? Math.max(0.42, following(current)) : Infinity;
  const surface = course.surfaceAt(car.road.s, car.road.offset);
  const offRoadLimit = surface === 'grass' ? 4.6 : surface === 'gravel' ? 5.3 : Infinity;
  // Long circuits share the player's current engine/gearbox ceiling. The old
  // workshop-era target left Club bots at 10 m/s while players reached 15–16.
  const physicalTop = (BASE_TOP_SPEED + STRAIGHT_SPEED_GAIN) * pace[index] / 7.96;
  const topPace = course.id === 'taller' ? pace[index] * settings.pace
    : physicalTop * (course.id === 'spaceport' ? settings.spaceportPace : settings.diquePace);
  // Following a distant aim point at racing speed after a spin only widens the excursion.
  const alignment = Math.abs(angleDifference(car.yaw - heading));
  const recoveryLimit = alignment > 0.75 ? Math.max(2.2, 5.2 - alignment * 1.5) : Infinity;
  const desired = Math.min(
    curvePace(car, coolingDown ? 4.7 : topPace,
      settings.lateral * cornering[index] * (course.id === 'spaceport' && difficulty === 'pro' ? 1.20 : 1), course),
    Math.max(0, target), sweptLimit, offRoadLimit, recoveryLimit,
  );
  const brakingMargin = desired < 1.4 ? 0.045 : 0.35;
  car.bot.wrongWay = Math.cos(car.yaw - heading) < -0.35 ? car.bot.wrongWay + dt : 0;
  return {
    x: Math.max(-1, Math.min(1, steering * settings.precision)),
    gas: car.speed < desired,
    brake: car.speed > desired + brakingMargin,
  };
}
