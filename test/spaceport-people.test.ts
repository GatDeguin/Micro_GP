import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { buildSpaceportPeople, type SpaceportPerson } from '../src/display/spaceport-people.ts';
import { SPACEPORT } from '../src/shared/courses.ts';
import type { CarView, RaceSnapshot } from '../src/shared/protocol.ts';

const roles: SpaceportPerson['role'][] = ['scientist', 'technician', 'security', 'visitor', 'photographer'];

function snapshot(x: number, y: number, z: number): RaceSnapshot {
  return { frame: 1, heat: 1, phase: 'race', lights: 0, flag: false, order: [0],
    cars: [{ x, y, z, yaw: 0, speed: 8, lap: 0, owned: false, blink: false, braking: false, steer: 0 } satisfies CarView] };
}

function meshes(parent: THREE.Group) {
  return (parent.children[0] as THREE.Group).children as THREE.InstancedMesh[];
}

test('55 spaceport people fit eight batches, 45k close triangles and 25k compact triangles in every pose', () => {
  // Homogeneous groups exercise the worst case, not just the expected mixed crowd.
  for (const role of roles) {
    const parent = new THREE.Group();
    const people = buildSpaceportPeople(parent, SPACEPORT, Array.from({ length: 55 }, (_, i) =>
      ({ x: i * .2, z: 0, role, phase: i * .731, to: i % 4 === 0 ? [i * .2 + 3, 0] : undefined })));
    assert.equal(meshes(parent).length, 8);
    for (const detail of [true, false, true]) {
      people.setDetail(detail);
      people.setNight(!detail);
      for (let time = 0; time < 24_000; time += 417) {
        people.observe(snapshot(3, 0, 6));
        people.update(time);
        let triangles = 0;
        for (const mesh of meshes(parent)) {
          assert.ok(mesh.count <= mesh.instanceMatrix.count, `${role}: ${mesh.name} capacity`);
          assert.ok(mesh.visible, 'compact mode retains the crowd');
          const faces = (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
          triangles += faces * mesh.count;
          const matrix = mesh.instanceMatrix.array;
          for (let i = 0; i < mesh.count * 16; i++) assert.ok(Number.isFinite(matrix[i]), `${role}: finite matrices`);
          const colors = mesh.instanceColor!.array;
          for (let i = 0; i < mesh.count * 3; i++) assert.ok(Number.isFinite(colors[i]), `${role}: finite colors`);
        }
        assert.ok(triangles < (detail ? 45_000 : 25_000), `${role} (${detail ? 'close' : 'compact'}): ${triangles} triangles`);
      }
    }
  }
});

test('pedestrians stop and reverse continuously without leaving their assigned level segment', () => {
  const parent = new THREE.Group();
  const people = buildSpaceportPeople(parent, SPACEPORT, [{ x: 2, z: 3, y: 4, role: 'visitor', to: [5, 7], phase: 0 }]);
  const head = meshes(parent).find(mesh => mesh.name === 'People · faces')!;
  const matrix = new THREE.Matrix4();
  let previousX = 2;
  let previousZ = 3;
  let stops = 0;
  let furthest = 0;
  for (let now = 0; now <= 40_000; now += 100) {
    people.update(now);
    head.getMatrixAt(0, matrix);
    const x = matrix.elements[12], z = matrix.elements[14];
    const along = ((x - 2) * 3 + (z - 3) * 4) / 25;
    assert.ok(along >= -.003 && along <= 1.003);
    assert.ok(Math.abs((x - 2) * 4 - (z - 3) * 3) < .02);
    assert.ok(matrix.elements[13] > 5.35 && matrix.elements[13] < 5.4, 'head remains above the authored deck');
    const step = Math.hypot(x - previousX, z - previousZ);
    assert.ok(step < .10, `no teleport at ${now}: ${step}`);
    if (step < .0001) stops++;
    previousX = x;
    previousZ = z;
    furthest = Math.max(furthest, along);
  }
  assert.ok(stops > 20, 'stages include pauses');
  assert.ok(furthest > .99, 'pedestrian reaches the far end');
});

test('photographers ignore distant cars and cars on another deck', () => {
  function poseFor(x: number, y: number, z: number) {
    const parent = new THREE.Group();
    const people = buildSpaceportPeople(parent, SPACEPORT, [{ x: 0, z: 0, yaw: 0, role: 'photographer', phase: 0 }]);
    people.observe(snapshot(x, y, z));
    for (let now = 0; now <= 1_500; now += 50) people.update(now);
    const head = meshes(parent).find(mesh => mesh.name === 'People · faces')!;
    const matrix = new THREE.Matrix4();
    head.getMatrixAt(0, matrix);
    return matrix;
  }
  const baseline = poseFor(30, 0, 0);
  assert.deepEqual(poseFor(10, 8, 0).elements, baseline.elements);
  const nearby = poseFor(10, 0, 0);
  assert.ok(nearby.elements[8] > .2, 'camera faces a nearby same-level car along +X');
});
