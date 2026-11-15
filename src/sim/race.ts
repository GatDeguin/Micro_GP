import {
  CAR_SPECS, NEUTRAL, defaultRaceConfig, normalizeRaceConfig, type DriveInput,
  type Driver, type Livery, type RaceConfig, type RaceImpact, type RaceSnapshot,
} from '../shared/protocol.ts';
import { CAR_DIMENSIONS, GRID_LANE_OFFSET, type CarDimensions } from '../shared/car-dimensions.ts';
import { getCourse, TALLER, type Course } from '../shared/courses.ts';
import { safetyPanelSpacing } from '../shared/safety.ts';
import type { TrackLocation } from '../shared/track.ts';
import { arcadeView, ArcadeRules, newArcadeCar, type ArcadeCar } from './arcade.ts';
import { angleDifference, botDrive, type BotPlan } from './bot.ts';
import { capsule, contactBetween } from './contact.ts';
import { BASE_TOP_SPEED, HANDLING, STRAIGHT_SPEED_GAIN, loadSuspension, settledSuspension, type Handling, type Suspension } from './handling.ts';
import { arcDelta, LapProgress } from './progress.ts';
import { barrierTangent, slopeFor, tireLoad } from './road-contact.ts';
import { RaceTiming } from './timing.ts';
import { AutomaticTransmission } from './transmission.ts';

const GRID_TIME = 3;
const FINISH_WINDOW = 15;
const RESULTS_TIME = 6;
const EPSILON = 1e-8;
const IMPACT_MEMORY_FRAMES = 24;
const IMPACT_COOLDOWN_FRAMES = 12;
const CONTACT_GAP_FRAMES = 4;
const MIN_AUDIBLE_IMPULSE = 0.46;
const FULL_STRENGTH_IMPULSE = 7.2;

const laneFor = (index: number) => index % 2 === 0 ? GRID_LANE_OFFSET : -GRID_LANE_OFFSET;
const quietSurface = () => ({ curb: 0, runoff: 0, gravel: 0, grass: 0, scrape: 0 });
const barrierResponse = {
  rail: { slide: 0.90, bounce: 0.13, addedBounce: 0.15 },
  tyres: { slide: 0.78, bounce: 0.045, addedBounce: 0.055 },
  fence: { slide: 0.96, bounce: 0.10, addedBounce: 0.16 },
};

interface Car {
  x: number;
  z: number;
  yaw: number;
  dimensions: CarDimensions;
  handling: Handling;
  suspension: Suspension;
  exitLoad: number;
  motionYaw: number;
  speed: number;
  road: TrackLocation;
  progress: LapProgress;
  timing: RaceTiming;
  bot: BotPlan;
  steer: number;
  throttle: number;
  brakePressure: number;
  transmission: AutomaticTransmission;
  surfaceSound: ReturnType<typeof quietSurface>;
  active: boolean;
  owned: boolean;
  registeredDriver: boolean;
  livery: Livery;
  human: boolean;
  braking: boolean;
  reverseReady: boolean;
  reversing: boolean;
  stalled: number;
  protection: number;
  arcade?: ArcadeCar;
}

type ContactObserver = (contact: Pick<RaceImpact, 'kind' | 'x' | 'y' | 'z' | 'distance' | 'side'> & {
  source: string;
  impulse: number;
}) => void;

function clamp(value: number, low: number, high: number) {
  return Math.max(low, Math.min(high, value));
}

function approach(value: number, target: number, amount: number) {
  return value + clamp(target - value, -amount, amount);
}

function place(car: Car, s: number, offset: number, speed: number, course: Course) {
  const point = course.sampleAt(s);
  car.x = point.x - point.dz * offset;
  car.z = point.z + point.dx * offset;
  car.yaw = Math.atan2(point.dx, point.dz);
  car.motionYaw = car.yaw;
  car.speed = speed;
  car.road = course.locate(car.x, car.z, point);
}

