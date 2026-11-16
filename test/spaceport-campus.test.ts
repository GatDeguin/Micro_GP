import assert from 'node:assert/strict';
import test from 'node:test';
import { SPACEPORT } from '../src/shared/courses.ts';
import { SPACEPORT_BUILDINGS, SPACEPORT_SERVICE_ROADS, SPACEPORT_SERVICE_LOOP, roundedServicePath } from '../src/display/spaceport-campus-layout.ts';

test('campus buildings and their foundations remain outside the race envelope at every deck height', () => {
  for (const site of SPACEPORT_BUILDINGS) {
    for (const point of SPACEPORT.samples) {
      if (point.y > site.height + 2) continue;
      const dx = Math.max(0, Math.abs(point.x - site.x) - site.width / 2 - 1.5);
      const dz = Math.max(0, Math.abs(point.z - site.z) - site.depth / 2 - 1.5);
      const wall = Math.max(SPACEPORT.wallHalfAt(point.s, 1), SPACEPORT.wallHalfAt(point.s, -1));
      assert.ok(Math.hypot(dx, dz) > wall + .5, `${site.id} intersects race envelope at ${point.s}`);
    }
  }
});

test('service roads give trucks ground separation from racing and clearance under elevated decks', () => {
  // Include a 4.5 m clearance envelope for the 3.4 m Blender truck. The rear
  // access deliberately crosses below a much higher racing bridge.
  const lowTrack = SPACEPORT.samples.filter(point => point.y < 4.5);
  for (const road of SPACEPORT_SERVICE_ROADS) {
    const points = roundedServicePath(road.points);
    for (let i = 1; i < points.length; i++) {
      const [ax, az] = points[i - 1], [bx, bz] = points[i];
      const n = Math.ceil(Math.hypot(bx - ax, bz - az));
      for (let j = 0; j <= n; j++) {
        const x = ax + (bx - ax) * j / n, z = az + (bz - az) * j / n;
        for (const point of lowTrack) {
          const wall = Math.max(SPACEPORT.wallHalfAt(point.s, 1), SPACEPORT.wallHalfAt(point.s, -1));
          assert.ok(Math.hypot(x - point.x, z - point.z) > road.width / 2 + wall + .5,
            `service road overlaps low racing deck at ${x},${z}`);
        }
      }
    }
  }
});

test('rounded service loop closes continuously and avoids the building foundations', () => {
  const path = roundedServicePath(SPACEPORT_SERVICE_LOOP, 8, true);
  assert.deepEqual(path[0], path.at(-1));
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1], [bx, bz] = path[i];
    const length = Math.hypot(bx - ax, bz - az);
    assert.ok(length > .01);
    for (let at = 0; at <= length; at += .5) {
      const x = ax + (bx - ax) * at / length, z = az + (bz - az) * at / length;
      for (const site of SPACEPORT_BUILDINGS) {
        const dx = Math.max(0, Math.abs(x - site.x) - site.width / 2);
        const dz = Math.max(0, Math.abs(z - site.z) - site.depth / 2);
        assert.ok(Math.hypot(dx, dz) > 4, `truck lane reaches ${site.id}`);
      }
    }
  }
});
