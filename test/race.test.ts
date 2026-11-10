import assert from 'node:assert/strict';
import test from 'node:test';
import { NEUTRAL, type DriveInput, type Driver } from '../src/shared/protocol.ts';
import type { TRACK as Track } from '../src/shared/track.ts';
import type { LapProgress } from '../src/sim/progress.ts';
import type { Race } from '../src/sim/race.ts';

const TICK = 1 / 60;

function step(race: Race, seconds: number, drivers: readonly Driver[] = []) {
  for (let i = 0; i < Math.round(seconds / TICK); i++) race.step(TICK, drivers);
}

function runUntil(race: Race, seconds: number, drivers: readonly Driver[], condition: () => boolean) {
  for (let i = 0; i < Math.round(seconds / TICK); i++) {
    if (condition()) return i * TICK;
    race.step(TICK, drivers);
  }
  assert.ok(condition(), 'simulation did not reach the expected state');
  return seconds;
}

function drive(input: DriveInput): Driver[] {
  return [{ owned: true, input }];
}

function follow(track: typeof Track, progress: LapProgress, from: number, to: number, forward = true) {
  let last = track.sampleAt(from);
  const steps = Math.ceil(Math.abs(to - from) / 0.16);
  for (let i = 1; i <= steps; i++) {
    const next = track.sampleAt(from + (to - from) * i / steps);
    progress.advance(last, next, forward);
    last = next;
  }
}

test('the closed course has a compound right entry and bounded grades on banked pavement', async () => {
  const { TRACK, ROAD_HALF, PIT_LANE, isPitLane, roadHalfAt, wallHalfAt } = await import('../src/shared/track.ts');
  const start = TRACK.sampleAt(0);
  assert.deepEqual([start.x, start.y, start.z, start.dx, start.dz], [-3.75, 0, 8.6875, 1, 0]);
  assert.equal(ROAD_HALF * 2, 78 / 16);
  assert.ok(Math.abs(TRACK.length - 189.84) < 0.06);
  assert.deepEqual(TRACK.sampleAt(TRACK.length), start);

  const bendIn = TRACK.sampleAt(TRACK.anchors.esses + 4);
  const bendOut = TRACK.sampleAt(TRACK.anchors.essesMid + 0.5);
  const apex = TRACK.sampleAt(TRACK.anchors.hairpinApex);
  assert.ok(bendIn.s < bendOut.s && bendOut.s < apex.s);
  assert.ok(bendIn.dz < -0.49 && bendOut.dz > -0.46 && apex.dz < -0.9);
  assert.ok(roadHalfAt(apex.s) > ROAD_HALF * 1.3);
  assert.ok(isPitLane(PIT_LANE.stalls[0], PIT_LANE.offset));
  assert.ok(wallHalfAt(PIT_LANE.stalls[0], -1) > 6);

  let steepestClimb = 0;
  let steepestDescent = 0;
  const segmentLengths = TRACK.samples.map((point, i) => {
    const next = TRACK.samples[(i + 1) % TRACK.samples.length];
    const run = Math.hypot(next.x - point.x, next.z - point.z);
    const rise = next.y - point.y;
    for (const side of [-1, 1]) {
      const offset = side * wallHalfAt(point.s, side);
      const nextOffset = side * wallHalfAt(next.s, side);
      const edgeX = next.x - point.x - (next.dz * nextOffset - point.dz * offset);
      const edgeZ = next.z - point.z + (next.dx * nextOffset - point.dx * offset);
      const edgeRun = Math.hypot(edgeX, edgeZ);
      assert.ok(edgeX * (next.x - point.x) + edgeZ * (next.z - point.z) > 0);
      const grade = rise / edgeRun;
      assert.ok(Math.abs(grade) <= 0.127);
      steepestClimb = Math.max(steepestClimb, grade);
      steepestDescent = Math.max(steepestDescent, -grade);

      const pavement = side * TRACK.surfaceBandsAt(point.s, side).asphalt;
      const nextPavement = side * TRACK.surfaceBandsAt(next.s, side).asphalt;
      const pavementX = next.x - point.x - (next.dz * nextPavement - point.dz * pavement);
      const pavementZ = next.z - point.z + (next.dx * nextPavement - point.dx * pavement);
      const pavementRise = TRACK.heightAt(next.s, nextPavement) - TRACK.heightAt(point.s, pavement);
      assert.ok(Math.abs(pavementRise / Math.hypot(pavementX, pavementZ)) < 0.17);
    }
    return run;
  });
  assert.ok(Math.min(...segmentLengths) / Math.max(...segmentLengths) > 0.99);
  assert.ok(steepestClimb > 0.10 && steepestDescent > 0.10);
  assert.equal(Math.max(...TRACK.samples.map(point => point.y)), TRACK.bridge.height);
  assert.ok(TRACK.bridge.height > 3);

  const lane = TRACK.locate(-3.75, 9.8875);
  assert.ok(Math.min(lane.s, TRACK.length - lane.s) < 0.001);
  assert.ok(Math.abs(lane.offset - 1.2) < 0.001);
});

