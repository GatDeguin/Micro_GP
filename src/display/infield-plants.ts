import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PIT_LANE, TRACK, wallHalfAt } from '../shared/track';
import { grandstandSections } from './grandstands';
import { random, standard } from './materials';

const grassColors = [0x57733a, 0x6d873c, 0x77934f, 0x4d713e, 0x8e9458, 0xa39a62];
const leafColors = [0x3c6334, 0x53773e, 0x648447, 0x788c47, 0x607b42];
const up = new THREE.Vector3(0, 1, 0);

export function plantWind(material: THREE.Material, time: { value: number }, amplitude: number, canopy = false) {
  const weight = canopy ? '(0.66 + position.y * 0.32)' : 'pow(max(position.y, 0.0), 1.66)';
  material.customProgramCacheKey = () => `plant-wind-${amplitude}-${canopy}`;
  material.onBeforeCompile = shader => {
    shader.uniforms.gardenTime = time;
    shader.vertexShader = 'uniform float gardenTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', /* glsl */`
      #include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 root = instanceMatrix[3].xyz;
        float sway = ${amplitude.toFixed(4)} * ${weight};
        transformed.x += sway * (0.74 * sin(gardenTime * 1.57 - root.x * 0.33 + root.z * 0.57)
          + 0.26 * sin(gardenTime * 3.83 + root.z * 1.2));
        transformed.z += 0.48 * sway * sin(gardenTime * 1.19 + root.x * 0.34 - root.z * 0.48);
      #endif
    `);
  };
}

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

function flowerGeometry(petals: number) {
  function tint(geometry: THREE.BufferGeometry, color: number) {
    const { r, g, b } = new THREE.Color(color);
    const colors = new Float32Array(geometry.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) colors.set([r, g, b], i);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geometry;
  }
  const parts = [tint(new THREE.CylinderGeometry(0.009, 0.016, 0.34, 5).translate(0, 0.17, 0), 0x6e884e),
    tint(new THREE.SphereGeometry(0.036, 8, 5).scale(1, 0.44, 1).translate(0, 0.344, 0), 0xd8a84d)];
  for (let i = 0; i < 6; i++) {
    const turn = i * Math.PI / 3;
    parts.push(tint(new THREE.SphereGeometry(1, 7, 4).scale(0.057, 0.014, 0.024).rotateY(-turn)
      .translate(Math.cos(turn) * 0.047, 0.34, Math.sin(turn) * 0.047), petals));
  }
  const flower = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return flower;
}

