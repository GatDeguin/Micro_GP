import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advanceLiveryProgress, bestSectorsFor, createLiveryProgress, normalizeLiveryProgress, unlockedLiveries } from '../src/shared/liveries.ts';
import { normalizeRaceConfig, type CarView } from '../src/shared/protocol.ts';

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

test('each circuit has independent sector comparisons while unlocked liveries carry over', () => {
  const old = normalizeLiveryProgress({ clean: true, sector: false, bestSectors: [9.8, NaN, 0, 12] });
  assert.deepEqual(bestSectorsFor(old, 'taller'), [9.8, null, null, 12]);
  assert.ok(bestSectorsFor(old, 'dique').every(time => time === null));
  const firstDique = advanceLiveryProgress(old, { ...car, sectorTimes: [7.1] }, 'dique');
  assert.deepEqual(unlockedLiveries(firstDique), ['original', 'clean']);
  assert.equal(bestSectorsFor(firstDique, 'taller')[0], 9.8);
  assert.equal(bestSectorsFor(firstDique, 'dique')[0], 7.1);
  const improved = advanceLiveryProgress(firstDique, { ...car, sectorTimes: [7] }, 'dique');
  assert.deepEqual(unlockedLiveries(improved), ['original', 'clean', 'sector']);
  assert.deepEqual(normalizeLiveryProgress(JSON.parse(JSON.stringify(improved))), improved);
});

test('configuration without a circuit keeps Taller and unfinished Dique setup defaults to one lap', () => {
  const old = normalizeRaceConfig({ laps: 6 });
  assert.equal(old.course, 'taller');
  assert.equal(old.laps, 6);
  assert.equal(normalizeRaceConfig({ course: 'dique' }).laps, 1);
  assert.equal(normalizeRaceConfig({ course: 'dique', laps: 2 }).laps, 2);
  assert.equal(normalizeRaceConfig({ course: 'missing' }).course, 'taller');
});

test('the second Dique detour has its own timings and preserves both sets of previous records', () => {
  const archived = [25, 18, 27, 14];
  const port = [29, 21, 25, 14];
  const prior = normalizeLiveryProgress({ clean: true, sector: false, diqueBestSectors: archived, diqueDetourBestSectors: port });
  assert.deepEqual(bestSectorsFor(prior, 'dique'), [null, null, null, null]);
  const next = advanceLiveryProgress(prior, { ...car, sectorTimes: [33, 19, 26, 15] }, 'dique');
  assert.deepEqual(next.diqueBestSectors, archived);
  assert.deepEqual(next.diqueDetourBestSectors, port);
  assert.deepEqual(bestSectorsFor(next, 'dique'), [33, 19, 26, 15]);
  assert.deepEqual(unlockedLiveries(next), ['original', 'clean']);
});
