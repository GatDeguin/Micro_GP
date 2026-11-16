import assert from 'node:assert/strict';
import test from 'node:test';
import { SPACEPORT, type Course } from '../src/shared/courses.ts';
import { defaultRaceConfig, NEUTRAL, type Driver } from '../src/shared/protocol.ts';
import type { TrackLocation } from '../src/shared/track.ts';
import { positionOnRoad } from '../src/sim/loop-road.ts';
import { arcDelta, LapProgress } from '../src/sim/progress.ts';
import { Race } from '../src/sim/race.ts';

const dt = 1 / 60;
const stopped: Driver = { owned: true, input: NEUTRAL };
const gas: Driver = { owned: true, input: { ...NEUTRAL, gas: true } };
const brake: Driver = { owned: true, input: { ...NEUTRAL, brake: true } };
const loop = SPACEPORT.loops[0];
const station = (fraction: number) => loop.from + (loop.to - loop.from) * fraction;

interface FixtureCar {
  x: number; z: number; road: TrackLocation; yaw: number; motionYaw: number; speed: number;
  arcade?: { jump: number; rise: number; airborne: boolean };
}

function fixture(s: number, speed = 0, offset = 0, drivers = [stopped], arcade = false) {
  const race = new Race({ manual: true });
  race.configure({ ...defaultRaceConfig, course: 'spaceport', bots: 0, laps: 1, arcade });
  race.launch();
  for (let i = 0; i < 180; i++) race.step(dt, drivers);
  const cars = (race as unknown as { cars: FixtureCar[] }).cars;
  const place = (slot: number, at: number, pace = speed, lane = offset) => {
    const car = cars[slot];
    positionOnRoad(car, at, lane, SPACEPORT);
    car.yaw = car.motionYaw = loop.yaw;
    car.speed = pace;
    return car;
  };
  place(0, s);
  return { race, cars, place };
}

function step(race: Race, drivers: Driver[], seconds: number) {
  for (let i = 0; i < Math.round(seconds / dt); i++) race.step(dt, drivers);
}

function onSurface(race: Race, slot = 0) {
  const car = race.snapshot().cars[slot];
  const actual = (race as unknown as { cars: FixtureCar[] }).cars[slot];
  const frame = SPACEPORT.frameAt(car.distance!, actual.road.offset);
  assert.ok(Math.hypot(car.x - frame.x, car.y - frame.y, car.z - frame.z) < 1e-8);
  assert.equal(car.blink, false);
  return car;
}

test('loop coasting applies tangent gravity and follows true 3D road distance', () => {
  for (const fraction of [0.23, 0.77]) {
    const at = station(fraction);
    const { race } = fixture(at, 5);
    const tangent = SPACEPORT.frameAt(at);
    const expected = 5 - (1.45 + 5 * 0.18 + 9.8 * tangent.ty) * dt;
    race.step(dt, [stopped]);
    const car = onSurface(race);
    assert.ok(Math.abs(car.speed - expected) < 1e-8, 'gravity must brake the ascent and accelerate the descent');
    assert.ok(Math.abs(arcDelta(at, car.distance!, SPACEPORT.length) - expected * dt) < 0.0001,
      'forward travel is measured along the 3D road, including small lateral gravity drift');
  }
});

test('a human can hold the brake on a vertical face and engage reverse without a reset', () => {
  const { race } = fixture(station(0.23), 5);
  step(race, [brake], 0.7);
  const parked = onSurface(race);
  assert.equal(parked.speed, 0);
  step(race, [brake], 0.5);
  assert.equal(onSurface(race).distance, parked.distance);
  race.step(dt, [stopped]);
  step(race, [brake], 0.3);
  const reversing = onSurface(race);
  assert.equal(reversing.transmission?.gear, -1);
  assert.ok(reversing.speed < -1.5 && reversing.distance! < parked.distance! - 0.2);
  assert.equal(reversing.lap, 0);
});

test('a stopped inverted car stays on the road and restarts only under engine power', () => {
  const { race } = fixture(station(0.5));
  assert.ok(SPACEPORT.frameAt(station(0.5)).ny < -0.85);
  step(race, [brake], 0.6);
  const parked = onSurface(race);
  assert.equal(parked.speed, 0);
  assert.ok(Math.abs(parked.distance! - station(0.5)) < 1e-8);
  step(race, [gas], 0.5);
  const moving = onSurface(race);
  assert.ok(moving.speed > 2 && moving.distance! > parked.distance! + 0.25);
});

