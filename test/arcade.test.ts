import assert from 'node:assert/strict';
import test from 'node:test';
import { arcadeLayout } from '../src/shared/arcade.ts';
import { DIQUE, TALLER, type Course } from '../src/shared/courses.ts';
import { defaultRaceConfig, normalizeRaceConfig } from '../src/shared/protocol.ts';
import { ArcadeRules, newArcadeCar } from '../src/sim/arcade.ts';
import { Race } from '../src/sim/race.ts';

const dt = 1 / 60;

function actor(course: Course, s: number, offset: number, speed = 8) {
  const point = course.sampleAt(s);
  return {
    x: point.x - point.dz * offset, z: point.z + point.dx * offset,
    speed, road: { ...point, offset }, arcade: newArcadeCar(),
  };
}

test('arcade is optional and both layouts keep equipment inside the road and outside the tunnels', () => {
  assert.equal(normalizeRaceConfig({}).arcade, undefined);
  assert.equal(normalizeRaceConfig({ arcade: 'true' }).arcade, undefined);
  assert.equal(normalizeRaceConfig({ arcade: true }).arcade, true);
  for (const course of [TALLER, DIQUE]) {
    const { pickups, ramps } = arcadeLayout(course);
    assert.deepEqual(new Set(pickups.map(pickup => pickup.kind)), new Set(['turbo', 'shield', 'oil', 'pop']));
    for (const item of pickups) {
      assert.ok(Math.abs(item.offset) + 0.42 < course.roadHalfAt(item.s));
      assert.ok(!course.isPitLane(item.s, item.offset));
    }
    for (const ramp of ramps) {
      const start = ramp.s - ramp.length;
      assert.ok(ramp.s < course.tunnel.from - 10 || start > course.tunnel.to + 2);
      for (let s = start; s <= ramp.s; s += 0.2) {
        assert.ok(Math.abs(ramp.offset) + ramp.halfWidth < course.roadHalfAt(s));
        assert.ok(!course.isPitLane(s, ramp.offset));
      }
    }
  }
});

test('turbo crates work once per crossing and become available again after they recharge', () => {
  const rules = new ArcadeRules(TALLER);
  const layout = arcadeLayout(TALLER);
  const at = layout.pickups[0];
  const from = actor(TALLER, at.s - 0.17, at.offset);
  const driver = actor(TALLER, at.s + 0.08, at.offset);
  rules.advance(dt, 1);
  rules.stepCar(driver, 0, from.road, dt);
  assert.equal(rules.view().available[0], false);
  assert.ok(driver.arcade.turbo > 1);
  assert.ok(driver.speed > 8.9);
  assert.equal(rules.view().events[0].kind, 'turbo');
  rules.stepCar(driver, 0, from.road, dt);
  assert.equal(rules.view().events.length, 1);
  for (let frame = 2; frame <= 380; frame++) rules.advance(dt, frame);
  assert.equal(rules.view().available[0], true);
});

test('a dropped petardo arms, explodes once and a shield absorbs the effect', () => {
  const rules = new ArcadeRules(TALLER);
  const pickup = arcadeLayout(TALLER).pickups.find(pickup => pickup.kind === 'pop')!;
  const lead = actor(TALLER, pickup.s + 0.1, pickup.offset);
  rules.advance(dt, 1);
  rules.stepCar(lead, 0, actor(TALLER, pickup.s - 0.1, pickup.offset).road, dt);
  const trap = rules.view().hazards[0];
  assert.equal(trap.kind, 'pop');
  const victim = actor(TALLER, pickup.s - 1.45, pickup.offset);
  rules.stepCar(victim, 1, victim.road, dt);
  assert.equal(rules.view().hazards.length, 1);
  for (let frame = 2; frame <= 41; frame++) rules.advance(dt, frame);
  victim.arcade.shield = 5;
  rules.stepCar(victim, 1, victim.road, dt);
  assert.equal(rules.view().hazards.length, 0);
  assert.equal(victim.arcade.shield, 0);
  assert.equal(victim.speed, 8);
  assert.deepEqual(rules.view().events.map(event => event.kind).slice(-2), ['explosion', 'block']);
});

