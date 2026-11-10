import { CAR_SPECS, type CarSound, type DriveInput, type Driver, type RaceImpact, type RaceSnapshot } from '../shared/protocol.ts';
import { CAR_DIMENSIONS, GRID_LANE_OFFSET, type CarDimensions } from '../shared/car-dimensions.ts';
import { CURB_WIDTH, GRID_ROWS, ROAD_HALF, TRACK, WALL_HALF, type TrackLocation } from '../shared/track.ts';
import { capsule, contactBetween } from './contact.ts';
import { LapProgress } from './progress.ts';
import { AutomaticTransmission } from './transmission.ts';

const LAPS = 3;
const GRID_TIME = 3;
const FINISH_WINDOW = 15;
const RESULTS_TIME = 6;
const MAX_SPEED = 8.05;
const EPSILON = 1e-8;
const IMPACT_MEMORY_FRAMES = 24;
const IMPACT_COOLDOWN_FRAMES = 12;
const CONTACT_GAP_FRAMES = 4;
const MIN_AUDIBLE_IMPULSE = 0.46;
const FULL_STRENGTH_IMPULSE = 7.2;

const demoDistances = [6, 34, 62, 94];
const botPace = [6.23, 6.17, 6.30, 6.12];
const laneFor = (index: number) => index % 2 === 0 ? GRID_LANE_OFFSET : -GRID_LANE_OFFSET;

interface Car {
  x: number;
  z: number;
  yaw: number;
  dimensions: CarDimensions;
  motionYaw: number;
  speed: number;
  road: TrackLocation;
  progress: LapProgress;
  steer: number;
  throttle: number;
  transmission: AutomaticTransmission;
  surfaceSound: Pick<CarSound, 'curb' | 'runoff' | 'scrape'>;
  owned: boolean;
  human: boolean;
  braking: boolean;
  reverseReady: boolean;
  reversing: boolean;
  stalled: number;
  protection: number;
}

type ContactObserver = (contact: {
  source: string;
  kind: RaceImpact['kind'];
  impulse: number;
  x: number;
  y: number;
  z: number;
}) => void;

function clamp(value: number, low: number, high: number) {
  return Math.max(low, Math.min(high, value));
}

function approach(value: number, target: number, amount: number) {
  return value + clamp(target - value, -amount, amount);
}

function angleDifference(angle: number) {
  if (angle > Math.PI) return angle - Math.PI * 2;
  if (angle < -Math.PI) return angle + Math.PI * 2;
  return angle;
}

function place(car: Car, s: number, offset: number, speed: number) {
  const point = TRACK.sampleAt(s);
  car.x = point.x - point.dz * offset;
  car.z = point.z + point.dx * offset;
  car.yaw = Math.atan2(point.dx, point.dz);
  car.motionYaw = car.yaw;
  car.speed = speed;
  car.road = TRACK.locate(car.x, car.z);
}

function spawn(s: number, index: number, speed: number): Car {
  const car: Car = {
    x: 0, z: 0, yaw: 0, dimensions: CAR_DIMENSIONS[index], motionYaw: 0, speed: 0, steer: 0, throttle: 0,
    road: { ...TRACK.sampleAt(s), offset: 0 }, progress: new LapProgress(s),
    transmission: new AutomaticTransmission(speed),
    surfaceSound: { curb: 0, runoff: 0, scrape: 0 },
    owned: false, human: false, braking: false, reverseReady: false, reversing: false,
    stalled: 0, protection: 0,
  };
  place(car, s, laneFor(index), speed);
  return car;
}

