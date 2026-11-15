import assert from 'node:assert/strict';
import test from 'node:test';
import { DIQUE, getCourse } from '../src/shared/courses.ts';
import { GRID_LANE_OFFSET } from '../src/shared/car-dimensions.ts';
import { NEUTRAL, defaultRaceConfig, type Driver, type RaceSnapshot } from '../src/shared/protocol.ts';
import { TRACK } from '../src/shared/track.ts';
import { Race } from '../src/sim/race.ts';

const TICK = 1 / 60;
const parked: Driver = { owned: true, input: NEUTRAL };

function stepUntilResults(race: Race, drivers: readonly Driver[], maxSeconds: number, observe?: (state: RaceSnapshot) => void) {
  for (let frame = 0; frame < 60 * maxSeconds; frame++) {
    race.step(TICK, drivers);
    const state = race.snapshot();
    if (state.phase === 'results') return state;
    observe?.(state);
  }
  assert.fail('the Dique race did not finish');
}

test('Dique follows the approved scale, two decks, tunnel and passing zones', () => {
  assert.equal(getCourse(), getCourse('taller'));
  assert.equal(getCourse('taller').sampleAt, TRACK.sampleAt);
  assert.equal(getCourse('dique'), DIQUE);
  assert.ok(Math.abs(DIQUE.length - TRACK.length * 4) < 1e-6);
  assert.deepEqual(DIQUE.sampleAt(DIQUE.length), DIQUE.sampleAt(0));
  const high = DIQUE.sampleAt(DIQUE.crossing.upper);
  const low = DIQUE.sampleAt(DIQUE.crossing.lower);
  assert.ok(Math.hypot(high.x - low.x, high.z - low.z) < 0.04);
  assert.ok(Math.abs(high.s - 369.45) < 0.02 && Math.abs(low.s - 606.46) < 0.02);
  assert.equal(high.y, 4.8);
  assert.equal(low.y, -0.7);
  assert.ok(Math.abs(DIQUE.crossing.clearance - 4.9) < 1e-8);
  assert.equal(DIQUE.tunnel.to - DIQUE.tunnel.from, 52);
  assert.equal(DIQUE.tunnel.clearance, 2.75);
  assert.equal(DIQUE.roadHalfAt(high.s), 3);
  assert.equal(DIQUE.roadHalfAt(low.s), 3.2);
  assert.ok(Math.abs(DIQUE.locate(low.x, low.z, { y: high.y }).s - high.s) < 0.1);
  assert.ok(Math.abs(DIQUE.locate(high.x, high.z, low).s - low.s) < 0.1);
  assert.ok(Math.abs(DIQUE.locate(high.x, high.z, high).s - high.s) < 0.1);
  assert.equal(DIQUE.roadHalfAt(DIQUE.anchors.crane), 4.5);
  assert.equal(DIQUE.roadHalfAt(DIQUE.anchors.chicaneOut), 2.5);
  assert.equal(DIQUE.roadHalfAt(DIQUE.anchors.spillway), 4.4);
  assert.equal(DIQUE.roadHalfAt(DIQUE.anchors.maleconFirst), 4);
  assert.equal(DIQUE.bankAt(DIQUE.crossing.upper), 0);
  assert.equal(DIQUE.bankAt(DIQUE.crossing.lower), 0);
  assert.ok(Math.abs(DIQUE.bankAt(DIQUE.anchors.crane) - Math.tan(8 * Math.PI / 180)) < 1e-8);
  assert.ok(DIQUE.wetAt(DIQUE.anchors.crane, -1.5) > 0.95);
  assert.equal(DIQUE.wetAt(DIQUE.anchors.crane, 2.5), 0);

  const grades = DIQUE.samples.slice(1).map((point, i) => (point.y - DIQUE.samples[i].y) / (point.s - DIQUE.samples[i].s));
  assert.ok(Math.max(...grades) >= 0.112 && Math.max(...grades) <= 0.113);
  assert.ok(Math.min(...grades) >= -0.140 && Math.min(...grades) <= -0.138);
});

test('a Dique practice session parks four drivers and can switch back to Taller cleanly', () => {
  const race = new Race({ manual: true });
  assert.equal(race.configure({ ...defaultRaceConfig, course: 'dique', mode: 'practice', bots: 0 }), true);
  assert.equal(race.snapshot().config?.course, 'dique');
  assert.equal(race.launch(), true);
  race.step(TICK, [parked, parked, parked, parked]);
  const practice = race.snapshot();
  assert.equal(practice.phase, 'practice');
  for (const [i, car] of practice.cars.entries()) {
    assert.equal(car.pitReady, true);
    assert.ok(Math.abs(car.distance! - DIQUE.pit.stalls[i]) < 0.05);
  }

  race.returnToDemo();
  assert.equal(race.configure({ ...defaultRaceConfig, course: 'taller' }), true);
  const newCourse = race.snapshot();
  assert.equal(newCourse.config?.course, 'taller');
  assert.equal(newCourse.phase, 'demo');
  assert.equal(newCourse.heat, practice.heat);
  assert.ok(newCourse.cars.every(car => car.distance! < TRACK.length && car.lap === 0 && !car.pitReady));
});