function spawn(course: Course, s: number, index: number, speed: number, offset = laneFor(index),
  transmission = new AutomaticTransmission(speed)): Car {
  const car: Car = {
    x: 0, z: 0, yaw: 0, dimensions: CAR_DIMENSIONS[index], motionYaw: 0, speed: 0, steer: 0, throttle: 0, brakePressure: 0,
    handling: HANDLING[index], suspension: settledSuspension(), exitLoad: 0,
    road: { ...course.sampleAt(s), offset: 0 }, progress: new LapProgress(s > 0 ? s - course.length : s, course),
    timing: new RaceTiming(), bot: { lane: laneFor(index), time: 0, wrongWay: 0 },
    transmission,
    surfaceSound: quietSurface(),
    active: true, owned: false, registeredDriver: false, livery: 'original',
    human: false, braking: false, reverseReady: false, reversing: false,
    stalled: 0, protection: 0,
  };
  place(car, s, offset, speed, course);
  return car;
}

function inGarage(car: Car, course: Course) {
  const { s, offset } = car.road;
  return Math.abs(car.speed) <= 0.15 && Math.abs(offset - course.pit.offset) <= 0.60
    && course.pit.stalls.some(stall => Math.abs(stall - s) <= 1.15);
}

function modelAtPose(model: number, previous: Car, pose: Car, course: Course) {
  const car = spawn(course, pose.road.s, model, pose.speed, pose.road.offset, previous.transmission.relocate(pose.speed));
  Object.assign(car, { x: pose.x, z: pose.z, yaw: pose.yaw, motionYaw: pose.motionYaw, road: pose.road });
  return car;
}