function botDrive(cars: readonly Car[], index: number, coolingDown: boolean): DriveInput {
  const car = cars[index];
  const lane = laneFor(index);
  function clearance(offset: number) {
    let gap = 7.5;
    let trafficSpeed = 0;
    for (const other of cars) {
      if (other === car || Math.abs(other.road.offset - offset) > car.dimensions.halfWidth + other.dimensions.halfWidth - 0.025) continue;
      const behind = car.dimensions.rear + other.dimensions.front;
      const ahead = (other.road.s - car.road.s + TRACK.length + behind) % TRACK.length - behind;
      const open = Math.max(0, ahead - car.dimensions.front - other.dimensions.rear);
      if (open < gap) {
        gap = open;
        trafficSpeed = ahead > 0 ? Math.max(0, other.speed) : 0;
      }
    }
    return { gap, trafficSpeed };
  }

  let offset = lane;
  let clear = clearance(offset);
  let best = clear.gap + 0.35 * clear.trafficSpeed - 0.68 * Math.abs(offset - car.road.offset);
  for (const alternative of [-lane, Math.sign(lane) * 2.50, Math.sign(-lane) * 2.50]) {
    const space = clearance(alternative);
    const shoulderPenalty = Math.abs(alternative) > ROAD_HALF ? 1.72 : 0.67;
    const score = space.gap + 0.35 * space.trafficSpeed - 0.68 * Math.abs(alternative - car.road.offset) - shoulderPenalty;
    if (score > best) {
      offset = alternative;
      clear = space;
      best = score;
    }
  }

  const look = TRACK.sampleAt(car.road.s + 1.8 + Math.max(0, car.speed) * 0.34);
  const aimX = look.x - look.dz * offset - car.x;
  const aimZ = look.z + look.dx * offset - car.z;
  const steering = angleDifference(car.yaw - Math.atan2(aimX, aimZ));
  const turn = Math.abs(angleDifference(Math.atan2(look.dx, look.dz) - Math.atan2(car.road.dx, car.road.dz)));
  const desired = Math.min(
    (coolingDown ? 4.7 : botPace[index]) - turn * 0.8,
    Math.max(0.85, clear.trafficSpeed * 0.94 + clear.gap * 2.1),
  );
  return {
    x: clamp(steering * 1.85, -1, 1),
    gas: car.speed < desired,
    brake: car.speed > desired + 0.35,
  };
}

function move(car: Car, input: DriveInput, human: boolean, dt: number) {
  const forwardX = Math.sin(car.yaw);
  const forwardZ = Math.cos(car.yaw);
  const along = forwardX * car.road.dx + forwardZ * car.road.dz;
  const across = forwardZ * car.road.dx - forwardX * car.road.dz;
  const axleOffset = car.dimensions.axle * across;
  const wheelOffset = car.dimensions.tireOffset * along;
  let curb = 0;
  let loose = 0;
  // Blend the load at all four contact patches as each tire crosses a surface seam.
  for (const axle of [-axleOffset, axleOffset]) {
    for (const side of [-wheelOffset, wheelOffset]) {
      const edge = Math.abs(car.road.offset + axle + side) - ROAD_HALF;
      curb += clamp((edge + 0.08) / 0.20, 0, 1) / 4;
      loose += clamp((edge - CURB_WIDTH + 0.08) / 0.22, 0, 1) / 4;
    }
  }
  curb *= 1.6 - 0.6 * curb;
  loose *= 1.6 - 0.6 * loose;
  car.surfaceSound.curb = Math.max(0, curb - loose);
  car.surfaceSound.runoff = loose;
  car.surfaceSound.scrape = Math.max(0, car.surfaceSound.scrape - dt * 4.8);
  const grip = 1 - 0.22 * curb - 0.36 * loose;
  const grade = (TRACK.sampleAt(car.road.s + 0.6).y - TRACK.sampleAt(car.road.s - 0.6).y) / 1.2;
  const uphill = 9.8 * grade * along;

  if (car.human !== human) {
    car.human = human;
    car.throttle = 0;
    car.braking = false;
    car.reverseReady = false;
    car.reversing = false;
  }
  car.steer = approach(car.steer, clamp(input.x, -1, 1), dt * 12);
  const fullPower = input.gas && !input.brake;
  car.throttle = approach(car.throttle, fullPower ? 1 : 0, dt * (fullPower ? 18 : 28));
  const speedRatio = clamp(Math.abs(car.speed) / MAX_SPEED, 0, 1);
  const cornerLoad = (car.steer * speedRatio) ** 2;
  const speedLimit = MAX_SPEED - 1.6 * curb - 4.15 * loose - 0.9 * cornerLoad;

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
    const braking = 13 * (0.55 + 0.45 * grip) + uphill;
    car.speed = car.reversing
      ? Math.max(-1.9, car.speed - (3.5 * grip + uphill) * dt)
      : approach(car.speed, 0, braking * dt);
  } else if (input.gas) {
    car.reverseReady = false;
    const engine = (8.6 - 4.95 * speedRatio ** 1.22) * car.throttle * grip * traction;
    const acceleration = car.speed > speedLimit
      ? 5 + 4 * loose + 2.4 * cornerLoad + uphill
      : Math.max(0, engine - uphill - 1.35 * cornerLoad);
    car.speed = approach(car.speed, speedLimit, acceleration * dt);
  } else {
    const drag = 0.79 + Math.abs(car.speed) * 0.18 + 2.5 * loose + 1.6 * cornerLoad + uphill;
    if (car.speed > 0) car.speed = Math.max(0, car.speed - drag * dt);
  }
  car.braking = input.brake;

  const speed = Math.abs(car.speed);
  const turning = (0.52 + 2.22 * Math.min(1, speed / 3.8)) * (1 - 0.30 * speedRatio ** 2);
  const yawChange = car.steer * turning * (0.60 + 0.40 * grip) * Math.sign(car.speed) * dt;
  car.yaw = angleDifference(car.yaw - yawChange);
  const alignment = 1 - Math.exp(-dt * (17 - 6.4 * cornerLoad) * grip);
  car.motionYaw = angleDifference(car.motionYaw + angleDifference(car.yaw - car.motionYaw) * alignment);
  car.x += Math.sin(car.motionYaw) * car.speed * dt;
  car.z += Math.cos(car.motionYaw) * car.speed * dt;
  car.protection = Math.max(0, car.protection - dt);
}

