import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { SPACEPORT } from '../src/shared/courses.ts';
import { buildSpaceportWorkplaces } from '../src/display/spaceport-workplaces.ts';

function setup() {
  const group = new THREE.Group();
  const source = new THREE.MeshStandardMaterial({ color: 0x617284, roughness: .71, metalness: .38 });
  const workplaces = buildSpaceportWorkplaces(group, SPACEPORT, { metal: source, concrete: source });
  return { group, source, workplaces };
}

test('inhabited workplaces fit the four-view geometry budget without adding real lights', () => {
  const { group, source, workplaces } = setup();
  const meshes: THREE.Mesh[] = [];
  group.traverse(object => {
    assert.ok(!(object instanceof THREE.Light), 'workplaces must not add lighting passes');
    if (object instanceof THREE.Mesh) meshes.push(object);
  });
  // The browser adds one small atlas mesh for the two department signs.
  assert.ok(meshes.length + 1 <= 25, `${meshes.length + 1} main-pass draws`);
  assert.ok(workplaces.people.length >= 6, 'staff and visitors join the shared people renderer');
  for (const detail of [true, false]) for (const night of [true, false]) {
    workplaces.setDetail(detail); workplaces.setNight(night);
    for (let now = 0; now < 12_000; now += 251) {
      workplaces.update(now);
      let triangles = 4;
      for (const mesh of meshes) {
        const instances = mesh instanceof THREE.InstancedMesh ? mesh.count : 1;
        triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3 * instances;
        if (mesh instanceof THREE.InstancedMesh) {
          assert.ok(mesh.count <= mesh.instanceMatrix.count, `${mesh.name} overran its matrix capacity`);
          assert.ok(mesh.count <= mesh.instanceColor!.count, `${mesh.name} overran its color capacity`);
          for (let i = 0; i < mesh.count * 16; i++) assert.ok(Number.isFinite(mesh.instanceMatrix.array[i]));
        }
      }
      assert.ok(triangles < 30_000, `${triangles} triangles`);
    }
  }
  assert.equal(source.color.getHex(), 0x617284, 'night changes must not recolor a caller-owned surface');
  assert.equal(source.roughness, .71);
  assert.equal(source.metalness, .38);
});

test('workplace geometry clears the service spur and low racing decks, including both posed technicians', () => {
  const { group, workplaces } = setup();
  workplaces.update(2_000); group.updateMatrixWorld(true);
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    if (!Array.isArray(object.material) && object.material.transparent) return; // Surface decals are not obstacles.
    const bounds = new THREE.Box3().setFromObject(object);
    if (object.name.startsWith('Integration workshop') || object.name.startsWith('Workplace technicians')) {
      assert.ok(bounds.max.z <= -146.5, `${object.name} encroaches on the 6 m service spur at z=-143`);
    }
    for (const sample of SPACEPORT.samples) {
      if (sample.y > bounds.max.y + 1 || sample.y < bounds.min.y - 1) continue;
      const dx = Math.max(bounds.min.x - sample.x, 0, sample.x - bounds.max.x);
      const dz = Math.max(bounds.min.z - sample.z, 0, sample.z - bounds.max.z);
      const half = Math.max(SPACEPORT.wallHalfAt(sample.s, 1), SPACEPORT.wallHalfAt(sample.s, -1));
      assert.ok(Math.hypot(dx, dz) > half + .5, `${object.name} intersects a low racing deck`);
    }
  });
  for (const person of workplaces.people) {
    const end = person.to ?? [person.x, person.z];
    for (let t = 0; t <= 1; t += .05) {
      const x = THREE.MathUtils.lerp(person.x, end[0], t), z = THREE.MathUtils.lerp(person.z, end[1], t);
      if (x > -98 && x < -66) assert.ok(z < -146.5, 'staff may not enter the truck lane');
      for (const sample of SPACEPORT.samples) {
        if (sample.y > 2) continue;
        const half = Math.max(SPACEPORT.wallHalfAt(sample.s, 1), SPACEPORT.wallHalfAt(sample.s, -1));
        assert.ok(Math.hypot(x - sample.x, z - sample.z) > half + .8, 'staff stay outside the racing envelope');
      }
    }
  }
});

test('inspection trolley moves continuously in the clear aisle with a taut, safe-height hook', () => {
  const { group, workplaces } = setup();
  const trolley = group.getObjectByName('Inspection trolley · clear overhead service corridor')!;
  let previousX = trolley.position.x, lowestX = Infinity, highestX = -Infinity;
  for (let now = 0; now <= 36_000; now += 100) {
    workplaces.update(now); group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(trolley);
    assert.ok(bounds.min.x > -93.4, 'hook and trolley stay beside the engine, not above its lifting points');
    assert.ok(bounds.min.y > 3.0, 'hook clears technicians and machinery');
    assert.ok(Math.abs(trolley.position.x - previousX) < .025, 'trolley never teleports or changes direction abruptly');
    assert.ok(trolley.position.x >= -92.4 && trolley.position.x <= -90.4);
    lowestX = Math.min(lowestX, trolley.position.x); highestX = Math.max(highestX, trolley.position.x);
    previousX = trolley.position.x;
  }
  assert.ok(highestX - lowestX > 1.99, 'an entire inspection traverse is visible');
});

test('repair workers retain sole contact with the real workshop floor throughout their work cycle', () => {
  const { group, workplaces } = setup();
  const floor = group.getObjectByName('Integration workshop · concrete') as THREE.Mesh;
  const workers = group.getObjectByName('Workplace technicians · clothing and connected tools') as THREE.InstancedMesh;
  floor.geometry.computeBoundingBox();
  const floorTop = floor.geometry.boundingBox!.max.y;
  const matrix = new THREE.Matrix4(), sole = new THREE.Vector3();
  for (const now of [0, 700, 2_400, 5_300, 9_100]) {
    workplaces.update(now);
    let groundedParts = 0;
    for (let i = 0; i < workers.count; i++) {
      workers.getMatrixAt(i, matrix);
      sole.set(0, -.5, 0).applyMatrix4(matrix);
      assert.ok(sole.y >= floorTop - .001, `worker part ${i} penetrates the floor`);
      if (Math.abs(sole.y - floorTop) < .001) groundedParts++;
    }
    assert.equal(groundedParts, 4, 'both feet of both technicians touch the actual modeled floor');
  }
});
