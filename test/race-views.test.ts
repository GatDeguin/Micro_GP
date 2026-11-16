import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createServer } from 'vite';
import { CAR_DIMENSIONS } from '../src/shared/car-dimensions.ts';

test('loop chase keeps the whole toy car in frame through inversion and lateral steering', async () => {
  const server = await createServer({ configFile: false, logLevel: 'silent', server: { middlewareMode: true } });
  try {
    const { buildRaceViews } = await server.ssrLoadModule('/src/display/race-views.ts');
    const { SPACEPORT } = await server.ssrLoadModule('/src/shared/courses.ts');
    const scene = new THREE.Scene();
    const renderer = { autoClear: true, render() {}, clearDepth() {} };
    const placard = { object: new THREE.Group(), resize() {}, setGrounded() {} };
    const overhead = new THREE.PerspectiveCamera();
    const point = new THREE.Vector3();
    let worst = 0;
    let location = '';
    for (const loop of SPACEPORT.loops) for (const fraction of [.02, .15, .25, .40, .5, .65, .75, .9, .98]) {
      const s = loop.from + (loop.to - loop.from) * fraction;
      for (const offset of [-1.2, 0, 1.2]) for (const aspect of [16 / 9, 9 / 16]) {
        const f = SPACEPORT.frameAt(s, offset);
        const render = buildRaceViews(renderer, overhead, placard, () => () => {},
          { wall: new THREE.Group(), build() { throw Error('Spaceport uses its own sky'); } }, SPACEPORT);
        const camera = render(scene, 'chase', [{ x: f.x, y: f.y, z: f.z, yaw: loop.yaw, distance: s, speed: 8 }],
          [0], 900 * aspect, 900, 1 / 60);
        camera.updateMatrixWorld();
        for (const dimensions of CAR_DIMENSIONS) for (const x of [-dimensions.halfWidth, dimensions.halfWidth]) {
          for (const z of [-dimensions.rear, dimensions.front]) for (const y of [.03, 1.12]) {
            point.set(f.x + f.rx * x + f.tx * z + f.nx * y,
              f.y + f.ry * x + f.ty * z + f.ny * y, f.z + f.rz * x + f.tz * z + f.nz * y).project(camera);
            const bound = Math.max(Math.abs(point.x), Math.abs(point.y));
            if (bound > worst) { worst = bound; location = `loop ${loop.from}, phase ${fraction}, lane ${offset}, aspect ${aspect}: ${point.toArray()}`; }
            assert.ok(point.z < 1);
          }
        }
      }
    }
    assert.ok(worst < .98, location);
  } finally { await server.close(); }
});
