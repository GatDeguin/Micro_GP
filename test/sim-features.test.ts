import assert from 'node:assert/strict';
import test from 'node:test';
import { NEUTRAL, type CarView, type Driver, type RaceConfig } from '../src/shared/protocol.ts';
import { PIT_LANE, ROAD_HALF, TRACK, type TrackLocation } from '../src/shared/track.ts';
import { CAR_DIMENSIONS } from '../src/shared/car-dimensions.ts';
import { Race } from '../src/sim/race.ts';
import { slopeFor, tireLoad } from '../src/sim/road-contact.ts';

const TICK = 1 / 60;
const stopped: Driver = { owned: true, input: NEUTRAL };
const gas: Driver = { owned: true, input: { ...NEUTRAL, gas: true } };
const config: RaceConfig = { laps: 1, bots: 0, difficulty: 'club', mode: 'race', night: false };

function tick(race: Race, drivers: readonly (Driver | undefined)[], seconds: number) {
  for (let i = 0; i < Math.round(seconds / TICK); i++) race.step(TICK, drivers);
}

function waitFor(race: Race, drivers: readonly (Driver | undefined)[], limit: number, predicate: () => boolean) {
  for (let i = 0; i < Math.round(limit / TICK) && !predicate(); i++) race.step(TICK, drivers);
  assert.ok(predicate(), 'the simulator never reached the expected state');
}

function ready(slot: number) {
  const race = new Race({ manual: true });
  const inputs = (driver: Driver) => Array.from({ length: 4 }, (_, i) => i === slot ? driver : undefined);
  assert.equal(race.configure(config), true);
  assert.equal(race.launch(), true);
  tick(race, inputs(stopped), 3);
  assert.equal(race.snapshot().phase, 'race');
  return { race, inputs };
}

function aimAt(car: CarView, distance: number, offset: number, speed: number): Driver {
  const point = TRACK.sampleAt(distance);
  const yaw = Math.atan2(point.x - point.dz * offset - car.x, point.z + point.dx * offset - car.z);
  const delta = car.yaw - yaw;
  const steer = Math.atan2(Math.sin(delta), Math.cos(delta)) * 1.8;
  return { owned: true, input: { x: Math.max(-1, Math.min(1, steer)), gas: car.speed < speed, brake: car.speed > speed + 0.34 } };
}

function roadOf(car: CarView): TrackLocation {
  return TRACK.locate(car.x, car.z, { s: car.distance, y: car.y });
}

test('lifting GAS cuts throttle on the first tick and slows a rolling car on the bridge descent', () => {
  const { race, inputs } = ready(0);
  const view = () => race.snapshot().cars[0];
  tick(race, inputs(gas), 0.45);
  assert.equal(view().sound?.throttle, 1);
  const flatSpeed = view().speed;
  race.step(TICK, inputs(stopped));
  assert.equal(view().sound?.throttle, 0);
  assert.ok(view().speed < flatSpeed);

  const descent = TRACK.crossing.upperTo + 2.5;
  for (let i = 0; i < 60 * 35; i++) {
    const car = view();
    const road = roadOf(car);
    if (Math.abs(road.s - descent) < 1.3 && car.speed <= 0.85) break;
    const brake = road.s >= descent - 1.2 && road.s <= descent + 1.3;
    const driver = aimAt(car, road.s + 3, 0, 5);
    race.step(TICK, inputs(brake ? { owned: true, input: { ...driver.input!, gas: false, brake: true } } : driver));
  }
  const rolling = view();
  assert.ok(Math.abs(roadOf(rolling).s - descent) < 1.3 && rolling.speed > 0.2 && rolling.speed <= 0.85,
    'the car is rolling slowly on the downhill section');
  tick(race, inputs(stopped), 0.4);
  assert.ok(view().speed < rolling.speed - 0.08, 'coasting downhill does not feel like more GAS');
});