function velocity(car: Car) {
  return { x: Math.sin(car.motionYaw) * car.speed, z: Math.cos(car.motionYaw) * car.speed };
}

function setVelocity(car: Car, x: number, z: number) {
  const direction = car.reversing ? -1 : 1;
  car.speed = Math.hypot(x, z) * direction;
  if (Math.abs(car.speed) > EPSILON) car.motionYaw = Math.atan2(x * direction, z * direction);
}

function resolveContacts(cars: readonly Car[], observe: ContactObserver) {
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    if (a.protection > 0) continue;
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      if (b.protection > 0) continue;
      const contact = contactBetween(capsule(a), capsule(b));
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
        x: (a.x + b.x) / 2, y: (a.road.y + b.road.y) / 2 + 0.22, z: (a.z + b.z) / 2,
      });
      if (closing <= 0) continue;
      const tx = -nz, tz = nx;
      const tangent = (va.x - vb.x) * tx + (va.z - vb.z) * tz;
      const friction = clamp(tangent * 0.18, -impulse * 0.23, impulse * 0.23);
      const jx = nx * impulse + tx * friction;
      const jz = nz * impulse + tz * friction;
      setVelocity(a, va.x - jx, va.z - jz);
      setVelocity(b, vb.x + jx, vb.z + jz);
      if (approachA > 0.25 && approachB < -0.25) {
        // Opposing noses peel off to their own right instead of pushing in a straight line.
        const turn = Math.min(0.14, closing * 0.04);
        a.yaw = angleDifference(a.yaw - turn * (a.reversing ? -1 : 1));
        b.yaw = angleDifference(b.yaw - turn * (b.reversing ? -1 : 1));
      }
    }
  }
}

