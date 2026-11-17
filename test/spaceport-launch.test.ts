import assert from 'node:assert/strict';
import test from 'node:test';
import { SPACEPORT } from '../src/shared/courses.ts';
import type { CarView, RaceSnapshot } from '../src/shared/protocol.ts';
import { createLaunchSequence, LAUNCH_SITE } from '../src/display/spaceport-launch-state.ts';

const car = (x: number, z: number, owned = true, y = 0, lap = 1): CarView => ({ x, y, z, owned, active: true,
  yaw: 0, speed: 65, lap, blink: false, braking: false, steer: 0 });
const snapshot = (cars: CarView[], phase: RaceSnapshot['phase'] = 'race', heat = 1): RaceSnapshot =>
  ({ cars, phase, heat, frame: 0, lights: 0, flag: false, order: [0] });
function advance(sequence: ReturnType<typeof createLaunchSequence>, from: number, to: number) {
  for (let now = from; now <= to; now += 1000 / 60) sequence.update(now);
}

test('real high-speed laps launch once despite the route crossing the proximity zone repeatedly', () => {
  const sequence = createLaunchSequence(); let peak = 0, first = Infinity, airborne = Infinity;
  for (let i = 0; i < 60 * 65; i++) {
    const s = 370 + i * 65 / 60, p = SPACEPORT.sampleAt(s);
    sequence.observe(snapshot([car(p.x, p.z, true, p.y, Math.floor(s / SPACEPORT.length) + 1)]));
    const state = sequence.update(i * 1000 / 60);
    if (state.warning > .1) first = Math.min(first, s);
    if (state.altitude > 1) airborne = Math.min(airborne, s);
    peak = Math.max(peak, state.altitude);
    assert.ok(state.charge >= 0 && state.charge <= 1);
  }
  assert.ok(first < 480, 'warning precedes the closest pass');
  assert.ok(airborne < 560, 'liftoff is visible during the fast approach');
  assert.ok(peak > 400); assert.equal(sequence.state.serial, 3);
});

test('parked cars cannot retrigger; the ready rocket launches again on the next lap', () => {
  const sequence = createLaunchSequence();
  for (let frame = 0; frame < 1800; frame++) {
    sequence.observe(snapshot([car(84, -200)])); sequence.update(frame * 1000 / 60);
  }
  assert.equal(sequence.state.serial, 1); assert.equal(sequence.state.phase, 'ready');
  assert.equal(sequence.state.altitude, 0); assert.equal(sequence.state.opacity, 1);
  assert.equal(sequence.state.ignition, 0); assert.equal(sequence.state.smoke, 0);
  sequence.observe(snapshot([car(84, -200, true, 0, 2)])); advance(sequence, 30000, 32000);
  assert.equal(sequence.state.serial, 2); assert.ok(sequence.state.altitude > 5);
});

test('humans take priority; inactive cars cannot launch; passing multiplayer cars share a cycle', () => {
  const sequence = createLaunchSequence();
  sequence.observe(snapshot([car(0, 0), car(LAUNCH_SITE.x, LAUNCH_SITE.z, false)]));
  advance(sequence, 0, 3000); assert.equal(sequence.state.serial, 0);
  sequence.observe(snapshot([car(0, 0), car(30, -184)])); advance(sequence, 3100, 6000);
  assert.equal(sequence.state.serial, 1); assert.ok(sequence.state.altitude > 15);
  sequence.observe(snapshot([car(30, -184), car(0, 0)])); advance(sequence, 6100, 22000);
  sequence.observe(snapshot([car(30, -184), car(30, -184)])); advance(sequence, 22100, 24000);
  assert.equal(sequence.state.serial, 1); assert.equal(sequence.state.phase, 'ready');
  sequence.observe(snapshot([{ ...car(26, -184), active: false }, car(0, 0)], 'race', 2));
  advance(sequence, 24100, 26000); assert.equal(sequence.state.phase, 'ready');
  sequence.observe(snapshot([car(26, -184, false)], 'demo'));
  advance(sequence, 26100, 29000); assert.equal(sequence.state.phase, 'ascent');
});

test('results, new heats, invalid data and clock discontinuities leave no stuck launch effects', () => {
  const sequence = createLaunchSequence();
  sequence.observe(snapshot([car(26, -184)])); advance(sequence, 0, 3000);
  sequence.observe(snapshot([car(26, -184)], 'results')); sequence.update(3010);
  assert.equal(sequence.state.ignition, 0); assert.equal(sequence.state.altitude, 0);
  sequence.observe(snapshot([car(NaN, -184), car(0, 0)], 'race', 2));
  sequence.update(Infinity); sequence.update(1_000_000); sequence.update(-1);
  assert.equal(sequence.state.phase, 'ready'); assert.equal(sequence.state.charge, 0);
  sequence.observe(snapshot([car(26, -184)], 'race', 3)); advance(sequence, 0, 2000);
  const altitude = sequence.state.altitude; sequence.update(2_000_000);
  assert.ok(sequence.state.altitude - altitude < 3, 'a resumed tab cannot skip the visible launch');
});