function move(car: Car, input: DriveInput, human: boolean, dt: number, course: Course) {
  const forwardX = Math.sin(car.yaw);
  const forwardZ = Math.cos(car.yaw);
  const along = forwardX * car.road.dx + forwardZ * car.road.dz;
  const across = forwardZ * car.road.dx - forwardX * car.road.dz;
  const inPit = course.isPitLane(car.road.s, car.road.offset);
  const surface = tireLoad(car.road, car.dimensions, along, across, course);
  car.surfaceSound.curb = surface.curb;
  car.surfaceSound.runoff = surface.gravel + surface.grass + surface.escape * 0.32;
  car.surfaceSound.gravel = surface.gravel;
  car.surfaceSound.grass = surface.grass;
  car.surfaceSound.scrape = Math.max(0, car.surfaceSound.scrape - dt * 4.8);
  const sliding = car.arcade?.skid ?? 0;
  const airborne = car.arcade?.airborne === true;
  const boost = !inPit && !airborne && (car.arcade?.turbo ?? 0) > 0;
  const grip = (surface.grip - 0.38 * Math.max(0, car.suspension.heave)) * (1 - Math.min(0.43, sliding * 0.46));
  const { uphill, lateral } = slopeFor(car.road, along, across, course);

  if (car.human !== human) {
    car.human = human;
    car.bot.wrongWay = 0;
    car.throttle = 0;
    car.brakePressure = 0;
    car.braking = false;
    car.reverseReady = false;
    car.reversing = false;
  }
  const style = car.handling;
  car.steer = approach(car.steer, clamp(input.x, -1, 1), dt * style.steerRate);
  const fullPower = input.gas && !input.brake;
  car.throttle = fullPower ? approach(car.throttle, 1, dt * 18) : 0;
  car.brakePressure = input.brake ? approach(car.brakePressure, 1, dt * 14) : 0;
  const speedRatio = clamp(Math.abs(car.speed) / BASE_TOP_SPEED, 0, 1.13);
  const bankAssist = -Math.sign(car.steer) * lateral / 16.5;
  const steerLoad = Math.abs(car.steer) * Math.min(1, speedRatio) * (1 - bankAssist);
  const cornerLoad = steerLoad ** 2;
  car.exitLoad = Math.max(steerLoad, car.exitLoad - dt * 1.25);
  const exitTraction = 1 + (car.exitLoad - steerLoad) * style.exitTraction;
  const straightLine = 1 - clamp(steerLoad * 3.2, 0, 1);
  const top = BASE_TOP_SPEED + (STRAIGHT_SPEED_GAIN + style.straightBonus) * straightLine;
  const limit = top - surface.speedLoss - 1.42 * style.cornerDrag * cornerLoad + Number(boost) * 3.25 * straightLine;
  const speedLimit = inPit ? Math.min(course.pit.speedLimit, limit) : limit;

  if (input.brake) {
    if (human && !car.braking && car.reverseReady && car.speed === 0) car.reversing = true;
    car.reverseReady = false;
  } else {
    if (human && car.braking && car.speed === 0) car.reverseReady = true;
    if (car.reversing) car.speed = 0;
    car.reversing = false;
  }
  const traction = car.transmission.step(car.speed, fullPower, input.brake, car.reversing, dt);

  if (input.brake) {
    const highSpeedBraking = clamp((car.speed - 10.5) * 0.25, 0, 1) * 3.2;
    const topSpeedBraking = Math.max(0, car.speed - 13) * 1.7;
    const brakeForce = (17.8 + highSpeedBraking + topSpeedBraking) * (0.34 + 0.66 * grip) * (0.59 + 0.41 * car.brakePressure);
    const braking = Math.max(0.6, brakeForce + surface.drag * 0.30 + uphill - 1.10 * cornerLoad);
    car.speed = car.reversing
      ? Math.max(-1.9, car.speed - (3.5 * grip + uphill) * dt)
      : approach(car.speed, 0, braking * dt);
  } else if (input.gas) {
    car.reverseReady = false;
    const driveGrip = grip * (1 - 0.09 * cornerLoad) * (airborne ? 0.14 : boost ? 1.31 : 1);
    const highSpeedPull = 1.65 * clamp((car.speed - 9.6) / 2.65, 0, 1) * straightLine;
    const enginePull = 9.65 - 4.55 * Math.min(1, speedRatio) ** 1.22 + highSpeedPull;
    const engine = enginePull * car.throttle * driveGrip * traction * exitTraction;
    const cornerScrub = (3.4 * style.cornerDrag + Math.max(0, car.speed - 13) * 1.2) * cornerLoad;
    const acceleration = car.speed > speedLimit
      ? 5 + surface.drag + cornerScrub + uphill
      : Math.max(0, engine - uphill - surface.drag * 0.30 - 1.35 * cornerLoad);
    car.speed = approach(car.speed, speedLimit, acceleration * dt);
  } else if (car.speed > 0) {
    // Closed-throttle engine braking keeps the car slowing even down the bridge.
    const drag = Math.max(0.35, 1.45 + car.speed * 0.18 + surface.drag + 1.6 * cornerLoad + uphill);
    car.speed = Math.max(0, car.speed - drag * dt);
  }
  car.braking = input.brake;

  const speed = Math.abs(car.speed);
  const turning = (0.52 + 2.22 * Math.min(1, speed / 3.8)) * (1 - 0.30 * speedRatio ** 2);
  const yawChange = car.steer * turning * (0.60 + 0.40 * grip) * Math.sign(car.speed) * dt * style.yawGain
    * (airborne ? 0.55 : 1);
  car.yaw = angleDifference(car.yaw - yawChange);
  const alignment = 1 - Math.exp(-dt * (17 - 6.4 * cornerLoad) * grip);
  const bankDrift = lateral * Math.sign(car.speed) / (speed + 2.4) * Math.min(1, speed / 2) * dt;
  const skidDrift = (car.arcade?.skidBias ?? 0) * sliding * dt * 1.30;
  car.motionYaw = angleDifference(car.motionYaw + angleDifference(car.yaw - car.motionYaw) * alignment + bankDrift + skidDrift);
  car.x += Math.sin(car.motionYaw) * car.speed * dt;
  car.z += Math.cos(car.motionYaw) * car.speed * dt;
  car.protection = Math.max(0, car.protection - dt);
  if (surface.gravel + surface.grass > 0.22 || surface.escape > 0.28 || car.reversing || inPit) car.timing.dirty();
}

function velocity(car: Car) {
  return { x: Math.sin(car.motionYaw) * car.speed, z: Math.cos(car.motionYaw) * car.speed };
}

function setVelocity(car: Car, x: number, z: number) {
  const direction = car.reversing ? -1 : 1;
  car.speed = Math.hypot(x, z) * direction;
  if (Math.abs(car.speed) > EPSILON) car.motionYaw = Math.atan2(x * direction, z * direction);
}

