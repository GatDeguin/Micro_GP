import * as THREE from 'three';
import { diquePlanPoint, type Course } from '../shared/courses';
import { box, canvas2d, noiseField, random, standard, texture } from './materials';
import { DIQUE_GROUND, diquePart, diquePlane, diqueRoadClear } from './dique-geometry';

type PlanPoint = readonly [number, number];

const meadow = [[28, 90], [31, 79], [38, 72], [50, 71], [54, 75], [62, 68], [67, 74], [71, 86],
  [72, 101], [69, 113], [73, 131], [69, 139], [61, 145], [48, 145], [39, 139], [32, 130], [28, 115]] as const;
const hill = [[79, 29], [86, 23], [102, 21], [120, 19], [151, 22], [171, 27], [175, 33], [168, 40],
  [155, 44], [134, 45], [106, 44], [91, 43], [82, 37]] as const;
const embankment = [[102, 77], [113, 78], [123, 88], [129, 97], [119, 100], [112, 96], [104, 91]] as const;
const yards = [
  [[124, 77], [139, 65], [160, 61], [196, 58], [215, 60], [244, 68], [248, 81], [247, 100], [225, 104],
    [203, 99], [193, 89], [169, 86], [161, 98], [151, 102], [141, 97], [135, 91]],
  [[105, 129], [118, 121], [135, 124], [148, 130], [165, 130], [181, 124], [203, 122], [216, 125], [221, 135],
    [218, 145], [204, 148], [187, 146], [164, 145], [140, 144], [120, 142], [104, 140]],
] as const;

function polygon(points: readonly PlanPoint[]) {
  return points.map(([x, z]) => { const p = diquePlanPoint(x, z); return new THREE.Vector2(p.x, p.z); });
}

function patch(parent: THREE.Group, outline: readonly THREE.Vector2[], material: THREE.Material, lift: number, scale: number) {
  const geometry = diquePlane(outline);
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, position.getX(i) / scale, position.getZ(i) / scale);
  diquePart(parent, geometry, material).position.y = DIQUE_GROUND + lift;
}

