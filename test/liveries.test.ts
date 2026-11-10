import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advanceLiveryProgress, createLiveryProgress, unlockedLiveries } from '../src/shared/liveries.ts';
import type { CarView } from '../src/shared/protocol.ts';

const car: CarView = {
  x: 0, y: 0, z: 0, yaw: 0, speed: 0, lap: 1, owned: true, blink: false, braking: false, steer: 0,
};

test('liveries unlock from a clean lap and a meaningful improvement over a measured sector', () => {
  const first = advanceLiveryProgress(createLiveryProgress(), { ...car, sectorTimes: [10, null, null, 12] });
  assert.deepEqual(unlockedLiveries(first), ['original']);
  const second = advanceLiveryProgress(first, { ...car, cleanLap: true, sectorTimes: [9.99, null, null, 12] });
  assert.deepEqual(unlockedLiveries(second), ['original', 'clean']);
  const third = advanceLiveryProgress(second, { ...car, sectorTimes: [10, null, null, 11.9] });
  assert.deepEqual(unlockedLiveries(third), ['original', 'clean', 'sector']);
  assert.equal(advanceLiveryProgress(third, { ...car, sectorTimes: [10, NaN, 0, 12] }), third);
});