function groundHeight(road: TrackLocation, course: Course) {
  return course.heightAt(road.s, road.offset);
}

function resolveContacts(cars: readonly Car[], observe: ContactObserver, course: Course, arcade?: ArcadeRules) {
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    if (!a.active || a.protection > 0) continue;
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      if (!b.active || b.protection > 0) continue;
      const aHeight = groundHeight(a.road, course) + (a.arcade?.jump ?? 0);
      const bHeight = groundHeight(b.road, course) + (b.arcade?.jump ?? 0);
      const contact = contactBetween(capsule(a, aHeight), capsule(b, bHeight));
      if (!contact) continue;
      const { nx, nz, depth } = contact;
      const correction = (depth + 0.006) / 2;
      a.x -= nx * correction;
      a.z -= nz * correction;
      b.x += nx * correction;
      b.z += nz * correction;
      const va = velocity(a);
      const vb = velocity(b);
      const approachA = va.x * nx + va.z * nz;
      const approachB = vb.x * nx + vb.z * nz;
      const closing = approachA - approachB;
      const impulse = closing > 0 ? closing * (0.54 + 0.07 * clamp(closing / 5, 0, 1)) : 0;
      observe({
        source: `car:${i}:${j}`, kind: 'car', impulse,
        x: (a.x + b.x) / 2, y: (aHeight + bHeight) / 2 + 0.22, z: (a.z + b.z) / 2,
      });
      const strong = impulse >= MIN_AUDIBLE_IMPULSE;
      const aShield = strong && arcade?.block(a, i) ? 0.32 : 1;
      const bShield = strong && arcade?.block(b, j) ? 0.32 : 1;
      if (strong && aShield === 1) a.timing.dirty();
      if (strong && bShield === 1) b.timing.dirty();
      if (closing <= 0) continue;
      const tx = -nz, tz = nx;
      const tangent = (va.x - vb.x) * tx + (va.z - vb.z) * tz;
      const friction = clamp(tangent * 0.18, -impulse * 0.23, impulse * 0.23);
      const jx = nx * impulse + tx * friction;
      const jz = nz * impulse + tz * friction;
      setVelocity(a, va.x - jx * aShield, va.z - jz * aShield);
      setVelocity(b, vb.x + jx * bShield, vb.z + jz * bShield);
      if (approachA > 0.25 && approachB < -0.25) {
        // Opposing noses peel off to their own right instead of pushing in a straight line.
        const turn = Math.min(0.14, closing * 0.04);
        a.yaw = angleDifference(a.yaw - turn * (a.reversing ? -1 : 1));
        b.yaw = angleDifference(b.yaw - turn * (b.reversing ? -1 : 1));
      }
    }
  }
}

