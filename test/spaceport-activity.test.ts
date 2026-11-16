import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { buildSpaceportActivity, spaceportForkliftPose } from '../src/display/spaceport-activity.ts';
import type { RaceSnapshot } from '../src/shared/protocol.ts';

function scene() {
  const parent = new THREE.Group();
  const activity = buildSpaceportActivity(parent);
  const meshes = (parent.children[0] as THREE.Group).children as THREE.InstancedMesh[];
  return { activity, meshes };
}

test('forklift raises before travelling and transfers a supported pallet without teleporting', () => {
  let previous = spaceportForkliftPose(0);
  for (let t = .05; t <= 88; t += .05) {
    const pose = spaceportForkliftPose(t);
    assert.ok(pose.z >= -194.701 && pose.z <= -185.199, 'stays in the warehouse apron');
    assert.ok(Math.abs(pose.z - previous.z) < .07, 'continuous speed through every stage boundary');
    assert.ok(Math.abs(pose.palletBase - previous.palletBase) < .025, 'cargo never changes support abruptly');
    assert.ok(pose.palletBase >= -.046 && pose.palletBase <= 1.051);
    const travelling = Math.abs(pose.z - previous.z) > .001;
    if (travelling) assert.ok(pose.palletBase > 1.04, 'pallet clears the 0.8 m loading platform');
    assert.ok(Math.abs(pose.fork - .14 - pose.palletBase) < .001, 'fork carriage remains under the pallet');
    previous = pose;
  }
  assert.ok(Math.abs(spaceportForkliftPose(20).palletBase - (-.046)) < .002, 'delivery touches the actual parking slab, not the nominal ground zero');
  assert.equal(spaceportForkliftPose(42).palletBase.toFixed(2), '0.80', 'return rests on the dock');
  assert.deepEqual(spaceportForkliftPose(0), spaceportForkliftPose(44));
});

test('the full work cycle fits fourteen draw calls and 35k triangles in both detail levels', () => {
  const { activity, meshes } = scene();
  assert.equal(meshes.length, 14);
  for (const detail of [true, false]) {
    activity.setDetail(detail); activity.setNight(!detail);
    for (let time = 0; time <= 48_000; time += 217) {
      activity.update(time);
      let triangles = 0;
      for (const mesh of meshes) {
        assert.ok(mesh.count <= mesh.instanceMatrix.count, `${mesh.name}: capacity`);
        assert.ok(mesh.visible, 'compact views keep the moving detail');
        triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3 * mesh.count;
        for (let i = 0; i < mesh.count * 16; i++) assert.ok(Number.isFinite(mesh.instanceMatrix.array[i]), mesh.name);
      }
      assert.ok(triangles < 35_000, `${triangles} triangles`);
    }
  }
});

test('compact mode retains all equipment and limits uploads while fans and doors keep working', () => {
  const { activity, meshes } = scene();
  const fans = meshes.find(mesh => mesh.name === 'Activity · HVAC rotors')!;
  const doors = meshes.find(mesh => mesh.name === 'Activity · sliding entrance leaves')!;
  const before = Array.from(fans.instanceMatrix.array);
  const closed = Array.from(doors.instanceMatrix.array);
  activity.update(0); activity.update(4_000);
  assert.notDeepEqual(Array.from(fans.instanceMatrix.array), before, 'roof fan blades turn');
  assert.notDeepEqual(Array.from(doors.instanceMatrix.array), closed, 'door leaves slide along their tracks');
  const counts = meshes.map(mesh => mesh.count);
  activity.setDetail(false); activity.update(4_100);
  const version = fans.instanceMatrix.version;
  activity.update(4_120);
  assert.equal(fans.instanceMatrix.version, version, 'compact update is capped at 12 Hz');
  activity.update(4_200);
  assert.ok(fans.instanceMatrix.version > version);
  assert.deepEqual(meshes.map(mesh => mesh.count), counts);
});

test('telemetry cameras turn toward nearby active race cars', () => {
  function heading(active: boolean) {
    const { activity, meshes } = scene();
    const snapshot = { cars: [{ x: -80, y: 0, z: -313.85, active }] } as RaceSnapshot;
    activity.observe(snapshot);
    for (let time = 0; time <= 3_000; time += 100) activity.update(time);
    const cameras = meshes.find(mesh => mesh.name === 'Activity · tracking camera heads')!;
    const matrix = new THREE.Matrix4(); cameras.getMatrixAt(1, matrix);
    return Math.atan2(matrix.elements[8], matrix.elements[10]);
  }
  assert.ok(Math.abs(heading(true) - Math.PI / 2) < .02, 'checkpoint camera tracks a car to its east');
  assert.ok(Math.abs(heading(false) - Math.PI / 2) > .5, 'inactive cars do not interrupt the patrol sweep');
});
