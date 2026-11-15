import assert from 'node:assert/strict';
import test from 'node:test';
import { forkliftYard, sampleDiqueForklift } from '../src/display/dique-yard-motion.ts';
import { DIQUE } from '../src/shared/courses.ts';

test('the forklift carries the same pallet between both bays and withdraws with its forks empty', () => {
  const { start, end, forkReach, cycle } = forkliftYard;
  const parkedA = sampleDiqueForklift(0);
  const carried = sampleDiqueForklift(9);
  const parkedB = sampleDiqueForklift(20);
  const returning = sampleDiqueForklift(31);
  assert.equal(parkedA.cargoX, start);
  assert.equal(parkedB.cargoX, end);
  assert.equal(parkedB.lift, 0);
  assert.ok(parkedB.cargoX - parkedB.x > forkReach + 2);
  assert.ok(carried.lift > 0.6 && carried.speed > 0);
  assert.ok(returning.lift > 0.6 && returning.speed < 0);
  assert.ok(Math.abs(carried.cargoX - carried.x - forkReach) < 1e-8);
  assert.ok(Math.abs(returning.cargoX - returning.x - forkReach) < 1e-8);
  assert.deepEqual(sampleDiqueForklift(cycle), parkedA);
});

test('the forklift keeps the carried load clear of every deck throughout its work cycle', () => {
  const { cycle, z } = forkliftYard;
  let previous = sampleDiqueForklift(0);
  for (let time = 0.1; time <= cycle; time += 0.1) {
    const pose = sampleDiqueForklift(time);
    assert.ok(Math.abs(pose.x - previous.x) < 0.31, 'vehicle travel is continuous');
    assert.ok(Math.abs(pose.cargoX - previous.cargoX) < 0.31, 'pallet travel is continuous');
    assert.ok(Math.abs(pose.lift - previous.lift) < 0.10, 'fork lift is continuous');
    for (const [x, radius] of [[pose.x + 0.52, 2.58], [pose.cargoX, 0.98]]) {
      for (const p of DIQUE.samples) {
        const dx = x - p.x;
        const dz = z - p.z;
        const along = dx * p.dx + dz * p.dz;
        const offset = dz * p.dx - dx * p.dz;
        if (Math.abs(along) > radius + 0.24) continue;
        assert.ok(Math.abs(offset) >= DIQUE.wallHalfAt(p.s, Math.sign(offset)) + radius,
          `work zone overlaps lane at ${p.s.toFixed(1)} m`);
      }
    }
    previous = pose;
  }
});
