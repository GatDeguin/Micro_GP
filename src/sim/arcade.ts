import {
  arcadeLayout, arcadeTrapRadius, type ArcadeCarView, type ArcadeEvent, type ArcadeEventKind,
  type ArcadeHazard, type ArcadeTrap, type ArcadeView,
} from '../shared/arcade.ts';
import type { Course } from '../shared/courses.ts';
import type { TrackLocation } from '../shared/track.ts';
import { arcDelta } from './progress.ts';

export function newArcadeCar() {
  return { turbo: 0, shield: 0, skid: 0, skidBias: 0, jump: 0, rise: 0, airborne: false, immunity: 0 };
}
export type ArcadeCar = ReturnType<typeof newArcadeCar>;

interface Participant {
  x: number;
  z: number;
  speed: number;
  road: TrackLocation;
  arcade?: ArcadeCar;
}

interface Trap extends ArcadeHazard {
  station: number;
  offset: number;
  owner: number;
  armed: number;
  expires: number;
}

const turboSeconds = 1.48;
const shieldSeconds = 8;
const pickupRecharge = 4.8;
const maxTraps = 12;
const eventLifetime = 46;
const gravity = 14;

function point(course: Course, s: number, offset: number) {
  const { x, z, dx, dz } = course.sampleAt(s);
  return { x: x - dz * offset, z: z + dx * offset, y: course.heightAt(s, offset) };
}

export function arcadeView(car: ArcadeCar): ArcadeCarView {
  return { turbo: car.turbo > 0, shield: car.shield > 0, skid: car.skid > 0, jump: car.jump };
}

export class ArcadeRules {
  private readonly course: Course;
  private readonly layout;
  private readonly recharges: number[];
  private readonly hazards: Trap[] = [];
  private readonly events: ArcadeEvent[] = [];
  private time = 0;
  private frame = 0;
  private sequence = 0;

  constructor(course: Course) {
    this.course = course;
    this.layout = arcadeLayout(course);
    this.recharges = this.layout.pickups.map(() => 0);
  }