function constrain(car: Car, index: number, observe: ContactObserver) {
  if (!Number.isFinite(car.x + car.z)) return false;
  car.road = TRACK.locate(car.x, car.z);
  if (Math.abs(car.road.offset) > WALL_HALF + 0.9) return false;

  for (let i = 0; i < 3; i++) {
    const { ax, az, bx, bz, radius } = capsule(car);
    const rear = TRACK.locate(ax, az);
    const nose = TRACK.locate(bx, bz);
    let boundary = car.road;
    if (Math.abs(rear.offset) > Math.abs(boundary.offset)) boundary = rear;
    if (Math.abs(nose.offset) > Math.abs(boundary.offset)) boundary = nose;
    const { offset, dx, dz } = boundary;
    const penetration = Math.abs(offset) + radius - WALL_HALF;
    if (penetration <= EPSILON) break;

    const side = Math.sign(offset);
    const nx = -dz * side;
    const nz = dx * side;
    car.x -= nx * (penetration + 0.002);
    car.z -= nz * (penetration + 0.002);
    const v = velocity(car);
    const outward = v.x * nx + v.z * nz;
    const along = v.x * dx + v.z * dz;
    const scrape = clamp(Math.abs(along) / 6.5, 0, 1) * clamp(0.34 + penetration * 15, 0, 1);
    car.surfaceSound.scrape = Math.max(car.surfaceSound.scrape, scrape);
    let impulse = 0;
    if (outward > 0) {
      const slide = along * 0.96;
      const rebound = outward * (0.10 + 0.16 * clamp(outward / 5, 0, 1));
      impulse = outward + rebound;
      setVelocity(car, dx * slide - nx * rebound, dz * slide - nz * rebound);
      // Turn the nose toward an exit so held throttle does not drive back into the wall.
      const travel = along < -EPSILON ? -1 : 1;
      const direction = car.reversing ? -1 : 1;
      const exit = Math.atan2((dx * travel - nx * 0.27) * direction, (dz * travel - nz * 0.27) * direction);
      const turn = 0.04 + Math.min(0.24, outward * 0.10);
      car.yaw = angleDifference(car.yaw + clamp(angleDifference(exit - car.yaw), -turn, turn));
    }
    // The wooden kickboard in the display spans s = -14.19 through 0.19 on the inside.
    const kickboard = side < 0 && (boundary.s >= TRACK.length - 14.19 || boundary.s <= 0.19);
    observe({
      source: `barrier:${index}:${side}`, kind: kickboard ? 'wall' : 'fence', impulse,
      x: boundary.x + nx * WALL_HALF, y: boundary.y + 0.18, z: boundary.z + nz * WALL_HALF,
    });
    car.road = TRACK.locate(car.x, car.z);
  }
  return true;
}

function recover(car: Car, index: number, previousS: number, racing: boolean) {
  const s = racing ? car.progress.rewind() : previousS - 0.75;
  place(car, s, laneFor(index), 0);
  car.steer = 0;
  car.throttle = 0;
  car.transmission.neutralize();
  car.surfaceSound = { curb: 0, runoff: 0, scrape: 0 };
  car.stalled = 0;
  car.protection = 0.86;
  car.reversing = false;
  car.reverseReady = false;
}

export class Race {
  private cars = CAR_SPECS.map((_, index) => spawn(demoDistances[index], index, 5.3));
  private frame = 0;
  private heat = 0;
  private elapsed = 0;
  private phase: RaceSnapshot['phase'] = 'demo';
  private finishOrder: number[] = [];
  private firstFinishAt: number | null = null;
  private impactSequence = 0;
  private impacts: RaceImpact[] = [];
  private contactSounds = new Map<string, { seen: number; hit: number; latched: boolean }>();

  private readonly observeContact: ContactObserver = ({ source, kind, impulse, x, y, z }) => {
    const previous = this.contactSounds.get(source);
    const latched = previous?.latched === true && this.frame - previous.seen <= CONTACT_GAP_FRAMES;
    const lastHit = previous?.hit ?? -Infinity;
    // Solver corrections can lose contact for a few ticks while the same surfaces keep rubbing.
    const strike = !latched && this.frame - lastHit >= IMPACT_COOLDOWN_FRAMES && impulse >= MIN_AUDIBLE_IMPULSE;
    this.contactSounds.set(source, { seen: this.frame, hit: strike ? this.frame : lastHit, latched: latched || strike });
    if (!strike) return;

    this.impacts.push({
      id: ++this.impactSequence, frame: this.frame, kind, x, y, z, strength: clamp(impulse / FULL_STRENGTH_IMPULSE, 0, 1),
    });
  };

  private startGrid() {
    this.phase = 'grid';
    this.heat++;
    this.elapsed = 0;
    this.finishOrder = [];
    this.firstFinishAt = null;
    this.impacts = [];
    this.contactSounds.clear();
    this.cars = CAR_SPECS.map((_, index) => spawn(GRID_ROWS[Math.floor(index / 2)], index, 0));
  }