test('steering changes the driven line while inverted and loop barriers still emit a collision', () => {
  const driven = fixture(station(0.5), 5);
  step(driven.race, [{ owned: true, input: { x: 0.7, gas: true, brake: false } }], 0.25);
  assert.ok(Math.abs(driven.cars[0].road.offset) > 0.08);
  onSurface(driven.race);

  const at = station(0.5);
  const hit = fixture(at, 6, -SPACEPORT.wallHalfAt(at, -1) + 0.9);
  hit.cars[0].yaw = hit.cars[0].motionYaw = loop.yaw + 0.65;
  step(hit.race, [gas], 0.1);
  onSurface(hit.race);
  assert.ok(hit.race.snapshot().impacts?.some(impact => impact.kind === 'fence'));
});

test('cars collide along a vertical face despite their different world heights', () => {
  const at = station(0.23);
  const { race, place } = fixture(at, 6, 0, [stopped, stopped]);
  place(1, at + 3.1, 0);
  const before = race.snapshot().cars;
  assert.ok(Math.abs(before[0].y - before[1].y) > 2);
  step(race, [gas, brake], 0.1);
  assert.ok(race.snapshot().impacts?.some(impact => impact.kind === 'car'));
  assert.ok(race.snapshot().cars[1].speed > 0);
  onSurface(race, 0);
  onSurface(race, 1);
});

test('distant loop branches do not collide and Arcade cannot detach a car in a loop', () => {
  const { race, cars, place } = fixture(station(0.05), 5, 0, [stopped, stopped], true);
  place(1, station(0.5), 5);
  Object.assign(cars[0].arcade!, { jump: 0.5, rise: 3, airborne: true });
  step(race, [gas, gas], 0.1);
  assert.equal(race.snapshot().impacts, undefined);
  assert.equal(race.snapshot().cars[0].arcade?.jump, 0);
  onSurface(race, 0);
  onSurface(race, 1);
});

test('a checkpoint on a vertical face accepts continuous 3D forward travel', () => {
  const course: Course = { ...SPACEPORT, checkpoints: [0, station(0.23)] };
  const progress = new LapProgress(-0.3, course);
  let previous = course.sampleAt(-0.3);
  for (let s = -0.15; s <= station(0.23) + 0.3; s += 0.15) {
    const point = course.sampleAt(s);
    progress.advance(previous, point, true);
    previous = point;
  }
  assert.equal(progress.checkpoint, 1);
  assert.ok(progress.distance > station(0.23));
});

for (const difficulty of ['rookie', 'club', 'pro'] as const) {
  test(`four ${difficulty} bots drive both complete Spaceport loops and finish without resets`, () => {
    const race = new Race({ manual: true });
    race.configure({ ...defaultRaceConfig, course: 'spaceport', laps: 1, difficulty, arcade: difficulty === 'club' });
    race.launch();
    const seen = Array.from({ length: 4 }, () => new Set<number>());
    let state = race.snapshot();
    let previous = state.cars;
    for (let frame = 0; frame < 60 * 320 && state.phase !== 'results'; frame++) {
      race.step(dt, [{ owned: true, input: null }]);
      state = race.snapshot();
      if (state.phase !== 'race') { previous = state.cars; continue; }
      for (const [slot, car] of state.cars.entries()) {
        assert.equal(car.blink, false);
        assert.ok(Math.abs(arcDelta(previous[slot].distance!, car.distance!, SPACEPORT.length)) < 0.4);
        for (const [index, section] of SPACEPORT.loops.entries()) {
          for (const [phase, s] of [section.from + 1, (section.from + section.to) / 2, section.to - 1].entries()) {
            if (Math.abs(car.distance! - s) < 0.2) seen[slot].add(index * 3 + phase);
          }
        }
      }
      previous = state.cars;
    }
    assert.equal(state.phase, 'results');
    assert.deepEqual(state.cars.map(car => car.lap), [1, 1, 1, 1]);
    assert.deepEqual(seen.map(markers => markers.size), [6, 6, 6, 6]);
    assert.ok(state.results?.every(result => result.time !== null));
  });
}