test('the crossover has two levels and the projected position can select either deck', async () => {
  const { TRACK } = await import('../src/shared/track.ts');
  const crossing = TRACK.crossing;
  const lower = TRACK.sampleAt(crossing.lower);
  const upper = TRACK.sampleAt(crossing.upper);
  assert.ok(Math.hypot(upper.x - lower.x, upper.z - lower.z) < 0.06);
  assert.ok(upper.y - lower.y >= 3.0);
  assert.ok(Math.abs(upper.dx * lower.dx + upper.dz * lower.dz) < 0.8);
  assert.ok(crossing.lowerFrom < crossing.lower && crossing.lower < crossing.lowerTo);
  assert.ok(crossing.upperFrom < crossing.upper && crossing.upper < crossing.upperTo);
  for (const point of [upper, lower]) {
    const here = TRACK.locate(lower.x, lower.z, { s: point.s - 0.2, y: point.y });
    assert.ok(Math.abs(here.s - point.s) < 0.12 && Math.abs(here.y - point.y) < 0.06);
  }
});

test('the elevated chicane has two opposing apices and a tighter line than the hairpin', async () => {
  const { TRACK, roadHalfAt } = await import('../src/shared/track.ts');
  const chicane = TRACK.chicane;
  assert.ok(chicane.from < chicane.apexIn && chicane.apexIn < chicane.apexOut && chicane.apexOut < chicane.to);
  function turnAt(s: number) {
    const before = TRACK.sampleAt(s - 1.4);
    const after = TRACK.sampleAt(s + 1.4);
    return Math.atan2(before.dz * after.dx - before.dx * after.dz, before.dx * after.dx + before.dz * after.dz);
  }
  const enter = turnAt(chicane.apexIn);
  const exit = turnAt(chicane.apexOut);
  assert.ok(enter < -0.2 && exit > 0.2);
  assert.ok(roadHalfAt(chicane.apexIn) < roadHalfAt(TRACK.anchors.hairpinApex) * 0.75);
  assert.ok(chicane.to < TRACK.crossing.upperFrom);
});

test('the start arms the lap and a finish requires forward travel through each gate', async () => {
  const { TRACK } = await import('../src/shared/track.ts');
  const { LapProgress } = await import('../src/sim/progress.ts');
  const progress = new LapProgress(-1.6);
  follow(TRACK, progress, -1.6, 0.4);
  assert.equal(progress.lap, 0);

  follow(TRACK, progress, 0.4, TRACK.length - 0.4);
  follow(TRACK, progress, TRACK.length - 0.4, TRACK.length + 0.4, false);
  assert.equal(progress.lap, 0, 'reverse gear cannot award a lap');
  follow(TRACK, progress, TRACK.length + 0.4, TRACK.length - 0.4);
  assert.equal(progress.lap, 0, 'crossing the line the wrong way cannot award a lap');
  follow(TRACK, progress, TRACK.length - 0.4, TRACK.length + 0.4);
  assert.equal(progress.lap, 1);
});

test('a jump past Curvón cannot award its checkpoint or the lap', async () => {
  const { TRACK } = await import('../src/shared/track.ts');
  const { LapProgress } = await import('../src/sim/progress.ts');
  const progress = new LapProgress(-1.6);
  const gate = TRACK.anchors.sweepApex;
  const before = gate - 2.1;
  const after = gate + 2.1;
  follow(TRACK, progress, -1.6, before);
  const beforeJump = progress.distance;
  progress.advance(TRACK.sampleAt(before), TRACK.sampleAt(after), true);
  assert.equal(progress.distance, beforeJump);
  follow(TRACK, progress, after, TRACK.length + 0.4);
  assert.equal(progress.lap, 0);
  assert.ok(progress.distance < gate, 'ranking remains below the missed gate');
});

