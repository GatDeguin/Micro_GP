import assert from 'node:assert/strict';
import test from 'node:test';
import type { CarView, RaceSnapshot } from '../src/shared/protocol.ts';
import { crowdCue, marshalSignal, nearestCar, pitGateOpen } from '../src/display/world-cues.ts';

const finish = { x: 0, y: 0, z: 0 };

function car(x: number, lap = 1, y = 0): CarView {
  return { x, y, z: 0, lap, yaw: 0, speed: 7, owned: false, blink: false, braking: false, steer: 0 };
}

function snapshot(frame: number, order: number[], cars: CarView[]): RaceSnapshot {
  return { frame, heat: 1, phase: 'race', order, cars, flag: false, lights: 0 };
}

test('finish crowds react to nearby passes and the first finish flag', () => {
  const before = snapshot(30, [0, 1], [car(0), car(-1)]);
  const pass = snapshot(33, [1, 0], [car(0), car(1)]);
  assert.equal(crowdCue(before, pass, finish), 'pass');
  assert.equal(crowdCue(before, { ...pass, cars: [car(13), car(14)] }, finish), null);
  assert.equal(crowdCue(before, { ...pass, cars: [car(0), car(1, 2)] }, finish), null);
  assert.equal(crowdCue(before, { ...pass, heat: 2 }, finish), null);
  assert.equal(crowdCue(pass, { ...pass, frame: 36, flag: true }, finish), 'finish');
  assert.equal(crowdCue({ ...pass, flag: true }, { ...pass, frame: 36, flag: true }, finish), null);
});

test('pit cameras ignore cars on other decks and cars absent from the grid', () => {
  const overhead = car(0, 1, 3.1);
  const omitted = { ...car(0.2), active: false };
  const driver = car(1.4);
  assert.equal(nearestCar([overhead, omitted, driver], finish, 3), driver);
  assert.equal(nearestCar([overhead, omitted, driver], finish, 1), undefined);
});

test('marshals signal grid, local caution and finish', () => {
  const state = snapshot(90, [0], [car(0)]);
  assert.equal(marshalSignal({ ...state, phase: 'grid' }, 120), 'red');
  assert.equal(marshalSignal(state, 120), 'yellow');
  assert.equal(marshalSignal(state, 90), 'green');
  assert.equal(marshalSignal({ ...state, flag: true }, 120), 'checkered');
  assert.equal(marshalSignal({ ...state, phase: 'demo' }, 120), 'idle');
});

test('service gates respond only to nearby pit-speed traffic in a live session', () => {
  const approach = { ...finish, z: -4.48 };
  const slow = { ...car(2.1), z: -4.45, speed: 4.3 };
  const state = snapshot(90, [0], [slow]);
  assert.equal(pitGateOpen(state, approach, false), true);
  assert.equal(pitGateOpen({ ...state, phase: 'grid' }, approach, true), false);
  assert.equal(pitGateOpen({ ...state, cars: [{ ...slow, z: 0 }] }, approach, false), false);
  assert.equal(pitGateOpen({ ...state, cars: [{ ...slow, speed: 10 }] }, approach, false), false);
  const leaving = { ...state, cars: [{ ...slow, x: 3.1 }] };
  assert.equal(pitGateOpen(leaving, approach, false), false);
  assert.equal(pitGateOpen(leaving, approach, true), true);
});
