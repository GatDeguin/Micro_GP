import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createServer } from 'vite';

test('replay QR stays in front of its own camera through both loops and low shots', async () => {
  const server = await createServer({ configFile: false, logLevel: 'silent', server: { middlewareMode: true } });
  try {
    const { buildReplayShot } = await server.ssrLoadModule('/src/display/replay-shot.ts');
    const { placardLayout } = await server.ssrLoadModule('/src/display/signs.ts');
    const { SPACEPORT, DIQUE, TALLER } = await server.ssrLoadModule('/src/shared/courses.ts');
    const scene = new THREE.Scene();
    let plateCamera: THREE.PerspectiveCamera;
    let depth = 0;
    const draws: { scene: THREE.Scene; camera: THREE.Camera }[] = [];
    const renderer = {
      extensions: { has: () => false }, capabilities: { maxSamples: 0 }, autoClear: true,
      render(scene: THREE.Scene, camera: THREE.Camera) { draws.push({ scene, camera }); },
      getDrawingBufferSize(size: THREE.Vector2) { return size.set(1280, 720); },
      setRenderTarget() {}, clearDepth() {},
    };
    const plaque = new THREE.Group();
    scene.add(plaque);
    const placard = {
      object: plaque,
      resize(camera: THREE.PerspectiveCamera, width: number, height: number, surface: number) {
        plateCamera = camera;
        // Same plane intersection that anchors the physical QR in buildPlacard.
        const { x, y, size } = placardLayout(width, height);
        const ray = new THREE.Vector3(x * 2 / width - 1, 1 - 2 * (y + size * .635) / height, .5)
          .unproject(camera).sub(camera.position);
        const support = camera.position.clone().addScaledVector(ray, (surface + .025 - camera.position.y) / ray.y);
        depth = -support.applyMatrix4(camera.matrixWorldInverse).z;
      },
    };
    for (const course of [SPACEPORT, TALLER, DIQUE]) {
      const shot = buildReplayShot(renderer, course);
      const stations = course.loops?.flatMap((loop: { from: number; to: number }) =>
        [.5, .05, .20, .25, .35, .65, .75, .8, .95].map(phase => loop.from + (loop.to - loop.from) * phase)) ?? [12, 65, 130];
      for (const lowQuality of [true, false]) for (const kind of ['overtake', 'recovery', 'finish']) {
        for (const at of stations) {
          const p = course.sampleAt(at);
          const loop = course.loops?.find((loop: { from: number; to: number }) => at >= loop.from && at <= loop.to);
          draws.length = 0;
          shot.stop();
          const camera = shot.render(scene, { x: p.x, y: p.y, z: p.z, yaw: loop?.yaw ?? Math.atan2(p.dx, p.dz), distance: at, speed: 8 },
            undefined, 1280, 720, 1 / 60, placard, kind, lowQuality);
          assert.ok(Number.isFinite(depth) && depth > .1, `${course.id} ${kind} at ${at}: QR depth ${depth}`);
          assert.notEqual(plateCamera!, camera, 'the QR needs a stable overlay camera');
          assert.equal(draws.at(-1)?.camera, plateCamera!);
          assert.notEqual(draws.at(-1)?.scene, scene);
          assert.equal(plaque.parent, scene, 'the next overview must recover its plaque');
          assert.equal(renderer.autoClear, true);
        }
      }
      shot.dispose();
    }
  } finally { await server.close(); }
});
