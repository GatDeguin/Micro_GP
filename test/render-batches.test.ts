import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { instanceStatic, mergeStatic } from '../src/display/batches.ts';

test('static batching leaves the existing fence instances in place', () => {
  const root = new THREE.Group();
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshStandardMaterial();
  const posts = new THREE.InstancedMesh(geometry, material, 16);
  const rails = new THREE.InstancedMesh(geometry, material, 32);
  const fasteners = [new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material)];
  posts.setMatrixAt(0, new THREE.Matrix4().makeTranslation(3, 0, 1));
  rails.setMatrixAt(0, new THREE.Matrix4().makeTranslation(3, 1, 1));
  root.add(posts, rails, ...fasteners);

  instanceStatic(root);

  assert.ok(root.children.includes(posts), 'the fence posts should retain their instance buffer');
  assert.ok(root.children.includes(rails), 'the fence rails should retain their instance buffer');
  const ordinaryBatch = root.children.find(mesh => mesh !== posts && mesh !== rails);
  assert.ok(ordinaryBatch instanceof THREE.InstancedMesh);
  assert.equal(ordinaryBatch.count, 2);
});

test('mixed static topology shares a draw with identical vertices, normals and UVs', () => {
  const root = new THREE.Group();
  root.position.set(6, 2, -4);
  const material = new THREE.MeshStandardMaterial();
  const indexed = new THREE.Mesh(new THREE.BoxGeometry(), material);
  const plain = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 4).toNonIndexed(), material);
  indexed.position.set(-3, 0, 1);
  plain.position.set(3, 1, 2);
  plain.scale.set(1.2, 0.8, 1.4);
  plain.rotation.y = 0.7;
  root.add(indexed, plain);
  root.updateMatrixWorld(true);
  const expected = [indexed, plain].map(mesh => {
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrix);
    return geometry.index ? geometry.toNonIndexed() : geometry;
  });
  mergeStatic(root);
  assert.equal(root.children.length, 1);
  const result = (root.children[0] as THREE.Mesh).geometry.toNonIndexed();
  // Batching traverses siblings in reverse. Compare the complete triangle streams.
  for (const name of ['position', 'normal', 'uv']) {
    const values = expected.slice().reverse().flatMap(piece => Array.from(piece.getAttribute(name).array));
    const actual = result.getAttribute(name).array;
    assert.equal(actual.length, values.length);
    for (let i = 0; i < actual.length; i++) assert.ok(Math.abs(actual[i] - values[i]) < 1e-6, `${name} at ${i}`);
  }
  assert.equal(indexed.geometry.index?.count, 36);
  assert.equal(plain.geometry.index, null);
  const batch = root.children[0];
  root.position.set(-10, 3, 8);
  root.updateMatrixWorld(true);
  assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(batch.matrixWorld).toArray(), [-10, 3, 8]);
});
