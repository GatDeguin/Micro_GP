import assert from 'node:assert/strict';
import test from 'node:test';
import { freightLane, sampleFreightTruck } from '../src/display/dique-terminal-layout.ts';
import { DIQUE } from '../src/shared/courses.ts';

test('the freight truck reaches the booked scale, waits for inspection, and backs away', () => {
  const start = sampleFreightTruck(0);
  const inbound = sampleFreightTruck(7.5);
  const onScale = sampleFreightTruck(14);
  const leaving = sampleFreightTruck(24);
  assert.equal(start.x, freightLane.from.x);
  assert.ok(inbound.speed > 0 && !inbound.inspection);
  assert.equal(onScale.x, freightLane.to.x);
  assert.equal(onScale.speed, 0);
  assert.ok(onScale.inspection);
  assert.ok(leaving.speed < 0 && !leaving.inspection);
  assert.deepEqual(sampleFreightTruck(freightLane.period), start);
});

test('the complete freight truck envelope stays in the service yard', () => {
  for (let time = 0; time <= freightLane.period; time += 0.25) {
    const { x } = sampleFreightTruck(time);
    for (const front of [-5.15, 2.12]) {
      for (const side of [-1.46, 1.46]) {
        const corner = DIQUE.locate(x + front, freightLane.from.z + side);
        assert.ok(Math.abs(corner.offset) > DIQUE.wallHalfAt(corner.s, Math.sign(corner.offset)) + 2);
      }
    }
  }
});
