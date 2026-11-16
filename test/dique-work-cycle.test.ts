import assert from 'node:assert/strict';
import test from 'node:test';
import { createDiqueWorkCycle, sampleDiqueWork } from '../src/display/dique-work-cycle.ts';

test('work tools engage before a machine or weld arc operates and release after it stops', () => {
  const state = createDiqueWorkCycle();
  for (const phase of [1.1, 4.6, 7.3, 10.2]) for (let time = -2; time <= 90; time += .017) {
    assert.equal(sampleDiqueWork(time, phase, state), state);
    for (const value of Object.values(state)) assert.ok(Number.isFinite(value));
    assert.ok(state.engage >= 0 && state.engage <= 1);
    assert.ok(state.working >= 0 && state.working <= 1);
    if (state.working > 0) assert.equal(state.engage, 1, 'tools must be seated during operation');
    if (state.working === 0) assert.equal(state.arc, 0, 'idle torch cannot emit');
  }
});

test('work gestures and wheel orientation wrap continuously for repeated cycles', () => {
  const a = sampleDiqueWork(14 - .00001, 0), b = sampleDiqueWork(14 + .00001, 0);
  for (const name of ['engage', 'working', 'stroke', 'arc', 'wheelGrip'] as const) assert.ok(Math.abs(a[name] - b[name]) < .0001);
  assert.ok(Math.abs(Math.sin(a.spin) - Math.sin(b.spin)) < .0001);
  assert.ok(Math.abs(Math.cos(a.spin) - Math.cos(b.spin)) < .0001);
});

test('the wheel operator adjusts the stationary collar, withdraws before spinning and checks it after stopping', () => {
  assert.equal(sampleDiqueWork(2.3, 0).wheelGrip, 1);
  for (let time = 2.9; time <= 10.1; time += .025) {
    assert.equal(sampleDiqueWork(time, 0).wheelGrip, 0, 'hands and impact gun must stay off the spinning collar');
  }
  assert.equal(sampleDiqueWork(10.7, 0).wheelGrip, 1);
  assert.equal(sampleDiqueWork(13, 0).wheelGrip, 0);
});