test('four bots drive the whole race and the result resets to a new grid', async () => {
  const { Race } = await import('../src/sim/race.ts');
  const { TRACK } = await import('../src/shared/track.ts');
  const race = new Race();
  const opening = race.snapshot();
  assert.equal(opening.phase, 'demo');
  assert.equal(opening.cars.length, 4);
  step(race, 0.3);
  assert.notEqual(race.snapshot().cars[0].x, opening.cars[0].x);

  const human = drive(NEUTRAL);
  const lights = new Set<number>();
  runUntil(race, 3, human, () => {
    const state = race.snapshot();
    if (state.phase === 'grid') lights.add(state.lights);
    return state.phase === 'race';
  });
  assert.deepEqual([...lights], [0, 1, 2, 3]);
  assert.equal(race.snapshot().lights, 0);

  const bots = [{ owned: true, input: null }];
  const openingLap = runUntil(race, TRACK.length / 4.5 + 5, bots, () => race.snapshot().cars.every(car => car.lap >= 1));
  const finishLimit = 3 * TRACK.length / 4.7 + 5;
  const firstFinish = openingLap + runUntil(race, finishLimit - openingLap, bots, () => race.snapshot().flag);
  assert.ok(firstFinish >= 3 * TRACK.length / 8.6);
  const resultsDelay = runUntil(race, 15.1, bots, () => race.snapshot().phase === 'results');
  assert.ok(resultsDelay < 15);
  const result = race.snapshot();
  assert.deepEqual(result.cars.map(car => car.lap), [3, 3, 3, 3]);
  assert.equal(new Set(result.order).size, 4);
  assert.equal(result.cars[0].owned, true);

  step(race, 5.95, bots);
  assert.equal(race.snapshot().phase, 'results');
  step(race, 0.06, bots);
  assert.equal(race.snapshot().phase, 'grid');
  assert.equal(race.snapshot().heat, result.heat + 1);
  step(race, 0.1);
  assert.equal(race.snapshot().phase, 'demo');
});

test('after the first finish the race closes with unfinished cars ranked by valid progress', async () => {
  const { Race } = await import('../src/sim/race.ts');
  const { TRACK } = await import('../src/shared/track.ts');
  const race = new Race();
  const human = drive(NEUTRAL);
  runUntil(race, 3 * TRACK.length / 4.5 + 5, human, () => race.snapshot().flag);
  step(race, 14.95, human);
  assert.equal(race.snapshot().phase, 'race');
  step(race, 0.07, human);
  const result = race.snapshot();
  assert.equal(result.phase, 'results');
  assert.equal(result.order.at(-1), 0);
  assert.equal(result.cars[0].lap, 0);
});

test('an active joystick turns the car right while GAS propels it forward', async () => {
  const { Race } = await import('../src/sim/race.ts');
  const neutral = new Race();
  const turning = new Race();
  step(neutral, 3, drive(NEUTRAL));
  step(turning, 3, drive(NEUTRAL));
  const startingX = turning.snapshot().cars[0].x;
  step(neutral, 0.75, drive({ ...NEUTRAL, gas: true }));
  step(turning, 0.75, drive({ ...NEUTRAL, gas: true, x: 0.45 }));
  const straightCar = neutral.snapshot().cars[0];
  const turningCar = turning.snapshot().cars[0];
  assert.ok(turningCar.x > startingX + 0.7);
  assert.ok(turningCar.z > straightCar.z + 0.08);
  assert.ok(turningCar.yaw < straightCar.yaw - 0.15);
});

test('small steering inputs from the calibrated controller still reach the wheels', async () => {
  const { Race } = await import('../src/sim/race.ts');
  const race = new Race();
  step(race, 3.3, drive({ ...NEUTRAL, gas: true, x: 0.06 }));
  assert.equal(race.snapshot().cars[0].steer, 0.06);
});