test('cars climb the ramp, jump and land with a continuous return to the road', () => {
  const rules = new ArcadeRules(DIQUE);
  const ramp = arcadeLayout(DIQUE).ramps[0];
  const body = actor(DIQUE, ramp.s - ramp.length, ramp.offset, 12);
  let peak = 0;
  let rolledAboveRoad = false;
  let previous = body.road;
  for (let frame = 1; frame <= 100; frame++) {
    const next = actor(DIQUE, ramp.s - ramp.length + frame * 12 * dt, ramp.offset, 12);
    body.x = next.x; body.z = next.z; body.road = next.road;
    rules.advance(dt, frame);
    rules.stepCar(body, 0, previous, dt);
    if (next.road.s < ramp.s && body.arcade.jump > 0) rolledAboveRoad = true;
    peak = Math.max(peak, body.arcade.jump);
    previous = body.road;
    if (rules.view().events.some(event => event.kind === 'land')) break;
  }
  assert.ok(rolledAboveRoad && peak > ramp.height + 0.25);
  assert.equal(body.arcade.jump, 0);
  assert.ok(rules.view().events.some(event => event.kind === 'land'));
});

test('oil makes a grounded car skid and leaves an airborne car and the trap alone', () => {
  const rules = new ArcadeRules(DIQUE);
  const pickup = arcadeLayout(DIQUE).pickups.find(pickup => pickup.kind === 'oil')!;
  const lead = actor(DIQUE, pickup.s + 0.1, pickup.offset);
  rules.advance(dt, 1);
  rules.stepCar(lead, 0, actor(DIQUE, pickup.s - 0.1, pickup.offset).road, dt);
  for (let frame = 2; frame <= 38; frame++) rules.advance(dt, frame);
  const victim = actor(DIQUE, pickup.s - 1.55, pickup.offset);
  victim.arcade.jump = 0.65;
  victim.arcade.airborne = true;
  rules.stepCar(victim, 1, victim.road, dt);
  assert.equal(victim.speed, 8);
  victim.arcade.jump = 0;
  victim.arcade.airborne = false;
  rules.stepCar(victim, 1, victim.road, dt);
  assert.ok(victim.arcade.skid > 0.8 && victim.speed < 7);
  assert.equal(rules.view().hazards.length, 1);
  assert.equal(rules.view().events.at(-1)?.kind, 'slip');
});

test('Arcade heats run with four bots and keep classic snapshots free of item state', () => {
  for (const course of [TALLER, DIQUE]) {
    const race = new Race({ manual: true });
    assert.equal(race.snapshot().arcade, undefined);
    assert.ok(race.configure({ ...defaultRaceConfig, course: course.id, arcade: true, laps: 1 }));
    assert.ok(race.launch());
    const drivers = [{ owned: true, input: null }];
    const pickupKinds = new Set<string>();
    let peak = 0;
    let snapshot = race.snapshot();
    for (let frame = 0; frame < 60 * 165 && snapshot.phase !== 'results'; frame++) {
      race.step(dt, drivers);
      snapshot = race.snapshot();
      for (const event of snapshot.arcade?.events ?? []) pickupKinds.add(event.kind);
      for (const car of snapshot.cars) peak = Math.max(peak, car.arcade?.jump ?? 0);
    }
    assert.equal(snapshot.phase, 'results');
    assert.deepEqual(snapshot.cars.map(car => car.lap), [1, 1, 1, 1]);
    assert.ok(pickupKinds.has('turbo'));
    assert.ok(peak > 0.30);
    race.returnToDemo();
    assert.equal(race.snapshot().arcade, undefined);
  }
});