test('a configured one-lap heat waits for launch and retains timed results', () => {
  const race = new Race({ manual: true });
  const drivers = [{ ...stopped, livery: 'clean' } as const];
  assert.equal(race.configure({ ...config, bots: 1 }), true);
  tick(race, drivers, 0.4);
  assert.equal(race.snapshot().phase, 'demo');
  assert.equal(race.launch(), true);
  tick(race, drivers, 3);
  assert.deepEqual(race.snapshot().cars.map(car => car.active), [true, true, false, false]);
  assert.equal(race.snapshot().cars[0].livery, 'clean');

  waitFor(race, drivers, 55, () => race.snapshot().phase === 'results');
  const finish = race.snapshot();
  assert.deepEqual(finish.order, [1, 0]);
  assert.equal(finish.cars[1].lap, 1);
  assert.ok((finish.cars[1].lastLap ?? 0) > 16);
  assert.equal(finish.cars[1].lastLap, finish.cars[1].bestLap);
  assert.ok(finish.cars[1].sectorTimes?.every(time => time !== null && time > 0));
  assert.equal(finish.results?.[0].slot, 1);
  assert.ok((finish.results?.[0].time ?? 0) >= finish.cars[1].bestLap!);
  assert.equal(finish.results?.[1].time, null);
  assert.equal(finish.cars[1].gap, 0);
  tick(race, drivers, 8);
  assert.deepEqual(race.snapshot().results, finish.results);
  race.returnToDemo();
  assert.equal(race.snapshot().phase, 'demo');
});

test('two cars side by side report a zero gap between progress samples', () => {
  const race = new Race({ manual: true });
  race.configure(config);
  race.launch();
  tick(race, [stopped, stopped], 3);
  tick(race, [gas, gas], 52 * TICK);
  const [first, second] = race.snapshot().cars;
  assert.ok(first.distance! > 0 && first.distance! < 0.85);
  assert.equal(first.distance, second.distance);
  assert.equal(first.gap, 0);
  assert.ok(Math.abs(second.gap ?? Infinity) < 1e-6);
});

test('a crossing just after the finish cutoff is a DNF even on the same tick', () => {
  function finishWithDelay(delay: number) {
    const race = new Race({ manual: true });
    race.configure(config);
    race.launch();
    tick(race, [stopped, stopped], 3);
    for (let frame = 0; frame < 60 * 53; frame++) {
      const state = race.snapshot();
      if (state.phase === 'results') return state;
      const [first, second] = state.cars;
      const leader = aimAt(first, first.distance! + 1.8 + first.speed * 0.34, 0.93, 6.15);
      const trailer = frame < delay ? stopped
        : aimAt(second, second.distance! + 1.8 + second.speed * 0.34, -0.93, 6.17);
      race.step(TICK, [leader, trailer]);
    }
    assert.fail('the heat did not reach results');
  }

  const onTime = finishWithDelay(906);
  const [leader, trailer] = onTime.results!;
  assert.ok(leader.time !== null && trailer.time !== null);
  const cutoff = leader.time + 15;
  assert.ok(trailer.time < cutoff && trailer.time + TICK > cutoff);
  assert.equal(Math.ceil((trailer.time + TICK) / TICK), Math.ceil(cutoff / TICK));

  const late = finishWithDelay(907);
  assert.equal(late.results?.[1].time, null);
  assert.equal(late.cars[1].lap, 0);
  assert.ok(Math.abs(late.time! - cutoff) < 1e-8);
  assert.equal(onTime.time, trailer.time);
});

test('a stopped practice driver swaps cars in the garage and can leave under power', () => {
  const race = new Race({ manual: true });
  assert.equal(race.configure({ ...config, mode: 'practice', bots: 1 }), true);
  assert.equal(race.launch(), true);
  race.step(TICK, [stopped]);
  const [original, displaced] = race.snapshot().cars;
  assert.equal(race.snapshot().phase, 'practice');
  assert.equal(original.pitReady, true);
  assert.equal(race.swapPracticeCar(0, 1), true);

  const newDriver = { ...stopped, livery: 'sector' } as const;
  race.step(TICK, [undefined, newDriver]);
  const parked = race.snapshot().cars[1];
  assert.equal(parked.x, original.x);
  assert.equal(parked.z, original.z);
  assert.equal(parked.livery, 'sector');
  assert.equal(parked.pitReady, true);
  assert.equal(parked.transmission?.gear, 0);
  assert.ok(parked.transmission!.shift > displaced.transmission!.shift);
  assert.equal(race.snapshot().cars.filter(car => car.active).length, 2);
  tick(race, [undefined, gas], 0.72);
  assert.ok(race.snapshot().cars[1].x > parked.x + 0.3);
  assert.equal(race.snapshot().cars[1].pitReady, false);
  assert.equal(race.swapPracticeCar(1, 3), false);
});

