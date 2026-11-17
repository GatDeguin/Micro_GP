import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { SPACEPORT } from '../src/shared/courses.ts';
import type { RaceSnapshot } from '../src/shared/protocol.ts';
import { buildSpaceportLaunch } from '../src/display/spaceport-launch.ts';
import { buildSpaceportIllumination } from '../src/display/spaceport-illumination.ts';

test('liftoff reuses bounded buffers, follows altitude, clears and rearms at both detail levels', () => {
  const root = new THREE.Group(), rocket = new THREE.Group(), arms = [new THREE.Group(), new THREE.Group()];
  rocket.position.set(26, 0, -184); root.add(rocket, ...arms);
  const launch = buildSpaceportLaunch(root, rocket, arms);
  const snapshot: RaceSnapshot = { frame: 0, heat: 1, phase: 'race', order: [0], lights: 0, flag: false,
    cars: [{ x: 84, y: 0, z: -200, owned: true, speed: 25, active: true, yaw: 0, lap: 1, blink: false, braking: false, steer: 0 }] };
  launch.observe(snapshot);
  const meshes: THREE.InstancedMesh[] = []; const lights: THREE.Light[] = [];
  root.traverse(object => { if (object instanceof THREE.InstancedMesh) meshes.push(object); if (object instanceof THREE.Light) lights.push(object); });
  assert.equal(lights.length, 1); assert.equal(lights[0].castShadow, false);
  const attributes = meshes.map(mesh => mesh.instanceMatrix);
  let highest = 0, vanished = false, returned = false;
  for (let i = 0; i < 900; i++) {
    launch.setNight(i > 450); launch.setDetail(i % 200 < 100); launch.update(i * 1000 / 60);
    highest = Math.max(highest, rocket.position.y);
    if (!rocket.visible) vanished = true;
    if (vanished && rocket.visible && rocket.position.y === 0) returned = true;
    assert.equal(rocket.position.y, launch.state.altitude);
    assert.ok(Math.abs(rocket.position.x - 26) < .019);
    for (const [index, mesh] of meshes.entries()) {
      assert.equal(mesh.instanceMatrix, attributes[index], 'no dynamic attribute allocation');
      assert.ok(mesh.count <= mesh.instanceMatrix.count);
      assert.ok(mesh.instanceMatrix.array.every(Number.isFinite));
      const alpha = mesh.geometry.getAttribute('instanceAlpha');
      if (alpha) assert.ok(Array.from(alpha.array).every(value => Number.isFinite(value) && value >= 0 && value <= 1));
      if (mesh.name === 'Seis chorros de escape') assert.ok(mesh.boundingSphere!.containsPoint(new THREE.Vector3(26, launch.state.altitude, -184)));
    }
  }
  assert.ok(highest > 400 && vanished && returned);
  assert.equal(rocket.position.y, 0); assert.equal(arms[0].rotation.y, 0); assert.equal(launch.state.phase, 'ready');
  launch.observe({ ...snapshot, heat: 2, phase: 'grid' }); launch.update(15001);
  assert.equal(rocket.position.x, 26); assert.equal(rocket.rotation.z, 0); assert.equal(lights[0].intensity, 0);
});

test('competition lighting uses two shadowless floods and bounded pools aligned to the 3D road', () => {
  const root = new THREE.Group(), lighting = buildSpaceportIllumination(root, SPACEPORT);
  const lights: THREE.SpotLight[] = [];
  root.traverse(object => { if (object instanceof THREE.SpotLight) lights.push(object); });
  assert.equal(lights.length, 2); assert.ok(lights.every(light => !light.castShadow));
  lighting.setNight(true); assert.ok(lights.every(light => light.intensity >= 2000));
  lighting.setNight(false); assert.ok(lights.every(light => light.intensity < 200));
  const pools = root.getObjectByName('Manchas de luz sobre pista, boxes y edificios') as THREE.Mesh;
  const vertices = pools.geometry.getAttribute('position'), point = new THREE.Vector3();
  assert.ok(pools.geometry.index!.count < 4000);
  let index = 0;
  for (let s = 4; s < SPACEPORT.length; s += 44) {
    for (let j = 0; j <= 12; j++) {
      const along = s - 4.6 + j * 9.2 / 12, f = SPACEPORT.frameAt!(along);
      for (let edge = 0; edge < 2; edge++) {
        point.fromBufferAttribute(vertices, index++).sub(new THREE.Vector3(f.x, f.y, f.z));
        const lift = point.dot(new THREE.Vector3(f.nx, f.ny, f.nz));
        assert.ok(Math.abs(lift - .032) < .001, 'every vertex hugs the curved road, even inside loops');
        assert.ok(Math.abs(point.dot(new THREE.Vector3(f.rx, f.ry, f.rz))) <= SPACEPORT.roadHalfAt(along), 'pool stays inside asphalt');
      }
    }
  }
});
