import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ReplayHistory, replayCompanion } from '../src/display/replay.ts';
import { type CarView, type RaceSnapshot } from '../src/shared/protocol.ts';

const car: CarView = {
  x: 0, y: 0, z: 0, yaw: 0, speed: 10, lap: 2, owned: false, blink: false, braking: false, steer: 0,
};
const snapshot = (frame: number, extra: Partial<RaceSnapshot> = {}): RaceSnapshot => ({
  frame, heat: 1, phase: 'race', lights: 0, flag: false, order: [0, 1],
  cars: [{ ...car, x: frame / 10 }, { ...car, x: frame / 10 + 1 }],
  ...extra,
});

test('plays the winning pass once, during results, including the end of the finish', () => {
  const replay = new ReplayHistory();
  for (let frame = 3; frame <= 144; frame += 3) {
    replay.add(snapshot(frame, { flag: frame >= 120, order: [1, 0] }), frame / 0.06);
  }
  assert.equal(replay.sample(2410), null);
  replay.add(snapshot(147, { phase: 'results', flag: true }), 2450);
  assert.equal(replay.sample(3050), null);
  const beginning = replay.sample(3300)!;
  assert.equal(beginning.slot, 1);
  assert.equal(beginning.from.frame, 15);
  assert.equal(beginning.to.frame, 18);
  assert.ok(replay.sample(5750)!.to.frame >= 135);
  assert.equal(replay.sample(6400), null);
});

test('a close overtake is eligible and a new heat cancels the replay', () => {
  const replay = new ReplayHistory();
  for (let frame = 3; frame <= 123; frame += 3) {
    replay.add(snapshot(frame, { order: frame < 99 ? [0, 1] : [1, 0] }), frame / 0.06);
  }
  replay.add(snapshot(126, { phase: 'results' }), 2100);
  assert.equal(replay.sample(2950)?.slot, 1);
  replay.add(snapshot(129, { heat: 2, phase: 'grid' }), 2970);
  assert.equal(replay.sample(3000), null);
});

test('a finish first seen in the results packet still replays the approach', () => {
  const replay = new ReplayHistory();
  replay.add(snapshot(3), 50);
  for (let frame = 6; frame <= 117; frame += 3) replay.add(snapshot(frame), frame / 0.06);
  replay.add(snapshot(120, { phase: 'results', flag: true, order: [1, 0] }), 2000);
  assert.equal(replay.sample(2900)?.slot, 1);
});

test('the replay frames a nearby trailing rival instead of a closer car ahead', () => {
  const cars = [car, { ...car, z: 1 }, { ...car, x: 1.4, z: -4 }, { ...car, z: -9 }];
  assert.equal(replayCompanion(cars, 0), 2);
  assert.equal(replayCompanion(cars.slice(0, 2), 0), -1);
});

test('the requested recap plays an overtake, a return to the track and a close finish', () => {
  const replay = new ReplayHistory(false);
  const sound = { throttle: 0.6, curb: 0, runoff: 0, slip: 0, scrape: 0 };
  for (let frame = 3; frame <= 390; frame += 3) {
    const state = snapshot(frame, { order: frame < 120 ? [0, 1] : [1, 0], flag: frame >= 360 });
    state.cars[0].sound = { ...sound, runoff: frame === 237 ? 0.8 : 0 };
    replay.add(state, frame / 0.06);
  }
  replay.add(snapshot(393, { phase: 'results', flag: true }), 6550);
  assert.equal(replay.sample(6550), null);
  assert.equal(replay.count, 3);
  assert.equal(replay.startSummary(7000), true);
  assert.equal(replay.sample(7000)?.kind, 'overtake');
  assert.equal(replay.sample(7000)?.rival, 0);
  assert.equal(replay.sample(10000)?.kind, 'recovery');
  assert.equal(replay.sample(12700)?.kind, 'finish');
  assert.equal(replay.sample(12700)?.rival, 0);
  replay.stop();
  assert.equal(replay.sample(12750), null);
});
