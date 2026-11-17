import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { buildIndustrialFacade } from '../src/display/industrial-facades.ts';

test('service installations stay on the existing foundation and use three bounded batches', () => {
  const paint = new THREE.MeshPhysicalMaterial({ clearcoat: .25 }), steel = new THREE.MeshStandardMaterial({ metalness: .8 });
  for (const [w, d, h, workshop, inset] of [[10.8, 6.7, 3.1, 1, .2], [6.25, 5.1, 2.35, 0, .2],
    [9, 13, 4, 0, 0], [18, 23, 6.8, 1, 0], [40, 28, 10.2, 0, 0]]) {
    const parent = new THREE.Group();
    const facade = buildIndustrialFacade(parent, w, d, h, paint, steel, !!workshop, inset);
    assert.equal(facade.children.length, 3);
    const bounds = new THREE.Box3().setFromObject(facade);
    // Dique pads extend .44 m; Spaceport campus foundations extend 1.5 m.
    const margin = inset ? .44 : 1.5;
    assert.ok(bounds.min.x >= -w / 2 - margin && bounds.max.x <= w / 2 + margin);
    assert.ok(bounds.min.z >= -d / 2 - margin && bounds.max.z <= d / 2 + margin);
    assert.ok(bounds.min.y >= 0 && bounds.max.y <= h + .81, 'feet on foundation, ladder reaches roof');
    let triangles = 0;
    for (const child of facade.children) {
      const mesh = child as THREE.Mesh;
      assert.ok(!mesh.castShadow, 'no additional shadow-map work');
      triangles += mesh.geometry.index!.count / 3;
      for (const value of mesh.geometry.getAttribute('position').array) assert.ok(Number.isFinite(value));
    }
    assert.ok(triangles < 8_000, `${w} m facade: ${triangles} triangles`);
  }
});
