import assert from 'node:assert/strict';
import test from 'node:test';
import { Race } from '../src/sim/race.ts';
import { botDrive } from '../src/sim/bot.ts';
import { SPACEPORT } from '../src/shared/courses.ts';
import { defaultRaceConfig } from '../src/shared/protocol.ts';

for (const [difficulty, maxLap] of [['rookie', 173], ['club', 150], ['pro', 147]] as const) {
  test(`four ${difficulty} Spaceport bots finish a full three-lap heat at current engine pace`, () => {
    const race = new Race({ manual: true });
    race.configure({ ...defaultRaceConfig, course: 'spaceport', difficulty, laps: 3 }); race.launch();
    for (let f = 0; f < 60 * 540 && race.snapshot().phase !== 'results'; f++) {
      race.step(1 / 60, [{ owned: true, input: null }]);
      if (f % 12 === 0) assert.ok(race.snapshot().cars.every(car => !car.blink), 'no teleport recovery');
    }
    const state = race.snapshot();
    assert.equal(state.phase, 'results');
    assert.ok(state.results?.every(result => result.time !== null && result.bestLap! < maxLap));
    assert.deepEqual(state.cars.map(car => car.lap), [3, 3, 3, 3]);
  });
}

test('Club bots finish alongside an expert-driven Bólido over three Spaceport laps', () => {
  const race = new Race({ manual: true });
  race.configure({ ...defaultRaceConfig, course: 'spaceport', difficulty: 'club', laps: 3 }); race.launch();
  // The test driver supplies only steering/pedals; Race owns all movement,
  // transmission, collisions, checkpoints and the unchanged finish deadline.
  const internal = race as unknown as { cars: Parameters<typeof botDrive>[0] };
  for (let f = 0; f < 60 * 490 && race.snapshot().phase !== 'results'; f++) {
    const input = botDrive(internal.cars, 2, .93, 'pro', false, 1 / 60, SPACEPORT);
    race.step(1 / 60, [{ owned: false, input: null }, { owned: false, input: null }, { owned: true, input }]);
  }
  const state = race.snapshot();
  assert.equal(state.phase, 'results');
  assert.ok(state.results?.every(result => result.time !== null), JSON.stringify({ results: state.results, cars: state.cars.map(car => ({ lap: car.lap, s: car.distance })) }));
});
