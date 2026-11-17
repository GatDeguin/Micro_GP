import assert from 'node:assert/strict';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import ts from 'typescript';

const root = new URL('../../', import.meta.url);
const glb = await readFile(new URL('src/display/assets/spaceport-service-vehicles.glb', root));
const asset = await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '');
const geometryReport = [];
asset.scene.updateMatrixWorld(true);
asset.scene.traverse(object => {
  if (!object.isMesh) return;
  const geometry = object.geometry;
  const bounds = new THREE.Box3().setFromObject(object);
  geometryReport.push({ name: object.name, triangles: geometry.index.count / 3,
    min: bounds.min.toArray(), max: bounds.max.toArray() });
  assert.ok(geometry.getAttribute('color'), `${object.name} must retain paint`);
  for (const coordinate of geometry.getAttribute('position').array) assert.ok(Number.isFinite(coordinate));
  if (object.name === 'shared_wheel') {
    const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
    let outerVertices = 0;
    for (let i = 0; i < position.count; i++) {
      const radius = Math.hypot(position.getY(i), position.getZ(i));
      if (radius < .99) continue;
      outerVertices++;
      assert.ok(position.getY(i) * normal.getY(i) + position.getZ(i) * normal.getZ(i) >= -.001,
        'tread and shoulder normals face outward');
    }
    assert.ok(outerVertices > 100);
  }
});
assert.equal(geometryReport.length, 13, 'Only the fleet belongs in the runtime GLB');
const source = await readFile(new URL('src/display/spaceport-vehicles.ts', root), 'utf8');
const adapted = source.replace("import serviceFleetUrl from './assets/spaceport-service-vehicles.glb?url';",
  `const serviceFleetUrl = 'data:model/gltf-binary;base64,${glb.toString('base64')}';`);
const output = ts.transpileModule(adapted, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
} }).outputText;
const temp = new URL('.verify-vehicles-runtime.mjs', import.meta.url);
await writeFile(temp, output);
globalThis.ProgressEvent ??= class { constructor(type, init) { this.type = type; Object.assign(this, init); } };
try {
  const { buildSpaceportVehicles } = await import(pathToFileURL(fileURLToPath(temp)));
  const parent = new THREE.Group();
  const road = [[-70,-.045,-24],[155,-.045,-24],[155,-.045,-132],[66,-.045,-132],
    [66,-.045,-102],[-70,-.045,-102],[-70,-.045,-24]];
  const vehicles = await buildSpaceportVehicles(parent, {
    placements: [
      { kind:'truck', position:[-103,-.045,-190], yaw:Math.PI },
      { kind:'truck', position:[155,-.045,-113], yaw:0 },
      { kind:'pickup', position:[-119,-.045,-65], yaw:0 },
      { kind:'pickup', position:[-115,-.045,-65], yaw:0 },
      { kind:'pickup', position:[-111,-.045,-65], yaw:0 },
      { kind:'security', position:[-98,-.045,-322], yaw:0 },
      { kind:'security', position:[-98,-.045,-330], yaw:0 },
      { kind:'security', position:[-98,-.045,-338], yaw:0 },
    ],
    routes: [
      { kind:'truck', points:road, speedMps:3, phase:0 },
      { kind:'pickup', points:road, speedMps:3, phase:.45 },
    ],
  });
  const meshes = parent.children[0].children;
  assert.equal(meshes.length, 14);
  const triangles = meshes.reduce((sum, mesh) => sum + mesh.count * mesh.geometry.index.count / 3, 0);
  assert.ok(triangles < 60000, `Fleet triangle budget exceeded: ${triangles}`);
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), lastPosition = new THREE.Vector3();
  const truck = meshes.find(mesh => mesh.name === 'Flota · truck_body');
  let maxStep = 0;
  for (let t = 0; t <= 480000; t += 40) {
    vehicles.update(t);
    truck.getMatrixAt(2, matrix); position.setFromMatrixPosition(matrix);
    if (t) maxStep = Math.max(maxStep, position.distanceTo(lastPosition));
    lastPosition.copy(position);
    assert.ok(matrix.elements.every(Number.isFinite));
  }
  assert.ok(maxStep < .13, `Route must remain continuous and below 3 m/s: ${maxStep}`);
  vehicles.setNight(true); vehicles.setDetail(false); vehicles.update(480040);
  assert.ok(meshes.every(mesh => !mesh.castShadow));
  vehicles.dispose(); assert.equal(parent.children.length, 0);
  console.log(JSON.stringify({ bytes:glb.byteLength, draws:meshes.length || 14, fleetTriangles:triangles,
    maxStepMeters:maxStep, routeSeconds:480, geometry:geometryReport }, null, 2));
} finally { await unlink(temp); }
