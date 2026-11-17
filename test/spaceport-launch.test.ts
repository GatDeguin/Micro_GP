import assert from 'node:assert/strict';
import test from 'node:test';
import { SPACEPORT } from '../src/shared/courses.ts';
import type { CarView, RaceSnapshot } from '../src/shared/protocol.ts';
import { createLaunchSequence, LAUNCH_SITE } from '../src/display/spaceport-launch-state.ts';

const car = (x: number, z: number, owned = true, y = 0): CarView => ({ x, y, z, owned, active: true,
  yaw: 0, speed: 20, lap: 1, blink: false, braking: false, steer: 0 });
const snapshot = (cars: CarView[], phase: RaceSnapshot['phase'] = 'race', heat = 1): RaceSnapshot =>
  ({ cars, phase, heat, frame: 0, lights: 0, flag: false, order: [0] });
function advance(sequence: ReturnType<typeof createLaunchSequence>, from: number, to: number) {
  for (let now = from; now <= to; now += 1000 / 60) sequence.update(now);
}

test('the real driving approach builds preflight even at high speed, and fades after leaving', () => {
  const sequence = createLaunchSequence(); let peak = 0, first = Infinity;
  for (let i = 0; i < 600; i++) {
    const s = 370 + i * 65 / 60, p = SPACEPORT.sampleAt(s);
    sequence.observe(snapshot([car(p.x, p.z, true, p.y)]));
    const state = sequence.update(i * 1000 / 60);
    if (state.warning > .1) first = Math.min(first, s);
    peak = Math.max(peak, state.ignition);
    assert.ok(state.charge >= 0 && state.charge <= 1);
  }
  assert.ok(first < 480, 'visible warning must precede the closest pass');
  assert.ok(peak > .80, `ignition preview must be legible at speed: ${peak}`);
  sequence.observe(snapshot([car(0, 0)])); advance(sequence, 10_000, 28_000);
  assert.ok(sequence.state.charge < .001, 'preflight resets after leaving the area');
});

test('multiplayer proximity follows humans, ignores inactive cars, and supports an AI-only demo', () => {
  const sequence = createLaunchSequence();
  sequence.observe(snapshot([car(0, 0), car(LAUNCH_SITE.x, LAUNCH_SITE.z, false)]));
  advance(sequence, 0, 3000); assert.equal(sequence.state.charge, 0);
  sequence.observe(snapshot([car(0, 0), car(30, -184)]));
  advance(sequence, 3100, 6000); assert.ok(sequence.state.ignition > .95);
  sequence.observe(snapshot([{ ...car(26, -184), active: false }, car(0, 0)]));
  advance(sequence, 6100, 24_000); assert.ok(sequence.state.charge < .001);
  sequence.observe(snapshot([car(26, -184, false)], 'demo'));
  advance(sequence, 24_100, 27_000); assert.ok(sequence.state.ignition > .95);
});

test('results, new heats, invalid data and resumed tabs do not leave stuck launch effects', () => {
  const sequence = createLaunchSequence();
  sequence.observe(snapshot([car(26, -184)])); advance(sequence, 0, 3000);
  sequence.observe(snapshot([car(26, -184)], 'results')); advance(sequence, 3100, 22_000);
  assert.ok(sequence.state.charge < .001);
  sequence.observe(snapshot([car(26, -184)], 'race', 2)); assert.equal(sequence.state.charge, 0);
  sequence.observe(snapshot([car(NaN, -184), car(0, 0)]));
  sequence.update(Infinity); sequence.update(1_000_000); sequence.update(-1);
  assert.ok(Number.isFinite(sequence.state.charge)); assert.equal(sequence.state.charge, 0);
});