function field() {
  const { canvas, context } = canvas2d(320, 320);
  const pixels = context.createImageData(320, 320);
  const rng = random(23414);
  const moss = noiseField(10, 13, rng);
  const blade = noiseField(107, 175, rng);
  for (let y = 0; y < 320; y++) for (let x = 0; x < 320; x++) {
    const weather = moss(x / 320, y / 320);
    const growth = THREE.MathUtils.smoothstep(weather, 0.44, 0.67);
    const grain = (blade(x / 320, y / 320) - 0.5) * 28 + 10 * (rng() - 0.5);
    const index = (y * 320 + x) * 4;
    pixels.data[index] = 104 - 47 * growth + grain;
    pixels.data[index + 1] = 104 - 22 * growth + grain;
    pixels.data[index + 2] = 94 - 49 * growth + grain * 0.76;
    pixels.data[index + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  const map = texture(canvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshStandardMaterial({
    map, bumpMap: map, bumpScale: 0.091, roughness: 0.97,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
  });
}

function contains(points: readonly THREE.Vector2[], x: number, z: number) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    if ((a.y > z) !== (b.y > z) && x < a.x + (b.x - a.x) * (z - a.y) / (b.y - a.y)) inside = !inside;
  }
  return inside;
}

function loadYards(parent: THREE.Group, concrete: THREE.MeshStandardMaterial) {
  const pavement = concrete.clone();
  pavement.color.setHex(0x6d7470);
  pavement.bumpScale = 0.033;
  const aperture = standard(0x555852, 0.89);
  const seal = standard(0xaa985e, 0.94);
  const cream = standard(0xa6a798, 0.95);
  const paint = (ax: number, az: number, bx: number, bz: number, material: THREE.Material, width = 0.13) => {
    const a = diquePlanPoint(ax, az);
    const b = diquePlanPoint(bx, bz);
    const mark = box(parent, material, (a.x + b.x) / 2, DIQUE_GROUND + 0.034, (a.z + b.z) / 2,
      width, 0.013, Math.hypot(b.x - a.x, b.z - a.z), false);
    mark.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
  };
  for (const shape of yards) patch(parent, polygon(shape), pavement, 0.021, 9.6);
  for (const z of [71, 79, 87]) {
    paint(196.0, z, 240.5, z, cream, 0.096);
    for (const x of [196, 208, 219.5, 231.0, 240.5]) paint(x, z - 1.1, x, z + 1.1, seal, 0.114);
  }
  for (const x of [139.0, 150.2, 161.4, 172.6, 183.8, 195.0]) {
    paint(x, 136.5, x + 6.5, 136.5, seal, 0.115);
    paint(x, 142.4, x + 6.5, 142.4, seal, 0.115);
    paint(x, 136.5, x, 142.4, seal, 0.114);
  }
  for (const [x, z, width] of [[210.8, 92.7, 35.0], [166.3, 139.1, 57.0], [138.5, 78.8, 18.0]]) {
    const q = diquePlanPoint(x, z);
    box(parent, aperture, q.x, DIQUE_GROUND + 0.031, q.z, width, 0.009, 0.16, false);
  }
  for (let i = 0; i < 9; i++) {
    const x = 223.0 + i * 2.2;
    paint(x, 94.1, x - 0.72, 98.1, seal, 0.117);
  }
}

function plants(parent: THREE.Group, course: Course, islands: readonly (readonly THREE.Vector2[])[]) {
  const rng = random(7213);
  const bark = standard(0x5a5544, 0.96);
  const greens = [0x4c5940, 0x657047, 0x566347, 0x747754, 0x565f48];
  const stones = [0x676a68, 0x74746a, 0x8c8370, 0x565b49];
  const leaves: { x: number; y: number; z: number; size: number; tint: number }[] = [];
  const rocks: { x: number; z: number; size: number; tint: number }[] = [];
  const grove = [[38, 100], [61, 134], [59, 96], [67, 112], [65, 85], [89, 35],
    [113, 36], [152, 39], [162, 34], [112, 88]] as const;
  for (let i = 0; i < grove.length; i++) {
    const [x, z] = grove[i];
    const q = diquePlanPoint(x, z);
    if (!diqueRoadClear(course, q.x, q.z, 1.53)) continue;
    const height = 1.35 + rng() * 1.31;
    const trunk = box(parent, bark, q.x, DIQUE_GROUND + height / 2, q.z, 0.12, height, 0.14);
    trunk.rotation.z = 0.14 * (rng() - 0.5);
    for (let j = 0; j < 5; j++) {
      const angle = j * Math.PI * 2 / 5;
      leaves.push({ x: q.x + Math.cos(angle) * 0.52, y: DIQUE_GROUND + height + rng() * 0.67,
        z: q.z + Math.sin(angle) * 0.54, size: 0.65 + rng() * 0.46, tint: greens[(i + j) % greens.length] });
    }
  }
  const pockets = [[38, 84, 6.0, 4.0, 18], [49, 94, 12.0, 9.0, 34], [64, 111, 7.5, 11.0, 37],
    [55, 137, 13.0, 8.0, 47], [65, 78, 4.6, 6.0, 25], [93, 29, 8.0, 6.4, 22],
    [114, 25, 12.0, 7.0, 23], [159, 31, 10.0, 7.0, 23], [113, 87, 5.2, 8.0, 25]];
  for (const [x, z, rx, rz, count] of pockets) {
    const center = diquePlanPoint(x, z);
    for (let i = 0; i < count; i++) {
      const angle = rng() * Math.PI * 2;
      const spread = Math.sqrt(rng());
      const dx = center.x + Math.cos(angle) * rx * spread;
      const dz = center.z + Math.sin(angle) * rz * spread;
      if (!islands.some(outline => contains(outline, dx, dz)) || !diqueRoadClear(course, dx, dz, 0.74)) continue;
      if (i % 3 === 0) rocks.push({ x: dx, z: dz, size: 0.35 + rng() * 0.91, tint: stones[(i + count) % stones.length] });
      else leaves.push({ x: dx, y: DIQUE_GROUND + 0.13, z: dz, size: 0.16 + rng() ** 1.8 * 0.56, tint: greens[i % greens.length] });
    }
  }

  const make = (entries: readonly { x: number; y?: number; z: number; size: number; tint: number }[], stones: boolean) => {
    const geometry = new THREE.DodecahedronGeometry(1, 0);
    const material = standard(0xffffff, stones ? 0.91 : 0.96);
    const batch = new THREE.InstancedMesh(geometry, material, entries.length);
    const point = new THREE.Object3D();
    const color = new THREE.Color();
    entries.forEach(({ x, y, z, size, tint }, i) => {
      point.position.set(x, y ?? DIQUE_GROUND + size * 0.23, z);
      point.rotation.set(rng() * 1.2, rng() * Math.PI * 2, rng());
      point.scale.set(size * (0.82 + rng() * 0.41), size * (stones ? 0.61 : 0.81), size * (0.82 + rng() * 0.38));
      point.updateMatrix();
      batch.setMatrixAt(i, point.matrix);
      batch.setColorAt(i, color.setHex(tint));
    });
    batch.receiveShadow = true;
    batch.computeBoundingSphere();
    parent.add(batch);
  };
  make(leaves, false);
  make(rocks, true);
}

export function buildDiqueLandscape(parent: THREE.Group, course: Course, concrete: THREE.MeshStandardMaterial) {
  const islands = [meadow, hill, embankment].map(polygon);
  const grass = field();
  for (const outline of islands) patch(parent, outline, grass, 0.028, 16.2);
  loadYards(parent, concrete);
  plants(parent, course, islands);
}
