import assert from 'node:assert/strict';
import test from 'node:test';
import { diqueBuildingFootprint, diqueBuildings } from '../src/display/dique-architecture-layout.ts';
import { DIQUE } from '../src/shared/courses.ts';

test('the Dique buildings and their approach slabs fit behind the track barriers', () => {
  for (const building of Object.values(diqueBuildings)) {
    for (const { x, z } of diqueBuildingFootprint(building)) {
      const point = DIQUE.locate(x, z);
      const wall = DIQUE.wallHalfAt(point.s, Math.sign(point.offset));
      assert.ok(Math.abs(point.offset) - wall > 0.38, building.title);
    }
  }
});