test('a sole Dique driver can change car without leaving the stopped pit position', () => {
  const race = new Race({ manual: true });
  race.configure({ ...defaultRaceConfig, course: 'dique', mode: 'practice', bots: 0 });
  race.launch();
  race.step(TICK, [parked]);
  const before = race.snapshot().cars[0];
  assert.equal(race.swapPracticeCar(0, 1), true);
  race.step(TICK, [undefined, parked]);
  const after = race.snapshot().cars[1];
  assert.equal(after.pitReady, true);
  assert.deepEqual([after.x, after.y, after.z, after.distance], [before.x, before.y, before.z, before.distance]);
});

test('the fourth pit stall connects to the dock straight without losing pit speed protection', () => {
  const race = new Race({ manual: true });
  const drivers = [parked, parked, parked, parked];
  race.configure({ ...defaultRaceConfig, course: 'dique', mode: 'practice', bots: 0 });
  race.launch();
  race.step(TICK, drivers);
  let peakPitSpeed = 0;
  let enteredTrack = false;
  for (let frame = 0; frame < 60 * 14; frame++) {
    const car = race.snapshot().cars[3];
    const current = DIQUE.locate(car.x, car.z, { s: car.distance, y: car.y });
    if (DIQUE.isPitLane(current.s, current.offset)) peakPitSpeed = Math.max(peakPitSpeed, car.speed);
    if (current.s > DIQUE.pit.exit + 3) {
      enteredTrack = Math.abs(current.offset) < DIQUE.roadHalfAt(current.s) && car.speed > DIQUE.pit.speedLimit;
      break;
    }
    const aim = DIQUE.sampleAt(current.s + 4);
    const blend = Math.max(0, Math.min(1, (aim.s - 100) / 16));
    const merge = blend * blend * (3 - 2 * blend);
    const offset = DIQUE.pit.offset + (GRID_LANE_OFFSET - DIQUE.pit.offset) * merge;
    const yaw = Math.atan2(aim.x - aim.dz * offset - car.x, aim.z + aim.dx * offset - car.z);
    const steer = Math.max(-1, Math.min(1, (car.yaw - yaw) * 1.8));
    drivers[3] = { owned: true, input: { x: steer, gas: true, brake: false } };
    race.step(TICK, drivers);
    assert.equal(race.snapshot().impacts, undefined);
  }
  assert.equal(peakPitSpeed, DIQUE.pit.speedLimit);
  assert.ok(enteredTrack);
});

test('a four-car Dique race completes both levels and records the approved lap rhythm', () => {
  const race = new Race({ manual: true });
  const drivers: Driver[] = [{ owned: true, input: null }];
  assert.equal(race.configure({ ...defaultRaceConfig, course: 'dique', laps: 1 }), true);
  assert.equal(race.launch(), true);
  const passages = Array.from({ length: 4 }, () => new Set<string>());
  const finish = stepUntilResults(race, drivers, 128, state => {
    if (state.phase !== 'race') return;
    for (const [slot, car] of state.cars.entries()) {
      if (Math.abs(car.distance! - DIQUE.crossing.upper) < 1) {
        assert.ok(Math.abs(car.y - 4.8) < 0.02);
        passages[slot].add('upper');
      }
      if (Math.abs(car.distance! - DIQUE.crossing.lower) < 1) {
        assert.ok(Math.abs(car.y + 0.7) < 0.02);
        passages[slot].add('lower');
      }
    }
  });
  assert.deepEqual(finish.cars.map(car => car.lap), [1, 1, 1, 1]);
  assert.deepEqual(passages.map(levels => levels.size), [2, 2, 2, 2]);
  const best = Math.min(...finish.cars.map(car => car.bestLap ?? Infinity));
  assert.ok(best >= 80 && best <= 105, `best lap was ${best} seconds`);
});

test('the Pro bots retain the approved lap rhythm on the Dique', () => {
  const race = new Race({ manual: true });
  race.configure({ ...defaultRaceConfig, course: 'dique', laps: 1, difficulty: 'pro' });
  race.launch();
  const result = stepUntilResults(race, [{ owned: true, input: null }], 110);
  assert.ok(result.results?.every(entry => entry.time !== null && entry.bestLap! >= 80 && entry.bestLap! <= 105));
});

test('the wet inside line uses about 82 percent of the dry line’s tire grip', async () => {
  const { CAR_DIMENSIONS } = await import('../src/shared/car-dimensions.ts');
  const { tireLoad } = await import('../src/sim/road-contact.ts');
  const at = DIQUE.sampleAt(DIQUE.anchors.crane);
  const dry = tireLoad({ ...at, offset: GRID_LANE_OFFSET * 2.5 }, CAR_DIMENSIONS[0], 1, 0, DIQUE);
  const wet = tireLoad({ ...at, offset: -GRID_LANE_OFFSET * 1.8 }, CAR_DIMENSIONS[0], 1, 0, DIQUE);
  assert.equal(dry.grip, 1);
  assert.ok(wet.grip >= 0.82 && wet.grip < 0.85);
});
