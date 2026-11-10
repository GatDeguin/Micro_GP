import assert from 'node:assert/strict';
import test from 'node:test';
import { PIT_LANE, ROAD_HALF, TRACK } from '../src/shared/track.ts';

test('the two turns bank outward while the covered road and pit stay level', () => {
  const { anchors, bankAt, heightAt, roadHalfAt, crossing, tunnel } = TRACK;
  assert.ok(bankAt(anchors.hairpinApex) > 0.14);
  assert.ok(bankAt(anchors.sweepApex) < -0.13);
  assert.ok(heightAt(anchors.hairpinApex, 2) > heightAt(anchors.hairpinApex, -2));
  assert.ok(heightAt(anchors.sweepApex, -2) > heightAt(anchors.sweepApex, 2));
  for (const s of [0, PIT_LANE.full, tunnel.from, tunnel.to, crossing.lower, crossing.upper]) assert.equal(bankAt(s), 0);
  assert.equal(heightAt(crossing.upper, 0) - heightAt(crossing.lower, 0), TRACK.bridge.height);

  for (const [i, p] of TRACK.samples.entries()) {
    const next = TRACK.samples[(i + 1) % TRACK.samples.length];
    for (const side of [-1, 1]) {
      const a = side * roadHalfAt(p.s);
      const b = side * roadHalfAt(next.s);
      const y = heightAt(p.s, a);
      const rise = heightAt(next.s, b) - y;
      const dx = next.x - p.x - next.dz * b + p.dz * a;
      const dz = next.z - p.z + next.dx * b - p.dx * a;
      assert.ok(y >= -0.006 && Math.abs(rise) / Math.hypot(dx, dz) < 0.18);
    }
  }
});

test('variable widths leave room for distinct paved, gravel and grass run-offs', () => {
  const { anchors, roadHalfAt, surfaceBandsAt, surfaceAt } = TRACK;
  assert.equal(roadHalfAt(0), ROAD_HALF);
  assert.ok(roadHalfAt(anchors.hairpinApex) > ROAD_HALF + 0.70);
  assert.ok(roadHalfAt(anchors.chicaneApexOut) < ROAD_HALF - 0.20);
  assert.ok(roadHalfAt(anchors.sweepApex) > ROAD_HALF + 0.20);

  const gravel = surfaceBandsAt(anchors.hairpinApex, 1);
  const paved = surfaceBandsAt(anchors.chicaneApexOut, -1);
  const front = surfaceBandsAt(0, 1);
  assert.equal(surfaceAt(anchors.hairpinApex, (gravel.asphalt + gravel.curb) / 2), 'curb');
  assert.equal(surfaceAt(anchors.hairpinApex, (gravel.escape + gravel.gravel) / 2), 'gravel');
  assert.equal(surfaceAt(anchors.chicaneApexOut, -(paved.curb + paved.escape) / 2), 'escape');
  assert.equal(surfaceAt(0, (front.gravel + front.wall) / 2), 'grass');
  assert.equal(surfaceAt(PIT_LANE.stalls[1], PIT_LANE.offset), 'asphalt');
});

test('the fast chicane reverses direction ahead of the single grade-separated crossing', () => {
  const { chicane, crossing, samples, wallHalfAt } = TRACK;
  assert.ok(chicane.from < chicane.apexIn && chicane.apexIn < chicane.apexOut && chicane.apexOut < chicane.to);
  assert.ok(chicane.to < crossing.upperFrom);
  let left = false;
  let right = false;
  for (const [i, p] of samples.entries()) {
    const next = samples[(i + 1) % samples.length];
    if (p.s >= chicane.from && next.s <= chicane.to) {
      const turn = p.dx * next.dz - p.dz * next.dx;
      left ||= turn < -0.022;
      right ||= turn > 0.022;
    }
    for (const side of [-1, 1]) {
      const a = side * wallHalfAt(p.s, side);
      const b = side * wallHalfAt(next.s, side);
      const dx = next.x - p.x - next.dz * b + p.dz * a;
      const dz = next.z - p.z + next.dx * b - p.dx * a;
      assert.ok(dx * (next.x - p.x) + dz * (next.z - p.z) > 0);
    }
  }
  assert.ok(left && right);

  let intersections = 0;
  const turn = (a: (typeof samples)[number], b: (typeof samples)[number], c: (typeof samples)[number]) =>
    (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  for (let i = 0; i < samples.length; i++) {
    const a = samples[i];
    const b = samples[(i + 1) % samples.length];
    for (let j = i + 2; j < samples.length; j++) {
      const c = samples[j];
      const d = samples[(j + 1) % samples.length];
      if (turn(a, b, c) * turn(a, b, d) >= 0 || turn(c, d, a) * turn(c, d, b) >= 0) continue;
      assert.ok(Math.abs(a.s - crossing.upper) < 0.3 && Math.abs(c.s - crossing.lower) < 0.3);
      intersections++;
    }
  }
  assert.equal(intersections, 1);
});
