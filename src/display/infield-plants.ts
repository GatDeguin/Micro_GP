import * as THREE from 'three';
import { PIT_LANE, TRACK, wallHalfAt } from '../shared/track';
import { random, standard } from './materials';

const grassColors = [0x57733a, 0x6d873c, 0x77934f, 0x4d713e, 0x8e9458, 0xa39a62];
const leafColors = [0x3c6334, 0x53773e, 0x648447, 0x788c47, 0x607b42];

function contains(points: readonly THREE.Vector3[], x: number, z: number) {
  let inside = false;
  for (let i = 0, last = points.length - 1; i < points.length; last = i++) {
    const a = points[i];
    const b = points[last];
    if ((a.z > z) !== (b.z > z) && x < a.x + (b.x - a.x) * (z - a.z) / (b.z - a.z)) inside = !inside;
  }
  return inside;
}

function tuftGeometry() {
  const positions: number[] = [];
  const colors: number[] = [];
  const rng = random(523);
  for (let i = 0; i < 8; i++) {
    const angle = i * 2.39996 + rng() * 0.44;
    const x = Math.cos(angle);
    const z = Math.sin(angle);
    const reach = 0.064 + rng() * 0.10;
    const height = 0.13 + rng() * 0.14;
    const width = 0.016 + rng() * 0.019;
    const origin = reach * 0.39;
    const a = [x * origin - z * width, 0, z * origin + x * width];
    const b = [x * origin + z * width, 0, z * origin - x * width];
    const c = [x * reach - z * width * 0.57, height * 0.61, z * reach + x * width * 0.57];
    const d = [x * reach + z * width * 0.57, height * 0.61, z * reach - x * width * 0.57];
    const tip = [x * reach * 1.48, height, z * reach * 1.48];
    positions.push(...a, ...b, ...c, ...c, ...b, ...d, ...c, ...d, ...tip);
    for (const shade of [0.48, 0.49, 0.88, 0.88, 0.49, 0.85, 0.88, 0.85, 1.04]) colors.push(shade, shade, shade);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function buildGroundcover(parent: THREE.Object3D, islands: readonly (readonly THREE.Vector3[])[],
  water: readonly THREE.Vector3[], height: number) {
  const rng = random(4132);
  const patch = new THREE.Group();
  patch.name = 'Pasto de fibra y matas bajas';
  parent.add(patch);
  const edges = TRACK.samples.map(p => ({ ...p, left: wallHalfAt(p.s, -1) + 0.82, right: wallHalfAt(p.s, 1) + 0.82 }));
  const stand = TRACK.sampleAt(0);
  const service = TRACK.sampleAt(PIT_LANE.stalls[1]);
  const serviceZ = service.z + PIT_LANE.stationOffset;
  const fixtures = [
    [stand.x - 3.65, stand.x + 3.65, 0.68, 3.91],
    [service.x - 4.12, service.x + 4.91, serviceZ - 1.75, serviceZ + 1.93],
    [-28.05, -22.85, -3.82, 2.21], [-10.40, -8.9, 1.90, 3.40],
  ];

  function available(x: number, z: number) {
    if (fixtures.some(([left, right, near, far]) => x > left && x < right && z > near && z < far)
      || !islands.some(points => contains(points, x, z)) || contains(water, x, z)) return false;
    for (const p of edges) {
      const dx = x - p.x;
      const dz = z - p.z;
      if (Math.abs(dx * p.dx + dz * p.dz) > 0.37) continue;
      const offset = dz * p.dx - dx * p.dz;
      if (offset > -p.left && offset < p.right) return false;
    }
    return true;
  }

  const pockets = [
    [-30.4, -4.6, 2.9, 2.5, 92], [-29.4, 2.25, 2.5, 1.7, 74], [-24.4, -5.7, 2.7, 1.8, 85],
    [-27.0, 3.27, 2.4, 1.25, 61], [-11.0, 2.36, 1.5, 1.4, 61], [-5.0, -0.81, 4.0, 1.75, 92],
    [1.03, -2.70, 1.05, 1.8, 70], [5.37, -4.95, 1.5, 2.8, 104], [9.68, -2.49, 1.9, 1.8, 79],
    [13.35, -4.21, 3.7, 2.0, 110], [21.42, -2.55, 3.8, 2.7, 98], [27.3, 0.4, 2.5, 2.4, 88],
    [22.21, 3.19, 2.4, 1.15, 71], [12.55, -0.86, 2.0, 1.07, 41],
  ];
  const tufts: [number, number, number][] = [];
  const shrubs: [number, number, number][] = [];
  for (const [cx, cz, rx, rz, count] of pockets) {
    for (let i = 0; i < count; i++) {
      const radius = Math.sqrt(rng());
      const angle = rng() * Math.PI * 2;
      const x = cx + Math.cos(angle) * rx * radius;
      const z = cz + Math.sin(angle) * rz * radius;
      if (!available(x, z)) continue;
      tufts.push([x, z, 0.42 + rng() ** 1.7 * 0.94]);
      if (i % 11 === 0) shrubs.push([x, z, 0.12 + rng() ** 1.6 * 0.20]);
    }
  }

  const blades = standard(0xffffff, 0.91);
  blades.side = THREE.DoubleSide;
  blades.vertexColors = true;
  const grass = new THREE.InstancedMesh(tuftGeometry(), blades, tufts.length);
  const leaves = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), standard(0xffffff, 0.89), shrubs.length * 3);
  const transform = new THREE.Object3D();
  const tint = new THREE.Color();
  tufts.forEach(([x, z, size], i) => {
    transform.position.set(x, height + 0.004, z);
    transform.rotation.set(0, rng() * Math.PI * 2, 0);
    transform.scale.set(size * (1.03 + rng() * 0.29), size, size);
    transform.updateMatrix();
    grass.setMatrixAt(i, transform.matrix);
    grass.setColorAt(i, tint.setHex(grassColors[Math.floor(rng() * grassColors.length)]));
  });
  shrubs.forEach(([x, z, size], i) => {
    for (let j = 0; j < 3; j++) {
      const angle = i * 1.48 + j * Math.PI * 2 / 3;
      const radius = size * (0.56 + rng() * 0.40);
      transform.position.set(x + Math.cos(angle) * size * 0.52, height + radius * 0.46, z + Math.sin(angle) * size * 0.52);
      transform.rotation.set(rng() * 0.41, angle, rng() * 0.37);
      transform.scale.set(radius, radius * (0.63 + 0.37 * rng()), radius * (0.77 + 0.48 * rng()));
      transform.updateMatrix();
      leaves.setMatrixAt(i * 3 + j, transform.matrix);
      leaves.setColorAt(i * 3 + j, tint.setHex(leafColors[(i + j) % leafColors.length]));
    }
  });
  grass.receiveShadow = leaves.receiveShadow = true;
  leaves.castShadow = true;
  patch.add(grass, leaves);
}