test('the pit lane limits speed and connects back to the main straight', () => {
  const race = new Race({ manual: true });
  race.configure({ ...config, mode: 'practice' });
  race.launch();
  tick(race, [gas], 50 * TICK);
  assert.equal(race.snapshot().cars[0].speed, PIT_LANE.speedLimit);

  for (let i = 0; i < 350; i++) {
    const car = race.snapshot().cars[0];
    const road = roadOf(car);
    if (road.s > PIT_LANE.exit + 0.8) break;
    const ahead = road.s + 3;
    const merge = Math.max(0, Math.min(1, (ahead - 17.8) / 10.5));
    const offset = PIT_LANE.offset + (0.93 - PIT_LANE.offset) * merge;
    race.step(TICK, [aimAt(car, ahead, offset, 3.5)]);
    assert.equal(race.snapshot().cars[0].blink, false);
  }
  const car = race.snapshot().cars[0];
  const road = roadOf(car);
  assert.ok(road.s > PIT_LANE.exit && Math.abs(road.offset) < ROAD_HALF && car.speed > 2);
});

test('the compact turns sooner while the bólido pulls ahead on a straight', () => {
  const compact = ready(0);
  const racer = ready(2);
  const steering: Driver = { ...gas, input: { ...gas.input!, x: 0.68 } };
  for (const setup of [compact, racer]) {
    tick(setup.race, setup.inputs(gas), 0.40);
    tick(setup.race, setup.inputs(steering), 0.23);
  }
  const a = compact.race.snapshot().cars[0];
  const b = racer.race.snapshot().cars[2];
  assert.ok(a.yaw + 0.02 < b.yaw);

  const straightCompact = ready(0);
  const straightRacer = ready(2);
  for (const setup of [straightCompact, straightRacer]) tick(setup.race, setup.inputs(gas), 3.05);
  assert.ok(straightRacer.race.snapshot().cars[2].speed > straightCompact.race.snapshot().cars[0].speed + 0.35);
});

test('each model reaches fifth gear and gains 12 to 17 percent straight-line speed', () => {
  const priorTopSpeeds = [9.5, 9.5, 10.32, 9.56];
  const topSpeeds = priorTopSpeeds.map((previous, slot) => {
    const { race, inputs } = ready(slot);
    tick(race, inputs(gas), 3.05);
    const car = race.snapshot().cars[slot];
    assert.equal(car.transmission?.gear, 5);
    assert.ok(car.speed >= previous * 1.12 && car.speed <= previous * 1.17);
    return car.speed;
  });
  assert.ok(topSpeeds[2] > Math.max(topSpeeds[0], topSpeeds[1], topSpeeds[3]));
});

test('the cupé gains speed on corner exit and the cuña keeps more speed in a fast turn', () => {
  function exitGain(slot: number) {
    const { race, inputs } = ready(slot);
    tick(race, inputs(gas), 0.70);
    tick(race, inputs({ ...gas, input: { ...gas.input!, x: 0.75 } }), 0.27);
    const entry = race.snapshot().cars[slot].speed;
    tick(race, inputs(gas), 0.25);
    const exit = race.snapshot().cars[slot];
    assert.equal(exit.transmission?.gear, 4);
    return exit.speed - entry;
  }
  function cornerSpeed(slot: number) {
    const { race, inputs } = ready(slot);
    tick(race, inputs(gas), 2);
    const turn = slot % 2 ? 0.92 : -0.92;
    tick(race, inputs({ ...gas, input: { ...gas.input!, x: turn } }), 0.29);
    return race.snapshot().cars[slot].speed;
  }
  assert.ok(exitGain(1) > exitGain(3) + 0.12);
  assert.ok(cornerSpeed(3) > cornerSpeed(2) + 0.30);
});

test('cornering rolls the body and braking pitches the nose down', () => {
  const { race, inputs } = ready(0);
  tick(race, inputs(gas), 1.3);
  tick(race, inputs({ ...gas, input: { ...gas.input!, x: -0.7 } }), 0.20);
  const corner = race.snapshot().cars[0].suspension;
  assert.ok(corner && corner.roll > 0.02);
  tick(race, inputs({ owned: true, input: { ...NEUTRAL, brake: true } }), 0.18);
  const brake = race.snapshot().cars[0].suspension;
  assert.ok(brake && brake.pitch > 0.025);
  assert.ok(Number.isFinite(brake.heave));
});