test('the starting grid fits the larger bodies with clearance in both directions', async () => {
  const { Race } = await import('../src/sim/race.ts');
  const { TRACK } = await import('../src/shared/track.ts');
  const race = new Race();
  step(race, TICK, drive(NEUTRAL));
  const [a, b, c, d] = race.snapshot().cars;
  assert.equal(race.snapshot().phase, 'grid');
  assert.ok(a.x - c.x > 3.52 && b.x - d.x > 3.52, 'the nose and tail need room');
  assert.ok(Math.abs(a.z - b.z) > 1.66 && Math.abs(c.z - d.z) > 1.66, 'the wheels need room');
  assert.ok(b.x + 1.82 < TRACK.sampleAt(0).x, 'the lead bumper remains behind the finish');
});

test('heading determines whether the ends of two cars touch', async () => {
  const { CAR_DIMENSIONS } = await import('../src/shared/car-dimensions.ts');
  const { capsule, contactBetween } = await import('../src/sim/contact.ts');
  const nose = capsule({ x: 0, z: 0, yaw: 0, dimensions: CAR_DIMENSIONS[1] });
  const target = { x: 0, z: 3.38, yaw: 0, dimensions: CAR_DIMENSIONS[2] };
  const aligned = contactBetween(nose, capsule(target));
  assert.ok(aligned && aligned.nz > 0.99, 'longitudinal contact occurs at the bumpers');
  assert.equal(contactBetween(nose, capsule({ ...target, yaw: Math.PI / 2 })), null);
});

test('two full-size cars can accelerate side by side', async () => {
  const { Race } = await import('../src/sim/race.ts');
  const race = new Race();
  const stopped = drive(NEUTRAL)[0];
  const moving = drive({ ...NEUTRAL, gas: true })[0];
  step(race, 3, [stopped, stopped, stopped, stopped]);
  step(race, 1.2, [moving, moving, stopped, stopped]);
  const [a, b] = race.snapshot().cars;
  assert.ok(Math.abs(a.z - b.z) > 1.66);
  assert.ok(Math.abs(a.x - b.x) < 0.01 && a.speed > 4 && b.speed > 4);
});

test('GAS gives a strong launch and builds speed without a jump', async () => {
  const { Race } = await import('../src/sim/race.ts');
  const race = new Race();
  const stopped = { owned: true, input: NEUTRAL };
  const accelerating = { owned: true, input: { ...NEUTRAL, gas: true } };
  const drivers = [accelerating, stopped, stopped, stopped];
  step(race, 3, [stopped, stopped, stopped, stopped]);
  step(race, TICK, drivers);
  assert.ok(race.snapshot().cars[0].speed > 0 && race.snapshot().cars[0].speed < 0.18);
  step(race, 29 * TICK, drivers);
  assert.ok(race.snapshot().cars[0].speed > 3.4);
  step(race, 1.05, drivers);
  assert.ok(race.snapshot().cars[0].speed > 7.8);
});

test('the automatic box shifts through fifth with a short torque break', async () => {
  const { Race } = await import('../src/sim/race.ts');
  const race = new Race();
  const stopped = { owned: true, input: NEUTRAL };
  const accelerating = { owned: true, input: { ...NEUTRAL, gas: true } };
  step(race, 3, [stopped, stopped, stopped, stopped]);
  let before = race.snapshot().cars[0];
  assert.equal(before.transmission?.gear, 0);

  const gears: number[] = [];
  for (let i = 0; i < 185; i++) {
    race.step(TICK, [accelerating, stopped, stopped, stopped]);
    const car = race.snapshot().cars[0];
    const box = car.transmission;
    assert.ok(box && box.rev >= 0 && box.rev <= 1);
    if (box.gear !== before.transmission?.gear) {
      gears.push(box.gear);
      assert.equal(box.shift, (before.transmission?.shift ?? 0) + 1);
      if (box.gear > 1) {
        assert.ok(car.speed - before.speed < 0.033, 'torque falls when the box shifts up');
        assert.ok(box.rev < before.transmission!.rev, 'engine revs drop as the longer ratio engages');
      }
    }
    before = car;
    if (car.speed >= 10.89) break;
  }
  assert.deepEqual(gears, [1, 2, 3, 4, 5]);
  assert.ok(before.speed >= 10.89 && before.speed <= 10.90);
});