function trees(parent: THREE.Object3D, available: (x: number, z: number) => boolean, height: number,
  time: { value: number }, rng: () => number) {
  const sites = [[-30.6, -4.4, 1.30], [-28.7, -3.6, 1.04], [-27.1, 2.95, 1.03], [-26.3, -5.7, 1.31],
    [-9.18, -2.06, 1.30], [-6.3, -2.52, 1.04], [-1.52, -3.68, 1.12], [0.32, -5.88, 0.94], [5.87, -5.19, 1.19],
    [10.93, -3.22, 1.26], [13.64, -5.65, 1.15], [20.17, -3.71, 1.45], [23.23, -1.41, 1.20], [27.08, 1.24, 1.27],
  ].filter(([x, z]) => available(x, z));
  const bark = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.71, 1, 1, 7), standard(0xffffff, 0.91), sites.length * 4);
  const foliage = standard(0xffffff, 0.91);
  plantWind(foliage, time, 0.21, true);
  const crown = new THREE.IcosahedronGeometry(1, 1);
  const points = crown.getAttribute('position');
  for (let i = 0; i < points.count; i++) {
    const x = points.getX(i), y = points.getY(i), z = points.getZ(i);
    const relief = 1 + 0.12 * Math.sin(7.5 * x + 3.6 * y) * Math.cos(5.9 * z - 4.8 * y);
    points.setXYZ(i, x * relief, y * relief, z * relief);
  }
  crown.computeVertexNormals();
  const leaves = new THREE.InstancedMesh(crown, foliage, sites.length * 12);
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  plantWind(depth, time, 0.21, true);
  leaves.customDepthMaterial = depth;
  const transform = new THREE.Object3D();
  const delta = new THREE.Vector3();
  const color = new THREE.Color();
  function branch(index: number, from: THREE.Vector3, to: THREE.Vector3, radius: number) {
    delta.subVectors(to, from);
    transform.position.copy(from).lerp(to, 0.5);
    transform.scale.set(radius, delta.length(), radius);
    transform.quaternion.setFromUnitVectors(up, delta.normalize());
    transform.updateMatrix();
    bark.setMatrixAt(index, transform.matrix);
    bark.setColorAt(index, color.setHex(index % 4 ? 0x77684a : 0x6b5741));
  }
  for (const [i, [x, z, size]] of sites.entries()) {
    const root = new THREE.Vector3(x, height, z);
    const crownY = height + size * 1.18;
    const middle = new THREE.Vector3(x + 0.08, crownY - size * 0.36, z - 0.05);
    branch(i * 4, root, middle, size * 0.064);
    for (let twig = 0; twig < 3; twig++) {
      const a = i * 1.46 + twig * Math.PI * 2 / 3;
      const to = new THREE.Vector3(x + Math.cos(a) * size * 0.42, crownY, z + Math.sin(a) * size * 0.42);
      branch(i * 4 + twig + 1, middle.clone().lerp(root, 0.22), to, size * 0.035);
    }
    for (let j = 0; j < 12; j++) {
      const angle = j * 2.4 + i * 0.71;
      const spread = size * (0.18 + 0.42 * rng()) * (j < 8 ? 1 : 0.57);
      const radius = size * (0.18 + rng() * 0.22);
      transform.position.set(x + Math.cos(angle) * spread, crownY + (j < 8 ? -0.08 : 0.31) * size + rng() * 0.25,
        z + Math.sin(angle) * spread);
      transform.rotation.set(rng() * 0.24, angle, rng() * 0.3);
      transform.scale.set(radius * 1.22, radius * (0.81 + rng() * 0.39), radius);
      transform.updateMatrix();
      leaves.setMatrixAt(i * 12 + j, transform.matrix);
      leaves.setColorAt(i * 12 + j, color.setHex(leafColors[(i + j) % leafColors.length]).multiplyScalar(0.84 + rng() * 0.27));
    }
  }
  leaves.castShadow = leaves.receiveShadow = bark.castShadow = bark.receiveShadow = true;
  parent.add(bark, leaves);
}

export function buildGroundcover(parent: THREE.Object3D, islands: readonly (readonly THREE.Vector3[])[],
  water: readonly THREE.Vector3[], height: number) {
  const rng = random(4132);
  const patch = new THREE.Group();
  patch.name = 'Pasto de fibra y matas bajas';
  parent.add(patch);
  const time = { value: 0 };
  const edges = TRACK.samples.map(p => ({ ...p, left: wallHalfAt(p.s, -1) + 0.82, right: wallHalfAt(p.s, 1) + 0.82 }));
  const service = TRACK.sampleAt(PIT_LANE.stalls[1]);
  const serviceZ = service.z + PIT_LANE.stationOffset;
  const fixtures = [
    ...grandstandSections.map(({ x, z }) => [x - 3.46, x + 3.46, z - 1.22, z + 1.22]),
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
  plantWind(blades, time, 0.48);
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
  trees(patch, available, height, time, rng);

  const flowers = tufts.filter(([x, z], i) => i % 11 === 0 && ((x > -10 && x < 15 && z < -0.6) || (x > 19 && z > -3)));
  const petals = standard(0xffffff, 0.90);
  petals.vertexColors = true;
  plantWind(petals, time, 0.33);
  for (const [i, palette] of [0xf5dfa0, 0xc991a7].entries()) {
    const chosen = flowers.filter((_, index) => index % 2 === i);
    const blooms = new THREE.InstancedMesh(flowerGeometry(palette), petals, chosen.length);
    for (const [index, [x, z, size]] of chosen.entries()) {
      transform.position.set(x, height, z);
      transform.scale.setScalar(size * (0.74 + rng() * 0.25));
      transform.rotation.set((rng() - 0.5) * 0.24, rng() * Math.PI * 2, (rng() - 0.5) * 0.27);
      transform.updateMatrix();
      blooms.setMatrixAt(index, transform.matrix);
    }
    blooms.receiveShadow = true;
    patch.add(blooms);
  }
  return { time, update(seconds: number) { time.value = seconds; } };
}
