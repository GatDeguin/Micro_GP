import assert from 'node:assert/strict';
import test from 'node:test';
import { SnapshotClock } from '../src/display/snapshot-clock.ts';
import type { RaceSnapshot } from '../src/shared/protocol.ts';

function snapshot(frame: number, phase: RaceSnapshot['phase'] = 'race', heat = 1): RaceSnapshot {
  return { frame, phase, heat, lights: 0, flag: false, order: [], cars: [] };
}

function tickOf(sample: NonNullable<ReturnType<SnapshotClock['sample']>>) {
  return sample.from.frame + (sample.to.frame - sample.from.frame) * sample.alpha;
}

test('20 Hz packets with uneven arrival times advance at the 60 Hz simulation rate', () => {
  const delay = 85;
  const clock = new SnapshotClock(delay);
  const jitters = [0, -8, 11, -12, 6, -4, 13, 0];
  const arrival = (index: number) => index * 50 + jitters[index % jitters.length];
  let nextPacket = 0;
  let previous = 0;
  for (let frame = 0; frame < 90; frame++) {
    const now = frame * 1000 / 60;
    while (arrival(nextPacket) <= now) {
      clock.add(snapshot(nextPacket * 3), arrival(nextPacket));
      nextPacket++;
    }
    const sample = clock.sample(now)!;
    const tick = tickOf(sample);
    assert.ok(tick >= previous && sample.to.frame <= (nextPacket - 1) * 3);
    assert.ok(sample.alpha >= 0 && sample.alpha <= 1);
    if (now >= 200) {
      assert.ok(tick - previous > 0.75 && tick - previous < 1.25);
      assert.ok(Math.abs(tick - (now - delay) * 60 / 1000) < 0.6);
    }
    previous = tick;
  }
});

test('a stalled stream freezes at its newest frame and resumes monotonically', () => {
  const clock = new SnapshotClock(75);
  assert.equal(clock.sample(0), undefined);
  clock.add(snapshot(100), 0);
  clock.add(snapshot(103), 50);
  const between = clock.sample(95)!;
  assert.equal(between.from.frame, 100);
  assert.equal(between.to.frame, 103);
  assert.ok(between.alpha > 0 && between.alpha < 1);
  const frozen = clock.sample(220)!;
  assert.equal(frozen.from.frame, 103);
  assert.equal(frozen.to.frame, 103);
  assert.equal(tickOf(clock.sample(205)!), 103);

  clock.add(snapshot(112), 230);
  const resumed = clock.sample(235)!;
  assert.ok(tickOf(resumed) >= 103 && tickOf(resumed) <= 112);
});

test('phase and heat transitions and a restarted server replace the interpolation history', () => {
  const clock = new SnapshotClock(75);
  clock.add(snapshot(-1, 'demo', 0), 0);
  clock.add(snapshot(100, 'demo', 0), 20);
  assert.equal(tickOf(clock.sample(20)!), 100);

  for (const [state, now] of [
    [snapshot(103, 'grid'), 70],
    [snapshot(106, 'race'), 120],
    [snapshot(1, 'race'), 170],
    [snapshot(7, 'race', 2), 220],
  ] as const) {
    clock.add(state, now);
    const sample = clock.sample(now)!;
    assert.equal(sample.from, state);
    assert.equal(sample.to, state);
  }
});

test('a duplicate tick refreshes its snapshot without snapping to it early', () => {
  const clock = new SnapshotClock(80);
  clock.add(snapshot(10), 0);
  clock.add(snapshot(13), 50);
  const duplicate = { ...snapshot(13), flag: true };
  clock.add(duplicate, 65);
  const sample = clock.sample(105)!;
  assert.equal(sample.from.frame, 10);
  assert.equal(sample.to, duplicate);
  assert.ok(sample.alpha > 0 && sample.alpha < 1);
});

test('a gap longer than 420 ms in packets or rendering snaps to the latest snapshot', () => {
  const packetGap = new SnapshotClock(85);
  packetGap.add(snapshot(10), 0);
  for (let now = 50; now <= 400; now += 50) packetGap.sample(now);
  const rejoined = snapshot(40);
  packetGap.add(rejoined, 460);
  assert.equal(packetGap.sample(460)?.from, rejoined);

  const renderGap = new SnapshotClock(85);
  renderGap.add(snapshot(10), 0);
  renderGap.sample(0);
  let newest = snapshot(10);
  for (let i = 1; i <= 10; i++) {
    newest = snapshot(10 + 3 * i);
    renderGap.add(newest, i * 50);
  }
  const resumed = renderGap.sample(500)!;
  assert.equal(resumed.from, newest);
  assert.equal(resumed.to, newest);
});

test('packets cannot grow the history without limit while rendering is inactive', () => {
  const clock = new SnapshotClock(5_000);
  for (let i = 0; i <= 150; i++) clock.add(snapshot(3 * i), 50 * i);
  const sample = clock.sample(7_500)!;
  assert.ok(sample.from.frame >= 450 - 3 * 32);
});