test('cars at the same map position only touch when their height overlaps', async () => {
  const { capsule, contactBetween } = await import('../src/sim/contact.ts');
  const { CAR_DIMENSIONS } = await import('../src/shared/car-dimensions.ts');
  const pose = { x: 3.5, z: 1.2, yaw: 0, dimensions: CAR_DIMENSIONS[0] };
  const across = { ...pose, yaw: Math.PI / 2, dimensions: CAR_DIMENSIONS[1] };
  assert.ok(contactBetween(capsule(pose, 0.2), capsule(across, 0.34)));
  assert.equal(contactBetween(capsule(pose, 0.2), capsule(across, 3.4)), null);
});

test('fourth holds while coasting through the overlap and fresh GAS kicks down', async () => {
  const { Race } = await import('../src/sim/race.ts');
  const race = new Race();
  const stopped = { owned: true, input: NEUTRAL };
  const accelerating = { owned: true, input: { ...NEUTRAL, gas: true } };
  const gas = [accelerating, stopped, stopped, stopped];
  const coast = [stopped, stopped, stopped, stopped];
  step(race, 3, coast);
  runUntil(race, 2, gas, () => {
    const car = race.snapshot().cars[0];
    return car.transmission?.gear === 4 && car.speed >= 6.7;
  });
  const top = race.snapshot().cars[0].transmission;
  runUntil(race, 0.7, coast, () => race.snapshot().cars[0].speed < 6.12);
  const coasting = race.snapshot().cars[0];
  assert.equal(coasting.transmission?.gear, 4);
  assert.equal(coasting.transmission?.shift, top?.shift);

  race.step(TICK, gas);
  const lower = race.snapshot().cars[0].transmission;
  assert.equal(lower?.gear, 3);
  assert.equal(lower?.shift, top!.shift + 1);
  assert.ok(lower!.rev > coasting.transmission!.rev + 0.08);
  step(race, 0.10, gas);
  assert.equal(race.snapshot().cars[0].transmission?.gear, 3);
  runUntil(race, 0.75, gas, () => race.snapshot().cars[0].transmission?.gear === 4);
  runUntil(race, 1.15, coast, () => race.snapshot().cars[0].speed < 5.42);
  assert.equal(race.snapshot().cars[0].transmission?.gear, 3, 'further slowing triggers a normal downshift');
});

test('fifth coasts through its overlap and downshifts on a fresh request for power', async () => {
  const { Race } = await import('../src/sim/race.ts');
  const { defaultRaceConfig } = await import('../src/shared/protocol.ts');
  const race = new Race({ manual: true });
  race.configure({ ...defaultRaceConfig, bots: 0 });
  race.launch();
  const gas = drive({ ...NEUTRAL, gas: true });
  const coast = drive(NEUTRAL);
  step(race, 3, coast);
  runUntil(race, 2.1, gas, () => race.snapshot().cars[0].speed >= 9.24);
  const fifth = race.snapshot().cars[0].transmission!;
  assert.equal(fifth.gear, 5);
  runUntil(race, 0.6, coast, () => race.snapshot().cars[0].speed < 8.56);
  const coasting = race.snapshot().cars[0].transmission!;
  assert.equal(coasting.gear, 5);
  assert.equal(coasting.shift, fifth.shift);

  race.step(TICK, gas);
  const fourth = race.snapshot().cars[0].transmission!;
  assert.equal(fourth.gear, 4);
  assert.equal(fourth.shift, fifth.shift + 1);
  assert.ok(fourth.rev > coasting.rev + 0.08);
  step(race, 0.12, gas);
  assert.equal(race.snapshot().cars[0].transmission?.gear, 4);
  runUntil(race, 0.65, gas, () => race.snapshot().cars[0].transmission?.gear === 5);
  runUntil(race, 0.85, coast, () => race.snapshot().cars[0].speed < 7.90);
  assert.equal(race.snapshot().cars[0].transmission?.gear, 4);
});

test('a sharp steering input at full pace scrubs speed and turns progressively', async () => {
  const { Race } = await import('../src/sim/race.ts');
  const race = new Race();
  const stopped = { owned: true, input: NEUTRAL };
  const accelerating = { owned: true, input: { ...NEUTRAL, gas: true } };
  step(race, 3, [stopped, stopped, stopped, stopped]);
  step(race, 1.8, [accelerating, stopped, stopped, stopped]);
  const before = race.snapshot().cars[0];
  step(race, 0.20, [{ owned: true, input: { ...accelerating.input, x: 1 } }, stopped, stopped, stopped]);
  const after = race.snapshot().cars[0];
  assert.ok(after.z > before.z);
  assert.ok(before.yaw - after.yaw > 0.18 && before.yaw - after.yaw < 0.37);
  assert.ok(after.speed < before.speed - 0.25 && after.speed > 6);
  assert.ok((after.sound?.slip ?? 0) > (before.sound?.slip ?? 0) + 0.1);
});

