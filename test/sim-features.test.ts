import assert from 'node:assert/strict';
import test from 'node:test';
import { NEUTRAL, type CarView, type Driver, type RaceConfig } from '../src/shared/protocol.ts';
import { PIT_LANE, ROAD_HALF, TRACK } from '../src/shared/track.ts';
import { Race } from '../src/sim/race.ts';

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
    const road = TRACK.locate(car.x, car.z);
    if (road.s > PIT_LANE.exit + 0.8) break;
    const ahead = road.s + 3;
    const merge = Math.max(0, Math.min(1, (ahead - 17.8) / 10.5));
    const offset = PIT_LANE.offset + (0.93 - PIT_LANE.offset) * merge;
    race.step(TICK, [aimAt(car, ahead, offset, 3.5)]);
    assert.equal(race.snapshot().cars[0].blink, false);
  }
  const car = race.snapshot().cars[0];
  const road = TRACK.locate(car.x, car.z);
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
  for (const setup of [straightCompact, straightRacer]) tick(setup.race, setup.inputs(gas), 2);
  assert.ok(straightRacer.race.snapshot().cars[2].speed > straightCompact.race.snapshot().cars[0].speed + 0.35);
});

test('the cupé gains speed on corner exit and the cuña keeps more speed in a fast turn', () => {
  function exitGain(slot: number) {
    const { race, inputs } = ready(slot);
    tick(race, inputs(gas), 0.77);
    tick(race, inputs({ ...gas, input: { ...gas.input!, x: 0.75 } }), 0.27);
    const entry = race.snapshot().cars[slot].speed;
    tick(race, inputs(gas), 0.25);
    return race.snapshot().cars[slot].speed - entry;
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
      const road = TRACK.locate(car.x, car.z);
      if (Math.abs(road.s - TRACK.anchors.crest) < 7.5) crestHeave = Math.max(crestHeave, car.suspension!.heave);
      const fallback = assisted && i >= 240 && i < 300;
      const driver = aimAt(car, road.s + 1.8 + car.speed * 0.34, 0.93, 6.15);
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