function constrain(car: Car, index: number, observe: ContactObserver, course: Course, arcade?: ArcadeRules) {
  if (!Number.isFinite(car.x + car.z)) return false;
  car.road = course.locate(car.x, car.z, car.road);
  const overflow = (point: TrackLocation) => Math.abs(point.offset) - course.wallHalfAt(point.s, Math.sign(point.offset));
  if (overflow(car.road) > 0.9) return false;

  for (let i = 0; i < 3; i++) {
    const { ax, az, bx, bz, radius } = capsule(car);
    const rear = course.locate(ax, az, car.road);
    const nose = course.locate(bx, bz, car.road);
    let boundary = car.road;
    if (overflow(rear) > overflow(boundary)) boundary = rear;
    if (overflow(nose) > overflow(boundary)) boundary = nose;
    const { offset, s } = boundary;
    const penetration = overflow(boundary) + radius;
    if (penetration <= EPSILON) break;

    const side = offset < 0 ? -1 : 1;
    const wallOffset = side * course.wallHalfAt(s, side);
    const panel = course.safetyPanels.find(panel => panel.side === side && Math.abs(arcDelta(s, panel.s, course.length)) <= safetyPanelSpacing / 2);
    const safety = panel ? panel.tyres ? 'tyres' : 'rail' : undefined;
    const response = barrierResponse[safety ?? 'fence'];
    const { dx, dz } = barrierTangent(s, side, course);
    const nx = -dz * side;
    const nz = dx * side;
    const projection = Math.max(0.65, dx * boundary.dx + dz * boundary.dz);
    const correction = (penetration + 0.002) / projection;
    car.x -= nx * correction;
    car.z -= nz * correction;
    const v = velocity(car);
    const outward = v.x * nx + v.z * nz;
    const along = v.x * dx + v.z * dz;
    const scrape = clamp(Math.abs(along) / 6.5, 0, 1) * clamp(0.34 + penetration * 15, 0, 1);
    car.surfaceSound.scrape = Math.max(car.surfaceSound.scrape, scrape);
    let impulse = 0;
    if (outward > 0) {
      const rebound = outward * (response.bounce + response.addedBounce * clamp(outward / 5, 0, 1));
      impulse = outward + rebound;
      const shielded = impulse >= MIN_AUDIBLE_IMPULSE && arcade?.block(car, index);
      const slide = along * (shielded ? 0.98 : response.slide);
      if (impulse >= MIN_AUDIBLE_IMPULSE && !shielded) car.timing.dirty();
      if (shielded) impulse *= 0.32;
      setVelocity(car, dx * slide - nx * rebound, dz * slide - nz * rebound);
      // Turn the nose toward an exit so held throttle does not drive back into the wall.
      const travel = along < -EPSILON ? -1 : 1;
      const direction = car.reversing ? -1 : 1;
      const exit = Math.atan2((dx * travel - nx * 0.27) * direction, (dz * travel - nz * 0.27) * direction);
      const turn = 0.04 + Math.min(0.24, outward * 0.10);
      car.yaw = angleDifference(car.yaw + clamp(angleDifference(exit - car.yaw), -turn, turn));
    }
    // The wooden kickboard in the display spans s = -14.19 through 0.19 on the inside.
    const kickboard = course.id === 'taller' && side < 0 && (s >= course.length - 14.19 || s <= 0.19);
    observe({
      source: `barrier:${index}:${side}`, kind: kickboard || safety === 'tyres' ? 'wall' : 'fence', impulse,
      x: boundary.x - boundary.dz * wallOffset, y: course.heightAt(s, wallOffset) + 0.18 + (car.arcade?.jump ?? 0),
      z: boundary.z + boundary.dx * wallOffset, distance: s, side,
    });
    car.road = course.locate(car.x, car.z, car.road);
  }
  return true;
}

function recover(car: Car, index: number, previousS: number, racing: boolean, course: Course) {
  const s = racing ? car.progress.rewind() : previousS - 0.75;
  place(car, s, laneFor(index), 0, course);
  car.steer = 0;
  car.throttle = 0;
  car.brakePressure = 0;
  car.transmission.neutralize();
  car.surfaceSound = quietSurface();
  car.suspension = settledSuspension();
  car.exitLoad = 0;
  car.bot.wrongWay = 0;
  car.bot.time = 0;
  car.timing.dirty();
  car.stalled = 0;
  car.protection = 0.86;
  car.reversing = false;
  car.reverseReady = false;
  if (car.arcade) car.arcade = newArcadeCar();
}

export class Race {
  private course: Course = TALLER;
  private cars = this.demoCars();
  private config = { ...defaultRaceConfig };
  private readonly manual: boolean;
  private startRequested = false;
  private frame = 0;
  private heat = 0;
  private elapsed = 0;
  private clock = 0;
  private phase: RaceSnapshot['phase'] = 'demo';
  private finishOrder: number[] = [];
  private firstFinishAt: number | null = null;
  private impactSequence = 0;
  private impacts: RaceImpact[] = [];
  private contactSounds = new Map<string, { seen: number; hit: number; latched: boolean }>();
  private arcade?: ArcadeRules;

  constructor({ manual = false } = {}) {
    this.manual = manual;
  }

  configure(config: RaceConfig) {
    if (this.phase !== 'demo' || this.startRequested) return false;
    this.config = normalizeRaceConfig(config);
    const nextCourse = getCourse(this.config.course);
    if (nextCourse !== this.course) {
      this.course = nextCourse;
      this.resetTiming();
      this.cars = this.demoCars();
    }
    return true;
  }

