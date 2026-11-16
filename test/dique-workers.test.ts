import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createServer } from 'vite';
import type { DiqueWorkstation } from '../src/display/dique-workstations.ts';

test('worker limbs, hoses and tools fit their GPU instance buffers throughout a work cycle', async () => {
  const server = await createServer({ configFile: false, logLevel: 'silent', server: { middlewareMode: true } });
  try {
    const { buildDiqueWorkers } = await server.ssrLoadModule('/src/display/dique-workers.ts');
    const { DIQUE } = await server.ssrLoadModule('/src/shared/courses.ts');
    const root = new THREE.Group();
    const stations: DiqueWorkstation[] = (['engine', 'wheel', 'weld', 'cargo'] as const).map((kind, index) => ({
      kind, name: kind, position: new THREE.Vector3(10000 + index * 10, 0, 10000), yaw: 0, phase: index * 1.1,
      contact: [.13, .8, .56],
    }));
    const workers = buildDiqueWorkers(root, DIQUE, stations);
    for (const detail of [true, false, true]) {
      workers.setDetail(detail);
      for (const time of [0, 1000, 3600, 7000, 11000, 14000]) {
        workers.update(time);
        root.traverse(object => {
          const mesh = object as THREE.InstancedMesh;
          if (!mesh.isInstancedMesh) return;
          assert.ok(mesh.count <= mesh.instanceMatrix.count,
            `${mesh.name}: ${mesh.count} active instances exceed ${mesh.instanceMatrix.count} allocated`);
          assert.ok(!mesh.instanceColor || mesh.count <= mesh.instanceColor.count, `${mesh.name} color buffer is too small`);
          assert.ok(Array.from(mesh.instanceMatrix.array).every(Number.isFinite), `${mesh.name} has invalid transforms`);
        });
      }
    }
  } finally { await server.close(); }
});
