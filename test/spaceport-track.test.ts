import assert from 'node:assert/strict';
import test from 'node:test';
import { DIQUE, getCourse, SPACEPORT } from '../src/shared/courses.ts';
import { isCourseId, normalizeRaceConfig } from '../src/shared/protocol.ts';

test('the spaceport is a closed third circuit with twice the real Dique distance', () => {
  assert.equal(getCourse('spaceport'), SPACEPORT);
  assert.equal(isCourseId('spaceport'), true);
  assert.equal(normalizeRaceConfig({ course: 'spaceport' }).course, 'spaceport');
  assert.equal(SPACEPORT.length, DIQUE.length * 2);
  assert.deepEqual(SPACEPORT.sampleAt(SPACEPORT.length), SPACEPORT.sampleAt(0));
  let measured = 0;
  for (let s = 0; s < SPACEPORT.length; s += .10) {
    const a = SPACEPORT.sampleAt(s), b = SPACEPORT.sampleAt(Math.min(s + .10, SPACEPORT.length));
    measured += Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  }
  assert.ok(Math.abs(measured - SPACEPORT.length) < .15, `3D arc length error: ${measured - SPACEPORT.length}`);
  assert.equal(SPACEPORT.checkpoints.length, 4);
  assert.equal(SPACEPORT.heightAt(SPACEPORT.pit.exit, SPACEPORT.pit.offset), 0);
});

test('both inverted rigs have continuous orthonormal frames and separate entry/exit lanes', () => {
  assert.equal(SPACEPORT.loops.length, 2);
  for (const loop of SPACEPORT.loops) {
    const entry = SPACEPORT.frameAt(loop.from), exit = SPACEPORT.frameAt(loop.to);
    assert.ok(Math.hypot(entry.x - exit.x, entry.z - exit.z) > 16);
    assert.ok(entry.ny > .999 && exit.ny > .999);
    assert.ok(SPACEPORT.frameAt((loop.from + loop.to) / 2).ny < -.99);
    for (let s = loop.from; s < loop.to; s += .17) {
      const f = SPACEPORT.frameAt(s), g = SPACEPORT.frameAt(s + .17), offset = SPACEPORT.frameAt(s, 1.25);
      assert.ok(Math.abs(Math.hypot(f.tx, f.ty, f.tz) - 1) < 1e-10);
      assert.ok(Math.abs(Math.hypot(f.rx, f.ry, f.rz) - 1) < 1e-10);
      assert.ok(Math.abs(Math.hypot(f.nx, f.ny, f.nz) - 1) < 1e-10);
      assert.ok(Math.abs(f.tx * f.rx + f.ty * f.ry + f.tz * f.rz) < 1e-10);
      assert.ok(f.rx * g.rx + f.ry * g.ry + f.rz * g.rz > .995);
      assert.ok(f.nx * g.nx + f.ny * g.ny + f.nz * g.nz > .995);
      assert.ok(Math.abs((offset.x - f.x) * f.rx + (offset.y - f.y) * f.ry + (offset.z - f.z) * f.rz + 1.25) < 1e-10);
      const at = SPACEPORT.locate(offset.x, offset.z, { s, y: offset.y });
      assert.ok(Math.abs(at.s - s) < .04, `loop locator switched at ${s}`);
      assert.ok(Math.abs(at.offset - 1.25) < .01);
    }
  }
});

test('eight and spiral crossings retain physical clearance and ordinary grades remain driveable', () => {
  const lower = SPACEPORT.sampleAt(SPACEPORT.crossing.lower), upper = SPACEPORT.sampleAt(SPACEPORT.crossing.upper);
  assert.ok(Math.hypot(lower.x - upper.x, lower.z - upper.z) < .02);
  assert.ok(SPACEPORT.crossing.clearance > 8);
  for (const at of [lower, upper]) assert.ok(Math.abs(SPACEPORT.locate(at.x, at.z, at).s - at.s) < .02);
  const samples = SPACEPORT.samples.filter((_, i) => i % 8 === 0);
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i], f = SPACEPORT.frameAt(p.s);
    if (!SPACEPORT.loops.some(loop => p.s >= loop.from - 1 && p.s <= loop.to + 1)) {
      assert.ok(Math.abs(f.ty) / Math.hypot(f.tx, f.tz) < .16);
    }
    for (let j = i + 13; j < samples.length; j++) {
      const q = samples[j], apart = Math.abs(p.s - q.s);
      if (Math.min(apart, SPACEPORT.length - apart) < 30) continue;
      if (Math.hypot(p.x - q.x, p.z - q.z) < 7.8) {
        assert.ok(Math.abs(p.y - q.y) > 6, `unintended deck contact at ${p.s}/${q.s}`);
      }
    }
  }
});