  advance(dt: number, frame: number) {
    this.time += dt;
    this.frame = frame;
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      if (this.hazards[i].expires <= this.time) this.hazards.splice(i, 1);
    }
    while (this.events.length && frame - this.events[0].frame > eventLifetime) this.events.shift();
  }

  private cue(kind: ArcadeEventKind, position: Pick<ArcadeEvent, 'x' | 'y' | 'z'>, slot: number, strength = 0.7) {
    this.events.push({ id: ++this.sequence, frame: this.frame, kind, x: position.x, y: position.y, z: position.z, slot, strength });
  }

  private position(car: Participant) {
    return { x: car.x, y: this.course.heightAt(car.road.s, car.road.offset) + (car.arcade?.jump ?? 0), z: car.z };
  }

  /** A shield absorbs a single trap or solid hit; the normal contact solver still separates bodies. */
  block(car: Participant, slot: number) {
    const state = car.arcade;
    if (!state || state.shield <= 0) return false;
    state.shield = 0;
    this.cue('block', this.position(car), slot);
    return true;
  }

  preferredLane(car: Participant, initial: number) {
    let best = 0.85;
    let target = initial;
    for (let i = 0; i < this.layout.pickups.length; i++) {
      if (this.recharges[i] > this.time) continue;
      const item = this.layout.pickups[i];
      const ahead = arcDelta(car.road.s, item.s, this.course.length);
      if (ahead <= 0.5 || ahead > 10) continue;
      const score = Math.abs(initial - item.offset) + 0.015 * ahead;
      if (score >= best) continue;
      best = score;
      target = item.offset;
    }
    for (const hazard of this.hazards) {
      const ahead = arcDelta(car.road.s, hazard.station, this.course.length);
      if (ahead < 0.6 || ahead > 3.4 || Math.abs(hazard.offset - target) > 0.72) continue;
      target += hazard.offset > 0 ? -0.86 : 0.86;
      break;
    }
    return target;
  }

  private drop(kind: ArcadeTrap, pickupStation: number, offset: number, slot: number) {
    const station = this.course.wrap(pickupStation - 1.55);
    const position = point(this.course, station, offset);
    if (this.hazards.some(hazard => Math.hypot(hazard.x - position.x, hazard.z - position.z) < 0.85
      && Math.abs(hazard.y - position.y) < 0.65)) return;
    if (this.hazards.length === maxTraps) this.hazards.shift();
    this.hazards.push({
      id: ++this.sequence, kind, ...position, owner: slot, station, offset,
      armed: this.time + 0.29, expires: this.time + 8.5,
    });
  }

  private trap(car: Participant, state: ArcadeCar, slot: number) {
    if (state.jump > 0.12 || state.immunity > 0 || Math.abs(car.speed) < 1.3) return;
    for (let i = 0; i < this.hazards.length; i++) {
      const hazard = this.hazards[i];
      if (hazard.owner === slot || this.time < hazard.armed
        || Math.abs(arcDelta(hazard.station, car.road.s, this.course.length)) > 1.75
        || Math.hypot(hazard.x - car.x, hazard.z - car.z) > arcadeTrapRadius[hazard.kind] + 0.29) continue;
      const pop = hazard.kind === 'pop';
      if (pop) {
        this.hazards.splice(i, 1);
        this.cue('explosion', hazard, slot, 0.95);
      }
      state.immunity = 1.25;
      if (this.block(car, slot)) return;
      if (!pop) this.cue('slip', hazard, slot, 0.68);
      state.skid = pop ? 0.74 : 0.95;
      state.skidBias = car.road.offset > hazard.offset ? 1 : -1;
      state.turbo = 0;
      car.speed *= pop ? 0.57 : 0.85;
      return;
    }
  }

  stepCar(car: Participant, slot: number, previous: TrackLocation, dt: number, collect = true) {
    const state = car.arcade;
    if (!state) return;
    state.turbo = Math.max(0, state.turbo - dt);
    state.shield = Math.max(0, state.shield - dt);
    state.skid = Math.max(0, state.skid - dt);
    state.immunity = Math.max(0, state.immunity - dt);

    if (state.airborne) {
      state.jump += (state.rise - gravity * dt / 2) * dt;
      state.rise -= gravity * dt;
      if (state.jump > 0) return;
      const intensity = Math.min(1, -state.rise / 5.1);
      state.jump = state.rise = 0;
      state.airborne = false;
      this.cue('land', this.position(car), slot, intensity);
    }

    const { s, offset } = car.road;
    const travel = arcDelta(previous.s, s, this.course.length);
    const crosses = (gate: number, lateral: number, half: number) => {
      if (travel <= 0 || travel > 1.8) return false;
      const lead = arcDelta(previous.s, gate, this.course.length);
      if (lead <= 0 || lead > travel) return false;
      const at = previous.offset + (offset - previous.offset) * lead / travel;
      return Math.abs(at - lateral) <= half;
    };
    state.jump = 0;
    for (const ramp of this.layout.ramps) {
      if (collect && car.speed > 2.8 && crosses(ramp.s, ramp.offset, ramp.halfWidth)) {
        state.jump = ramp.height;
        state.rise = Math.min(4.15, 0.69 + car.speed * 0.212);
        state.airborne = true;
        this.cue('jump', this.position(car), slot, Math.min(0.95, 0.38 + car.speed * 0.039));
        return;
      }
      const delta = arcDelta(ramp.s, s, this.course.length);
      if (delta >= -ramp.length && delta <= 0 && Math.abs(offset - ramp.offset) <= ramp.halfWidth) {
        state.jump = ramp.height * (1 + delta / ramp.length) ** 1.3;
      }
    }
    if (!collect) return;
    this.trap(car, state, slot);
    if (car.speed <= 0.6) return;
    for (let i = 0; i < this.layout.pickups.length; i++) {
      const pickup = this.layout.pickups[i];
      if (this.recharges[i] > this.time || !crosses(pickup.s, pickup.offset, 0.70)) continue;
      this.recharges[i] = this.time + pickupRecharge;
      if (pickup.kind === 'turbo') {
        state.turbo = turboSeconds;
        car.speed += 0.83 + 0.046 * car.speed;
      }
      else if (pickup.kind === 'shield') state.shield = shieldSeconds;
      else this.drop(pickup.kind, pickup.s, offset, slot);
      this.cue(pickup.kind, this.position(car), slot);
    }
  }

  view(): ArcadeView {
    return {
      available: this.recharges.map(at => at <= this.time),
      hazards: this.hazards.map(({ id, kind, x, y, z }) => ({ id, kind, x, y, z })),
      events: this.events.slice(),
    };
  }
}
