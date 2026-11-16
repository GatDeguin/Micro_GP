import assert from 'node:assert/strict';
import test from 'node:test';
import { CAR_DIMENSIONS } from '../src/shared/car-dimensions.ts';
import { TALLER, type Course } from '../src/shared/courses.ts';
import { defaultRaceConfig } from '../src/shared/protocol.ts';
import { angleDifference, botDrive, type BotPlan } from '../src/sim/bot.ts';
import { Race } from '../src/sim/race.ts';

const dt = 1 / 60;
const straight: Course = {
  ...TALLER, length: 1000,
  sampleAt: s => ({ s, x: 0, y: 0, z: s, dx: 0, dz: 1 }),
  roadHalfAt: () => 4, wallHalfAt: () => 4.5, bankAt: () => 0,
  surfaceAt: () => 'asphalt', wetAt: () => 0,
};

function car(s: number, offset: number, speed: number, lane = offset) {
  return {
    active: true, x: -offset, z: s, yaw: 0, speed,
    road: { ...straight.sampleAt(s), offset }, dimensions: CAR_DIMENSIONS[0],
    bot: { lane, time: 0, wrongWay: 0 } as BotPlan,
  };
}

test('a clear target lane does not permit cutting across a car alongside', () => {
  const passing = car(20, 0.95, 7, -2.6);
  const alongside = car(19, -0.8, 7);
  botDrive([passing, alongside], 0, -2.6, 'pro', false, dt, straight);
  assert.ok(passing.bot.lane > 1.5, 'the bot must stay on its side until the middle car clears');
});

test('a passing bot keeps its chosen side when the preferred lane briefly becomes competitive', () => {
  const passing = car(20, 0.2, 5, -0.93);
  passing.bot.commitment = 0.6;
  const leader = car(28, 0.93, 8);
  for (let frame = 0; frame < 24; frame++) botDrive([passing, leader], 0, 0.93, 'pro', false, dt, straight);
  assert.equal(passing.bot.lane, -0.93, 'an unfinished pass must not turn back across the leader');
});

test('a sideways obstruction is wider than its nominal lane', () => {
  const passing = car(20, -0.93, 7);
  const obstruction = car(24, 0.93, 0);
  obstruction.yaw = Math.PI / 2;
  const input = botDrive([passing, obstruction], 0, -0.93, 'club', false, dt, straight);
  assert.equal(input.brake, true, 'the rotated nose and tail intrude into the approaching lane');
});

test('a bot slows a badly misaligned car before steering back onto its route', () => {
  const recovering = car(20, 0, 5);
  recovering.yaw = 1.2;
  const input = botDrive([recovering], 0, 0, 'club', false, dt, straight);
  assert.equal(input.brake, true);
  assert.equal(input.gas, false);
  assert.ok(input.x > 0.8);
});

test('a fast Spaceport bot brakes for a corner beyond its normal steering aim', () => {
  const approaching = car(20, 0, 11.5);
  const course: Course = { ...straight, id: 'spaceport' };
  const clear = botDrive([approaching], 0, 0, 'pro', false, dt, course);
  assert.equal(clear.gas, true);
  const bend: Course = {
    ...course,
    sampleAt: s => {
      const angle = Math.max(0, s - 31) * 0.65;
      return { s, x: 0, y: 0, z: s, dx: Math.sin(angle), dz: Math.cos(angle) };
    },
  };
  const braking = botDrive([approaching], 0, 0, 'pro', false, dt, bend);
  assert.equal(braking.brake, true);
  assert.equal(braking.gas, false);
});

test('a collision yaw is corrected under normal physics without striking the barrier or resetting', () => {
  const race = new Race({ manual: true });
  race.configure({ ...defaultRaceConfig, bots: 1, laps: 1 });
  race.launch();
  for (let frame = 0; frame < 270; frame++) race.step(dt, []);
  // Inject only the impact's resulting heading/velocity, then let Race.step own
  // every movement, collision, gear and checkpoint update.
  const displaced = (race as unknown as { cars: (ReturnType<typeof car> & { motionYaw: number })[] }).cars[0];
  displaced.yaw -= 1.2;
  displaced.motionYaw = displaced.yaw;
  displaced.speed = 5;
  let aligned = false;
  let previous = race.snapshot().cars[0];
  for (let frame = 0; frame < 120; frame++) {
    race.step(dt, []);
    const state = race.snapshot();
    const view = state.cars[0];
    assert.equal(state.impacts, undefined);
    assert.equal(view.blink, false);
    assert.ok(Math.hypot(view.x - previous.x, view.z - previous.z) < 0.3, 'recovery must remain continuous');
    const point = TALLER.sampleAt(view.distance!);
    if (frame < 48 && Math.abs(angleDifference(view.yaw - Math.atan2(point.dx, point.dz))) < 0.2) aligned = true;
    previous = view;
  }
  assert.equal(aligned, true);
});

for (const difficulty of ['rookie', 'club', 'pro'] as const) {
  test(`four ${difficulty} bots finish three Taller laps without deadlock or recovery resets`, () => {
    const race = new Race({ manual: true });
    race.configure({ ...defaultRaceConfig, difficulty });
    race.launch();
    const drivers = [{ owned: true, input: null }];
    let state = race.snapshot();
    let stopped = 0;
    for (let frame = 0; frame < 60 * 110 && state.phase !== 'results'; frame++) {
      race.step(dt, drivers);
      state = race.snapshot();
      if (state.phase !== 'race' || frame < 360) continue;
      assert.ok(state.cars.every(car => !car.blink), 'bots must drive the course instead of resetting');
      stopped = state.cars.some(car => car.speed < 0.2) ? stopped + dt : 0;
      assert.ok(stopped < 2, 'side-by-side traffic must not deadlock');
    }
    assert.equal(state.phase, 'results');
    assert.deepEqual(state.cars.map(car => car.lap), [3, 3, 3, 3]);
  });
}