  private demoCars() {
    return CAR_SPECS.map((_, i) => spawn(this.course, this.course.demoDistances[i], i, 5.3));
  }

  launch() {
    if (this.phase !== 'demo' || this.startRequested) return false;
    this.startRequested = true;
    return true;
  }

  returnToDemo() {
    this.phase = 'demo';
    this.startRequested = false;
    this.resetTiming();
    this.arcade = undefined;
    this.cars = this.demoCars();
  }

  swapPracticeCar(fromSlot: number, toSlot: number) {
    if (this.phase !== 'practice' || fromSlot === toSlot) return false;
    const from = this.cars[fromSlot];
    const to = this.cars[toSlot];
    if (!from?.active || !from.owned || !to || to.owned || !inGarage(from, this.course)) return false;

    const replacement = modelAtPose(toSlot, to, from, this.course);
    replacement.owned = true;
    replacement.registeredDriver = true;
    if (this.arcade) replacement.arcade = newArcadeCar();
    const displaced = modelAtPose(fromSlot, from, to, this.course);
    displaced.active = to.active;
    if (this.arcade && displaced.active) displaced.arcade = newArcadeCar();
    this.cars[toSlot] = replacement;
    this.cars[fromSlot] = displaced;
    return true;
  }

  private readonly observeContact: ContactObserver = ({ source, impulse, ...contact }) => {
    const previous = this.contactSounds.get(source);
    const latched = previous?.latched === true && this.frame - previous.seen <= CONTACT_GAP_FRAMES;
    const lastHit = previous?.hit ?? -Infinity;
    // Solver corrections can lose contact for a few ticks while the same surfaces keep rubbing.
    const strike = !latched && this.frame - lastHit >= IMPACT_COOLDOWN_FRAMES && impulse >= MIN_AUDIBLE_IMPULSE;
    this.contactSounds.set(source, { seen: this.frame, hit: strike ? this.frame : lastHit, latched: latched || strike });
    if (!strike) return;

    this.impacts.push({
      id: ++this.impactSequence, frame: this.frame, ...contact, strength: clamp(impulse / FULL_STRENGTH_IMPULSE, 0, 1),
    });
  };

  private resetTiming() {
    this.elapsed = 0;
    this.clock = 0;
    this.finishOrder = [];
    this.firstFinishAt = null;
    this.impacts = [];
    this.contactSounds.clear();
  }

  private startHeat(drivers: readonly (Driver | undefined)[]) {
    const course = this.course;
    this.startRequested = false;
    const humans = CAR_SPECS.map((_, i) => drivers[i]?.owned === true);
    if (!humans.some(Boolean) && this.config.bots === 0) return;
    this.phase = this.config.mode === 'practice' ? 'practice' : 'grid';
    this.heat++;
    this.resetTiming();
    this.arcade = this.config.arcade ? new ArcadeRules(course) : undefined;
    let freeBots = this.config.bots;
    let nextStall = 0;
    this.cars = CAR_SPECS.map((_, index) => {
      const owned = humans[index];
      const active = owned || freeBots > 0;
      if (active && !owned) freeBots--;
      const row = course.gridRows[Math.floor(index / 2)];
      let car = spawn(course, row, index, 0);
      if (this.phase === 'practice' && active) {
        const stall = owned ? course.pit.stalls[nextStall++] : undefined;
        if (stall !== undefined) car = spawn(course, stall, index, 0, course.pit.offset);
        else if (!owned) car = spawn(course, course.demoDistances[index], index, 5.3);
      }
      car.active = active;
      if (this.arcade && active) car.arcade = newArcadeCar();
      return car;
    });
  }