  step(dt: number, drivers: readonly (Driver | undefined)[]) {
    this.frame++;
    while (this.impacts.length && this.frame - this.impacts[0].frame >= IMPACT_MEMORY_FRAMES) this.impacts.shift();
    if (this.phase === 'demo') {
      if (drivers.some(driver => driver?.owned && driver.input !== null)) this.startGrid();
    } else if (!drivers.some(driver => driver?.owned)) {
      this.phase = 'demo';
      this.finishOrder = [];
      this.firstFinishAt = null;
    } else if (this.phase === 'results' && this.elapsed + dt + EPSILON >= RESULTS_TIME) {
      this.startGrid();
    }

    for (let i = 0; i < this.cars.length; i++) this.cars[i].owned = drivers[i]?.owned ?? false;
    this.elapsed += dt;
    if (this.phase === 'grid') {
      if (this.elapsed + EPSILON >= GRID_TIME) {
        this.phase = 'race';
        this.elapsed = 0;
      }
      return;
    }

    const previous = this.cars.map(car => ({ x: car.x, z: car.z, s: car.road.s }));
    const commands = this.cars.map((car, i) => {
      const cooling = this.phase === 'results' || (this.phase === 'race' && car.progress.lap >= LAPS);
      const human = this.phase === 'race' && !cooling && car.owned ? drivers[i]?.input : null;
      return { input: human ?? botDrive(this.cars, i, cooling), human: Boolean(human) };
    });
    commands.forEach(({ input, human }, i) => move(this.cars[i], input, human, dt));
    resolveContacts(this.cars, this.observeContact);

    const finishedThisTick: { index: number; fraction: number }[] = [];
    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i];
      const racing = this.phase === 'race' && car.progress.lap < LAPS;
      const from = previous[i];
      if (!constrain(car, i, this.observeContact)) {
        recover(car, i, from.s, racing);
        continue;
      }

      const moving = Math.hypot(car.x - from.x, car.z - from.z) > 0.45 * dt;
      const { gas, brake } = commands[i].input;
      const wantsForward = gas && !brake;
      car.stalled = wantsForward && !moving ? car.stalled + dt : 0;
      if (car.stalled + EPSILON >= 2.5) {
        recover(car, i, from.s, racing);
        continue;
      }
      if (racing) {
        const fraction = car.progress.advance(from, { x: car.x, z: car.z, s: car.road.s }, car.speed > 0);
        if (fraction !== null && car.progress.lap === LAPS) finishedThisTick.push({ index: i, fraction });
      }
    }

    finishedThisTick.sort((a, b) => a.fraction - b.fraction);
    if (finishedThisTick.length > 0) {
      this.firstFinishAt ??= this.elapsed - dt + finishedThisTick[0].fraction * dt;
      this.finishOrder.push(...finishedThisTick.map(finish => finish.index));
    }
    if (this.firstFinishAt !== null && this.phase === 'race' && (
      this.finishOrder.length === this.cars.length || this.elapsed + EPSILON >= this.firstFinishAt + FINISH_WINDOW
    )) {
      this.phase = 'results';
      this.elapsed = 0;
    }
  }

  snapshot(): RaceSnapshot {
    const demo = this.phase === 'demo';
    const remaining = this.cars.map((_, i) => i).filter(i => !this.finishOrder.includes(i));
    remaining.sort((a, b) => demo
      ? this.cars[b].road.s - this.cars[a].road.s
      : this.cars[b].progress.distance - this.cars[a].progress.distance);
    return {
      frame: this.frame,
      heat: this.heat,
      phase: this.phase,
      lights: this.phase === 'grid' ? Math.min(3, Math.floor(this.elapsed / 0.65)) : 0,
      flag: this.firstFinishAt !== null,
      order: [...this.finishOrder, ...remaining],
      impacts: this.impacts.length ? this.impacts.map(impact => ({ ...impact })) : undefined,
      cars: this.cars.map(car => ({
        x: car.x, y: car.road.y, z: car.z, yaw: car.yaw, speed: car.speed,
        lap: demo ? 0 : car.progress.lap, owned: car.owned, steer: car.steer, braking: car.braking,
        blink: car.protection > 0 && Math.floor(car.protection * 8) % 2 === 0,
        transmission: car.transmission.view(car.speed),
        sound: {
          ...car.surfaceSound, throttle: car.throttle,
          slip: clamp((Math.abs(car.speed * Math.sin(car.motionYaw - car.yaw)) - 0.09) / 1.65, 0, 1),
        },
      })),
    };
  }
}