test('full braking builds pressure and stops a fifth-gear car within the braking zone', () => {
  const { race, inputs } = ready(0);
  tick(race, inputs(gas), 2.3);
  const entry = race.snapshot().cars[0];
  assert.equal(entry.transmission?.gear, 5);
  const brake = inputs({ owned: true, input: { ...NEUTRAL, brake: true } });
  race.step(TICK, brake);
  const firstDrop = entry.speed - race.snapshot().cars[0].speed;
  tick(race, brake, 0.10);
  const before = race.snapshot().cars[0].speed;
  race.step(TICK, brake);
  const laterDrop = before - race.snapshot().cars[0].speed;
  assert.ok(firstDrop > 0.1 && laterDrop > firstDrop + 0.04);
  waitFor(race, brake, 0.64, () => race.snapshot().cars[0].speed === 0);
  const stopped = race.snapshot().cars[0];
  assert.ok(Math.hypot(stopped.x - entry.x, stopped.z - entry.z) < 3.95);
});

test('the tires blend seams and distinguish escape asphalt, gravel and grass', () => {
  const compact = CAR_DIMENSIONS[0];
  const sample = (s: number, offset: number) => tireLoad({ ...TRACK.sampleAt(s), offset }, compact, 1, 0);
  const grassyStraight = 14;
  const grassBands = TRACK.surfaceBandsAt(grassyStraight, 1);
  const asphalt = sample(grassyStraight, 0);
  const beforeCurb = sample(grassyStraight, grassBands.asphalt - compact.tireOffset - 0.08);
  const ontoCurb = sample(grassyStraight, grassBands.asphalt - compact.tireOffset + 0.08);
  const grass = sample(grassyStraight, (grassBands.gravel + grassBands.wall) / 2 - compact.tireOffset);
  const gravelAt = TRACK.anchors.hairpinApex;
  const gravelBands = TRACK.surfaceBandsAt(gravelAt, 1);
  const gravel = sample(gravelAt, (gravelBands.escape + gravelBands.gravel) / 2 - compact.tireOffset);
  const escapeAt = (TRACK.chicane.apexIn + TRACK.chicane.apexOut) / 2;
  const escapeBands = TRACK.surfaceBandsAt(escapeAt, 1);
  const escape = sample(escapeAt, (escapeBands.curb + escapeBands.escape) / 2 - compact.tireOffset);

  assert.ok(beforeCurb.curb > 0 && ontoCurb.curb > beforeCurb.curb && ontoCurb.curb < 0.5);
  assert.ok(escape.escape > 0.4 && gravel.gravel > 0.4 && grass.grass > 0.4);
  assert.ok(asphalt.grip > escape.grip && escape.grip > gravel.grip && gravel.grip > grass.grip);
  assert.ok(gravel.drag > grass.drag && grass.drag > escape.drag);
});

test('the two banked curves add opposite lateral forces on their slopes', () => {
  const rightEnd = { ...TRACK.sampleAt(TRACK.anchors.hairpinApex), offset: 0.8 };
  const leftEnd = { ...TRACK.sampleAt(TRACK.anchors.sweepApex), offset: 0.8 };
  assert.ok(slopeFor(rightEnd, 1, 0).lateral > 1.3);
  assert.ok(slopeFor(leftEnd, 1, 0).lateral < -1.2);
  assert.ok(TRACK.heightAt(rightEnd.s, rightEnd.offset) > rightEnd.y + 0.10);
  assert.ok(TRACK.heightAt(leftEnd.s, leftEnd.offset) < leftEnd.y - 0.10);
});

test('bot difficulty changes actual lap pace', () => {
  const lap = (difficulty: RaceConfig['difficulty']) => {
    const race = new Race({ manual: true });
    race.configure({ ...config, bots: 1, difficulty });
    race.launch();
    waitFor(race, [], 42, () => race.snapshot().phase === 'results');
    return race.snapshot().cars[0].bestLap!;
  };
  assert.ok(lap('pro') + 1.2 < lap('rookie'));
});