test('the grass run-off slows a car even when it has not struck the wall', async () => {
  const { TRACK } = await import('../src/shared/track.ts');
  const { Race } = await import('../src/sim/race.ts');
  const race = new Race();
  // Reach fifth on the straight before moving onto the grass strip.
  step(race, 4.95, drive({ ...NEUTRAL, gas: true }));
  const initial = race.snapshot().cars[0];
  assert.equal(initial.sound?.throttle, 1);
  assert.equal(initial.sound?.curb, 0);
  assert.equal(initial.sound?.runoff, 0);
  let crossedCurb = false;

  for (let i = 0; i < 78; i++) {
    const car = race.snapshot().cars[0];
    crossedCurb ||= (car.sound?.curb ?? 0) > 0.2 && (car.sound?.grass ?? 0) < 0.1;
    const location = TRACK.locate(car.x, car.z);
    assert.ok(Math.abs(location.offset) < 2.65, 'the tires must stay clear of the barrier');
    const look = TRACK.sampleAt(location.s + 3.8);
    const desiredYaw = Math.atan2(look.x - look.dz * 2.47 - car.x, look.z + look.dx * 2.47 - car.z);
    const x = Math.max(-1, Math.min(1, 3.2 * (car.yaw - desiredYaw)));
    race.step(TICK, drive({ x, gas: true, brake: false }));
  }

  const car = race.snapshot().cars[0];
  const location = TRACK.locate(car.x, car.z);
  assert.ok(location.offset > 2.36 && location.offset < 2.65);
  assert.ok(car.speed > 2 && car.speed < initial.speed - 0.9);
  assert.ok(crossedCurb, 'the tire crossed the piano before reaching run-off');
  assert.ok((car.sound?.grass ?? 0) > 0.4);
  assert.equal(car.sound?.gravel, 0);
});

test('FRENO overrides GAS and reverse needs a fresh press after stopping', async () => {
  const { Race } = await import('../src/sim/race.ts');
  const { defaultRaceConfig } = await import('../src/shared/protocol.ts');
  const race = new Race({ manual: true });
  race.configure({ ...defaultRaceConfig, bots: 0 });
  race.launch();
  const gas = drive({ ...NEUTRAL, gas: true });
  const both = drive({ ...NEUTRAL, gas: true, brake: true });
  step(race, 3.75, gas);
  const initialSpeed = race.snapshot().cars[0].speed;
  assert.ok(initialSpeed > 1);
  step(race, 0.15, both);
  assert.ok(race.snapshot().cars[0].speed < initialSpeed - 0.5);
  step(race, 1.5, both);
  assert.equal(race.snapshot().cars[0].speed, 0);
  assert.equal(race.snapshot().cars[0].transmission?.gear, 1);
  step(race, 0.05, drive(NEUTRAL));
  assert.equal(race.snapshot().cars[0].transmission?.gear, 0);
  step(race, 0.45, both);
  assert.ok(race.snapshot().cars[0].speed < -0.5);
  assert.equal(race.snapshot().cars[0].transmission?.gear, -1);
  step(race, 0.05, drive(NEUTRAL));
  assert.equal(race.snapshot().cars[0].speed, 0);
  assert.equal(race.snapshot().cars[0].transmission?.gear, 0);
});

test('a mid-race join takes the moving bot in place', async () => {
  const { Race } = await import('../src/sim/race.ts');
  const race = new Race();
  const human = drive(NEUTRAL);
  step(race, 8, human);
  const before = race.snapshot().cars[1];
  assert.ok(before.speed > 2);
  race.step(TICK, [...human, ...drive(NEUTRAL)]);
  const after = race.snapshot().cars[1];
  assert.equal(after.owned, true);
  assert.equal(after.lap, before.lap);
  assert.ok(Math.hypot(after.x - before.x, after.z - before.z) < 0.16);
  assert.ok(after.speed < before.speed);
});

