import assert from 'node:assert/strict';
import { test } from 'node:test';
import { raceClassification, raceTime } from '../src/display/results.ts';
import type { RaceSnapshot } from '../src/shared/protocol.ts';

const state: RaceSnapshot = {
  frame: 600, heat: 1, phase: 'results', lights: 0, flag: true, order: [2, 0, 3],
  cars: Array.from({ length: 4 }, (_, slot) => ({ x: 0, y: 0, z: 0, yaw: 0, speed: 0,
    lap: 1, owned: slot === 0, active: slot !== 1, blink: false, braking: false, steer: 0 })),
};

test('the podium follows official finish order and excludes unfinished or inactive entrants', () => {
  const results = raceClassification({ ...state, results: [
    { slot: 2, time: 65.125, bestLap: 65.125 },
    { slot: 0, time: 66.5, bestLap: 66.5 },
    { slot: 3, time: null, bestLap: null },
  ] });
  assert.deepEqual(results.map(result => [result.slot, result.place, result.time, result.gap]),
    [[2, 1, '1:05.125', '—'], [0, 2, '1:06.500', '+1.375 s'], [3, null, 'No terminó', '—']]);
  assert.deepEqual(results.filter(result => result.place !== null).map(result => result.slot), [2, 0]);
});

test('missing timing data never invents a winner or fills absent podium places', () => {
  const results = raceClassification(state);
  assert.deepEqual(results.map(result => result.slot), [2, 0, 3]);
  assert.ok(results.every(result => result.place === null && result.gap === '—'));
  assert.deepEqual(raceClassification({ ...state, results: [] }), []);
});

test('time formatting carries milliseconds across a minute and rejects non-finite data', () => {
  assert.equal(raceTime(59.9996), '1:00.000');
  assert.equal(raceTime(null), '—');
  assert.equal(raceTime(Infinity), '—');
});