test('a bot yields to a blocked front row and then overtakes through the open lane', () => {
  const race = new Race({ manual: true });
  race.configure({ ...config, bots: 1, difficulty: 'pro' });
  race.launch();
  tick(race, [stopped, stopped], 3);
  const initial = race.snapshot().cars;
  tick(race, [stopped, stopped], 2);
  const waiting = race.snapshot();
  assert.equal(waiting.cars[0].x, initial[0].x);
  assert.ok(waiting.cars[2].x < initial[2].x + 0.35 && waiting.cars[2].speed < 0.15);

  for (let i = 0; i < 600; i++) {
    race.step(TICK, [stopped, gas]);
    assert.ok(!race.snapshot().impacts?.some(impact => impact.kind === 'car'));
  }
  const passed = race.snapshot().cars;
  assert.ok(passed[2].x > passed[0].x + 3.5);
  assert.ok(Math.hypot(passed[0].x - initial[0].x, passed[0].z - initial[0].z) < 0.2);
});

test('a driven lap records clean sectors and bridge unload while bot assistance invalidates the affected record', () => {
  function lap(assisted: boolean) {
    const { race, inputs } = ready(0);
    let crestHeave = 0;
    let keptPaint = false;
    for (let i = 0; i < 60 * 42 && race.snapshot().phase === 'race'; i++) {
      const car = race.snapshot().cars[0];
      const road = roadOf(car);
      if (Math.abs(road.s - TRACK.anchors.crest) < 7.5) crestHeave = Math.max(crestHeave, car.suspension!.heave);
      const fallback = assisted && i >= 240 && i < 300;
      const pace = Math.abs(road.s - TRACK.anchors.crest) < 9 ? 7.45 : 6.15;
      const driver = aimAt(car, road.s + 1.8 + car.speed * 0.34, 0.93, pace);
      race.step(TICK, fallback ? [] : inputs({ ...driver, livery: 'sector' }));
      if (fallback) keptPaint = race.snapshot().cars[0].livery === 'sector' && !race.snapshot().cars[0].owned;
    }
    const finish = race.snapshot();
    assert.equal(finish.phase, 'results');
    return { car: finish.cars[0], crestHeave, keptPaint };
  }

  const driven = lap(false);
  assert.equal(driven.car.cleanLap, true);
  assert.ok(driven.car.sectorTimes?.every(time => time !== null));
  assert.ok(driven.crestHeave > 0.035);

  const assisted = lap(true);
  assert.equal(assisted.car.cleanLap, false);
  assert.ok(assisted.car.lastLap !== null);
  assert.equal(assisted.car.sectorTimes?.[0], null);
  assert.ok(assisted.keptPaint);
});

test('every bot completes the chicane and both decks with continuous height and progress', () => {
  const race = new Race({ manual: true });
  const drivers = [{ owned: true, input: null }];
  race.configure({ ...config, bots: 3 });
  race.launch();
  tick(race, drivers, 3);
  let before = race.snapshot().cars;
  const crossed = before.map(() => new Set<string>());
  for (let frame = 0; frame < Math.ceil(60 * (TRACK.length / 4.5 + 5)); frame++) {
    race.step(TICK, drivers);
    const state = race.snapshot();
    for (const [slot, car] of state.cars.entries()) {
      assert.notEqual(car.distance, undefined);
      const distance = car.distance!;
      const delta = Math.abs(distance - before[slot].distance!);
      assert.ok(Math.min(delta, TRACK.length - delta) < 0.85, 'a car jumped to a noncontiguous part of the route');
      assert.ok(Math.abs(car.y - before[slot].y) < 0.19, 'a car jumped to another deck');
      if (Math.abs(distance - TRACK.chicane.apexIn) < 0.3) {
        assert.ok(car.speed > 5);
        crossed[slot].add('first apex');
      }
      if (Math.abs(distance - TRACK.chicane.apexOut) < 0.3) {
        assert.ok(car.speed > 5);
        crossed[slot].add('second apex');
      }
      if (Math.abs(distance - TRACK.crossing.upper) < 0.3) {
        assert.ok(car.y > 2.95);
        crossed[slot].add('upper');
      }
      if (Math.abs(distance - TRACK.crossing.lower) < 0.3) {
        assert.ok(car.y < 0.15);
        crossed[slot].add('lower');
      }
    }
    before = state.cars;
    if (state.phase === 'results') break;
  }
  assert.equal(race.snapshot().phase, 'results');
  assert.deepEqual(crossed.map(zones => zones.size), [4, 4, 4, 4]);
});