test('a car driven into the wall can keep moving without a reset or a free lap', async () => {
  const { TRACK, wallHalfAt } = await import('../src/shared/track.ts');
  const { CAR_DIMENSIONS } = await import('../src/shared/car-dimensions.ts');
  const { capsule } = await import('../src/sim/contact.ts');
  const { Race } = await import('../src/sim/race.ts');
  const race = new Race();
  const gas = drive({ ...NEUTRAL, gas: true });
  runUntil(race, 11, gas, () => {
    const car = race.snapshot().cars[0];
    const { ax, az, bx, bz, radius } = capsule({ ...car, dimensions: CAR_DIMENSIONS[0] });
    for (const [x, z] of [[ax, az], [bx, bz]]) {
      const edge = TRACK.locate(x, z, { s: car.distance, y: car.y });
      assert.ok(Math.abs(edge.offset) + radius <= wallHalfAt(edge.s, Math.sign(edge.offset)) + 0.02,
        'the front and rear must stay inside the barrier');
    }
    return race.snapshot().phase === 'race' && Math.abs(car.yaw - Math.PI / 2) > 0.08;
  });
  const contact = race.snapshot();
  const impact = contact.cars[0];
  const strike = contact.impacts?.find(event => event.kind !== 'car' && event.frame >= contact.frame - 3);
  assert.ok(strike && strike.distance !== undefined && strike.side !== undefined);
  const trackPoint = TRACK.sampleAt(strike.distance);
  const offset = wallHalfAt(strike.distance, strike.side) * strike.side;
  assert.ok(Math.hypot(strike.x - trackPoint.x + trackPoint.dz * offset,
    strike.z - trackPoint.z - trackPoint.dx * offset) < 0.02);
  assert.ok((impact.sound?.scrape ?? 0) > 0);
  step(race, 0.85, gas);
  const after = race.snapshot().cars[0];
  assert.ok(Math.hypot(after.x - impact.x, after.z - impact.z) > 1, 'the car should roll away from impact');
  assert.ok(after.speed > 1);
  assert.equal(after.blink, false);
  assert.equal(after.lap, 0);
});

test('a rear-end impact rolls the stopped car forward and leaves room for both cars', async () => {
  const { Race } = await import('../src/sim/race.ts');
  const race = new Race();
  const stopped = { owned: true, input: NEUTRAL };
  const chasing = { owned: true, input: { ...NEUTRAL, gas: true } };
  step(race, 3, [stopped, stopped, chasing, stopped]);
  const initial = race.snapshot().cars[0].x;
  step(race, 0.75, [stopped, stopped, chasing, stopped]);
  const [ahead, , behind] = race.snapshot().cars;
  assert.ok(ahead.speed > 0.55, 'impact should transfer momentum to the stopped car');
  assert.ok(ahead.x > initial + 0.12);
  assert.ok(ahead.x - behind.x >= 3.24, 'the visual bumpers must stay separated');
});

test('a bumper strike survives snapshot gaps without retriggering while the cars touch', async () => {
  const { Race } = await import('../src/sim/race.ts');
  const race = new Race();
  const stopped = { owned: true, input: NEUTRAL };
  const accelerating = { owned: true, input: { ...NEUTRAL, gas: true } };
  const drivers = [stopped, stopped, accelerating, stopped];
  step(race, 3, [stopped, stopped, stopped, stopped]);
  runUntil(race, 1.2, drivers, () => Boolean(race.snapshot().impacts?.length));
  const hit = race.snapshot();
  const strike = hit.impacts?.[0];
  assert.ok(strike);
  assert.equal(strike.kind, 'car');
  assert.equal(strike.frame, hit.frame);
  assert.ok(strike.strength > 0 && strike.strength <= 1);
  assert.ok(strike.x > hit.cars[2].x && strike.x < hit.cars[0].x);

  step(race, 3 * TICK, drivers);
  assert.deepEqual(race.snapshot().impacts, [strike]);
  step(race, 0.22, drivers);
  assert.deepEqual(race.snapshot().impacts, [strike]);
  step(race, 0.43, [stopped, stopped, stopped, stopped]);
  assert.equal(race.snapshot().impacts?.some(event => event.id === strike.id) ?? false, false);
});
