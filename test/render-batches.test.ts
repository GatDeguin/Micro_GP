import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { instanceStatic } from '../src/display/batches.ts';

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