  step(dt: number, drivers: readonly (Driver | undefined)[]) {
    const course = this.course;
    this.frame++;
    while (this.impacts.length && this.frame - this.impacts[0].frame >= IMPACT_MEMORY_FRAMES) this.impacts.shift();
    const hasDrivers = drivers.some(driver => driver?.owned);
    if (this.phase === 'demo') {
      if (this.startRequested || (!this.manual && drivers.some(driver => driver?.owned && driver.input !== null))) {
        this.startHeat(drivers);
      }
    } else if (!this.manual) {
      if (!hasDrivers) this.returnToDemo();
      else if (this.phase === 'results' && this.elapsed + dt + EPSILON >= RESULTS_TIME) this.startHeat(drivers);
    }

    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i];
      const driver = drivers[i];
      car.owned = car.active && driver?.owned === true;
      if (car.owned) {
        car.livery = driver?.livery ?? 'original';
        if (this.phase !== 'demo') car.registeredDriver = true;
      } else if (!this.manual || this.phase === 'demo') {
        car.livery = 'original';
      }
    }
    this.elapsed += dt;
    if (this.phase === 'grid') {
      if (this.elapsed + EPSILON >= GRID_TIME) {
        this.phase = 'race';
        this.elapsed = 0;
      }
      return;
    }

    const racing = this.phase === 'race';
    const practice = this.phase === 'practice';
    if (racing && this.firstFinishAt !== null) {
      // A crossing in the rest of the final tick is outside the finish window.
      dt = Math.min(dt, this.firstFinishAt + FINISH_WINDOW - this.clock);
    }
    if (racing || practice) this.clock += dt;
    const arcade = this.arcade;
    arcade?.advance(dt, this.frame);
    const previous = this.cars.map(car => ({
      x: car.x, y: car.road.y, z: car.z, s: car.road.s, road: car.road, speed: car.speed, motionYaw: car.motionYaw, progress: car.progress.distance,
    }));
    const commands = this.cars.map((car, i) => {
      if (!car.active) return null;
      const cooling = this.phase === 'results' || car.timing.finishTime !== null;
      const human = (racing || practice) && !cooling && car.owned ? drivers[i]?.input : null;
      const lane = laneFor(i);
      const input = human ?? (practice && car.owned && inGarage(car, course) ? NEUTRAL
        : botDrive(this.cars, i, cooling ? lane : arcade?.preferredLane(car, lane) ?? lane, this.config.difficulty, cooling, dt, course));
      return { input, human: Boolean(human) };
    });
    commands.forEach((command, i) => {
      if (command) move(this.cars[i], command.input, command.human, dt, course);
    });
    resolveContacts(this.cars, this.observeContact, course, arcade);

    const finishedThisTick: { index: number; fraction: number }[] = [];
    for (let i = 0; i < this.cars.length; i++) {
      const command = commands[i];
      if (!command) continue;
      const car = this.cars[i];
      const timed = (racing || practice) && car.timing.finishTime === null;
      const from = previous[i];
      if (!constrain(car, i, this.observeContact, course, arcade)) {
        recover(car, i, from.s, timed, course);
        continue;
      }
      arcade?.stepCar(car, i, from.road, dt, timed);

      const moving = Math.hypot(car.x - from.x, car.z - from.z) > 0.45 * dt;
      const { gas, brake } = command.input;
      const wantsForward = gas && !brake;
      car.stalled = wantsForward && !moving ? car.stalled + dt : 0;
      if (car.stalled + EPSILON >= 2.5 || (!command.human && car.bot.wrongWay > 1.6)) {
        recover(car, i, from.s, timed, course);
        continue;
      }

      const road = car.road;
      const curvature = (course.heightAt(road.s - 0.95, road.offset) + course.heightAt(road.s + 0.95, road.offset)
        - 2 * groundHeight(road, course)) / 0.95 ** 2;
      const lateral = angleDifference(car.motionYaw - from.motionYaw) * car.speed / dt;
      const headingDelta = car.motionYaw - Math.atan2(road.dx, road.dz);
      const gravity = slopeFor(road, Math.cos(headingDelta), -Math.sin(headingDelta), course);
      const roughness = car.surfaceSound.curb + 0.45 * car.surfaceSound.gravel + 0.28 * car.surfaceSound.grass;
      loadSuspension(car.suspension, car.handling, (car.speed - from.speed) / dt, lateral - gravity.lateral,
        curvature * car.speed ** 2, roughness, dt);

      if (timed) {
        if (car.registeredDriver && !command.human && moving) car.timing.assisted();
        const fraction = car.progress.advance(from, { x: car.x, y: car.road.y, z: car.z, s: car.road.s }, car.speed > 0);
        if (racing) car.timing.recordProgress(from.progress, car.progress.distance, this.clock, dt);
        if (fraction !== null) {
          const time = this.clock - dt + fraction * dt;
          car.timing.crossed(car.progress.checkpoint, time);
          if (racing && car.progress.lap >= this.config.laps) {
            car.timing.finishTime = time;
            finishedThisTick.push({ index: i, fraction });
          }
        }
      }
    }

    finishedThisTick.sort((a, b) => a.fraction - b.fraction);
    if (finishedThisTick.length > 0) {
      this.firstFinishAt ??= this.clock - dt + finishedThisTick[0].fraction * dt;
      this.finishOrder.push(...finishedThisTick.map(finish => finish.index));
    }
    if (racing && this.firstFinishAt !== null) {
      const cutoff = this.firstFinishAt + FINISH_WINDOW;
      const allFinished = this.finishOrder.length === this.cars.filter(car => car.active).length;
      if (allFinished || this.clock + EPSILON >= cutoff) {
        const last = this.cars[this.finishOrder[this.finishOrder.length - 1]];
        this.clock = allFinished ? last.timing.finishTime! : cutoff;
        this.phase = 'results';
        this.elapsed = 0;
      }
    }
  }

  snapshot(): RaceSnapshot {
    const demo = this.phase === 'demo';
    const remaining = this.cars.map((_, i) => i).filter(i => this.cars[i].active && !this.finishOrder.includes(i));
    remaining.sort((a, b) => demo
      ? this.cars[b].road.s - this.cars[a].road.s
      : this.cars[b].progress.distance - this.cars[a].progress.distance);
    const order = [...this.finishOrder, ...remaining];
    const leader = this.cars[order[0]];
    const hasGaps = this.phase === 'race' || this.phase === 'results';
    function gapFor(car: Car, time: number) {
      if (!leader || !hasGaps || !car.active) return null;
      if (leader === car) return 0;
      const ownFinish = car.timing.finishTime;
      const leaderFinish = leader.timing.finishTime;
      if (ownFinish !== null && leaderFinish !== null) return ownFinish - leaderFinish;
      const arrival = leader.timing.arrivalAt(car.progress.distance);
      return arrival === null ? null : Math.max(0, time - arrival);
    }
    return {
      frame: this.frame,
      heat: this.heat,
      phase: this.phase,
      lights: this.phase === 'grid' ? Math.min(3, Math.floor(this.elapsed / 0.65)) : 0,
      flag: this.firstFinishAt !== null,
      order,
      config: { ...this.config },
      time: this.clock,
      results: this.phase === 'results' ? order.map(slot => ({
        slot, time: this.cars[slot].timing.finishTime, bestLap: this.cars[slot].timing.bestLap,
      })) : undefined,
      impacts: this.impacts.length ? this.impacts.map(impact => ({ ...impact })) : undefined,
      ...(this.arcade ? { arcade: this.arcade.view() } : {}),
      cars: this.cars.map(car => ({
        x: car.x, y: groundHeight(car.road, this.course) + (car.arcade?.jump ?? 0), z: car.z, yaw: car.yaw, speed: car.speed, distance: car.road.s,
        ...(car.arcade ? { arcade: arcadeView(car.arcade) } : {}),
        lap: demo ? 0 : car.progress.lap, owned: car.owned, steer: car.steer, braking: car.braking,
        blink: car.protection > 0 && Math.floor(car.protection * 8) % 2 === 0,
        active: car.active,
        livery: car.livery,
        suspension: { ...car.suspension },
        pitReady: this.phase === 'practice' && car.owned && inGarage(car, this.course),
        bestLap: car.timing.bestLap,
        lastLap: car.timing.lastLap,
        cleanLap: car.timing.cleanLap,
        sectorTimes: [...car.timing.sectorTimes],
        gap: gapFor(car, this.clock),
        transmission: car.transmission.view(car.speed),
        sound: {
          ...car.surfaceSound, throttle: car.throttle,
          slip: clamp((Math.abs(car.speed * Math.sin(car.motionYaw - car.yaw)) - 0.09) / 1.65, 0, 1),
        },
      })),
    };
  }
}
