import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { diquePlanPoint, diqueRoadDistance, type Course } from '../shared/courses';
import { box, random, standard } from './materials';
import { DIQUE_GROUND, diqueBeam, diqueEdge, diquePart, diquePlane, diqueRoadClear } from './dique-geometry';

type PlanPoint = readonly [number, number];

const yards = [
  [[124, 77], [139, 65], [160, 61], [196, 58], [215, 60], [244, 68], [248, 81], [247, 100], [225, 104],
    [203, 99], [193, 89], [169, 86], [161, 98], [151, 102], [141, 97], [135, 91]],
  [[105, 129], [118, 121], [135, 124], [148, 130], [165, 130], [181, 124], [203, 122], [216, 125], [221, 135],
    [218, 145], [204, 148], [187, 146], [164, 145], [140, 144], [120, 142], [104, 140]],
  [[80, 33], [95, 24], [122, 22], [153, 24], [173, 29], [171, 37], [155, 42], [127, 43], [101, 42], [90, 39]],
  [[31, 104], [34, 91], [44, 89], [53, 93], [59, 109], [59, 129], [53, 138], [38, 135], [32, 123]],
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

function loadYards(parent: THREE.Group, concrete: THREE.MeshStandardMaterial) {
  const pavement = concrete.clone();
  pavement.color.setHex(0x9b9991);
  pavement.bumpScale = 0.033;
  const aperture = standard(0x444643, 0.76, 0.25);
  const seal = standard(0xc3a165, 0.87);
  const cream = standard(0xbdb7a6, 0.94);
  const paint = (ax: number, az: number, bx: number, bz: number, material: THREE.Material, width = 0.13) => {
    const a = diquePlanPoint(ax, az);
    const b = diquePlanPoint(bx, bz);
    const mark = box(parent, material, (a.x + b.x) / 2, DIQUE_GROUND + 0.034, (a.z + b.z) / 2,
      width, 0.013, Math.hypot(b.x - a.x, b.z - a.z), false);
    mark.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
  };
  for (const shape of yards) patch(parent, polygon(shape), pavement, 0.021, 13.2);
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

function serviceApron(parent: THREE.Group, course: Course, concrete: THREE.MeshStandardMaterial) {
  const { x, z } = diquePlanPoint(43, 110);
  if (!diqueRoadClear(course, x, z, 12.35)) return;
  const apron = new THREE.Group();
  apron.name = 'Patio de inspección al oeste del canal';
  apron.position.set(x, DIQUE_GROUND, z);
  parent.add(apron);
  const steel = standard(0x3e4e57, 0.68, 0.31);
  const rust = standard(0x756350, 0.80, 0.19);
  const amber = standard(0xaa803d, 0.70, 0.34);
  const slab = concrete.clone();
  slab.color.setHex(0xa49d8e);
  for (const offset of [-7.2, 0, 7.2]) {
    box(apron, slab, 0, 0.20, offset, 9.80, 0.40, 7.14);
    box(apron, concrete, -5.35, 0.11, offset, 0.87, 0.22, 7.14);
  }
  box(apron, steel, -2.24, 0.413, -0.48, 0.94, 0.027, 18.71, false);
  for (let i = 0; i < 18; i++) {
    box(apron, rust, -2.24, 0.438, -9.18 + i, 0.80, 0.022, 0.105, false);
  }
  for (const offset of [-8.0, -2.67, 2.67, 8.0]) {
    box(apron, rust, 3.55, 0.55, offset, 0.72, 0.32, 0.38, false);
    box(apron, amber, 4.34, 0.88, offset, 0.075, 0.96, 0.075, false);
  }
  const pipe = new THREE.CylinderGeometry(0.21, 0.21, 1, 10).rotateX(Math.PI * 0.5);
  const cap = new THREE.CylinderGeometry(0.27, 0.27, 0.17, 10).rotateX(Math.PI * 0.5);
  for (const x of [3.30, 3.78]) {
    const main = diquePart(apron, pipe, steel, false);
    main.position.set(x, 0.81, -0.32);
    main.scale.z = 19.20;
    for (const z of [-9.78, -5.10, 1.87, 7.94, 9.16]) diquePart(apron, cap, rust, false).position.set(x, 0.81, z);
  }
  for (const y of [0.86, 1.33]) {
    diqueBeam(apron, amber, new THREE.Vector3(4.34, y, -8.0), new THREE.Vector3(4.34, y, 8.0), 0.058, 0.056, false);
  }
  box(apron, concrete, -0.55, 0.67, -7.51, 2.1, 0.53, 2.75);
  box(apron, steel, -0.55, 0.962, -7.51, 1.91, 0.095, 2.5, false);
}

function serviceStations(parent: THREE.Group, course: Course, concrete: THREE.MeshStandardMaterial) {
  const steel = standard(0x485b62, 0.63, 0.44);
  const black = standard(0x373c3d, 0.71, 0.22);
  const ochre = standard(0xc79340, 0.69, 0.20);
  const iron = standard(0x6a6458, 0.66, 0.45);
  const red = standard(0x873b33, 0.78, 0.19);
  const timber = standard(0x856745, 0.86);
  const tube = new THREE.CylinderGeometry(1, 1, 1, 12);
  const makeCylinder = (group: THREE.Group, material: THREE.Material, x: number, y: number, z: number,
    radius: number, height: number) => {
    const drum = diquePart(group, tube, material);
    drum.position.set(x, y, z);
    drum.scale.set(radius, height, radius);
    return drum;
  };
  const amber = new THREE.MeshStandardMaterial({
    color: 0xffd28c, emissive: 0xffa344, emissiveIntensity: 1.9, roughness: 0.44,
  });
  const footing = (x: number, z: number, safeRadius: number, name: string) => {
    const q = diquePlanPoint(x, z);
    if (!diqueRoadClear(course, q.x, q.z, safeRadius)) return;
    const station = new THREE.Group();
    station.name = name;
    station.position.set(q.x, DIQUE_GROUND, q.z);
    parent.add(station);
    return station;
  };

  const workshop = footing(35, 30, 8.35, 'Banco de repuestos y pórtico del oeste');
  if (workshop) {
    workshop.rotation.y = -0.13;
    box(workshop, concrete, 0, 0.20, 0, 12.8, 0.40, 8.20);
    box(workshop, concrete, 0, 0.08, 4.28, 10.9, 0.16, 0.94);
    for (const x of [-4.65, 4.65]) {
      box(workshop, iron, x, 0.49, -0.48, 1.21, 0.19, 1.74, false);
      box(workshop, steel, x, 2.25, -0.48, 0.33, 3.45, 0.36);
      box(workshop, steel, x, 0.67, -0.48, 0.81, 0.21, 0.92, false);
      diqueBeam(workshop, steel, new THREE.Vector3(x, 2.94, -0.48), new THREE.Vector3(x * 0.69, 3.89, -0.48),
        0.14, 0.13);
    }
    box(workshop, steel, 0, 4.12, -0.48, 9.97, 0.42, 0.47);
    box(workshop, iron, 0, 4.29, -0.48, 10.08, 0.095, 0.74, false);
    box(workshop, ochre, 0.77, 3.82, -0.45, 0.73, 0.28, 0.54, false);
    box(workshop, iron, 0.77, 3.18, -0.45, 0.055, 1.03, 0.058, false);
    box(workshop, ochre, 0.77, 2.52, -0.45, 0.36, 0.25, 0.27, false);
    for (const x of [-3.91, -1.11, 3.41]) {
      box(workshop, timber, x, 0.50, 1.89, 1.84, 0.18, 1.42, false);
      box(workshop, x < -2 ? red : steel, x, 1.11, 1.89, 1.67, 1.08, 1.21);
      box(workshop, iron, x, 1.48, 2.5, 1.57, 0.11, 0.045, false);
      box(workshop, iron, x, 1.23, 2.51, 0.43, 0.07, 0.05, false);
    }
    for (const [i, x] of [-4.42, -3.06, -1.58, 2.08, 3.73, 5.26].entries()) {
      makeCylinder(workshop, i % 2 ? steel : red, x, 0.94, -2.52, 0.48, 1.02);
      for (const y of [0.61, 1.26]) makeCylinder(workshop, iron, x, y, -2.52, 0.50, 0.05);
    }
    for (const x of [-5.1, -2.6, 0, 2.6, 5.1]) {
      box(workshop, steel, x, 1.02, -3.57, 0.087, 1.24, 0.095, false);
    }
    for (const y of [0.82, 1.27, 1.64]) box(workshop, iron, 0, y, -3.57, 10.29, 0.045, 0.038, false);
  }

  const hydraulics = footing(132, 31, 8.3, 'Colector de válvulas de la meseta');
  if (hydraulics) {
    hydraulics.rotation.y = 0.10;
    box(hydraulics, concrete, 0, 0.35, 0, 13.0, 0.70, 7.18);
    for (const [i, x] of [-3.25, 0, 3.25].entries()) {
      box(hydraulics, black, x, 0.82, 0, 1.97, 0.25, 2.21, false);
      makeCylinder(hydraulics, steel, x, 1.59, 0, 0.78, 1.48);
      makeCylinder(hydraulics, iron, x, 2.36, 0, 0.84, 0.16);
      makeCylinder(hydraulics, i === 1 ? red : ochre, x, 2.51, 0, 0.49, 0.17);
      const stem = makeCylinder(hydraulics, steel, x, 1.61, 1.08, 0.20, 1.62);
      stem.rotation.x = Math.PI / 2;
      const flange = makeCylinder(hydraulics, iron, x, 1.61, 1.79, 0.36, 0.12);
      flange.rotation.x = Math.PI / 2;
    }
    const collector = makeCylinder(hydraulics, steel, 0, 1.38, 1.91, 0.31, 9.09);
    collector.rotation.z = Math.PI / 2;
    for (const x of [-4.29, 4.29]) {
      const collar = makeCylinder(hydraulics, iron, x, 1.38, 1.91, 0.41, 0.16);
      collar.rotation.z = Math.PI / 2;
      box(hydraulics, ochre, x, 1.29, 2.75, 0.095, 1.16, 0.094, false);
    }
    for (const y of [1.16, 1.83]) box(hydraulics, ochre, 0, y, 2.75, 8.63, 0.053, 0.046, false);
    box(hydraulics, steel, -4.88, 1.43, -1.95, 1.20, 1.46, 1.36);
    box(hydraulics, iron, -4.88, 2.18, -1.94, 1.34, 0.11, 1.43, false);
    box(hydraulics, amber, -4.88, 1.77, -1.25, 0.62, 0.077, 0.038, false);
    for (let i = 0; i < 4; i++) {
      const h = 0.16 * (i + 1);
      box(hydraulics, concrete, 5.45, h / 2, 4.76 - i * 0.35, 1.49, h, 0.37);
    }
  }
}

function wetAprons(parent: THREE.Group, course: Course) {
  const rng = random(33216);
  const wet = new THREE.MeshPhysicalMaterial({
    color: 0x7b8289, roughness: 0.27, metalness: 0.10, clearcoat: 0.85, clearcoatRoughness: 0.21,
    vertexColors: true, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
  });
  const pools: THREE.BufferGeometry[] = [];
  for (const [x, z, length, width] of [[34, 132, 3.45, 1.21], [58, 134, 3.48, 1.15],
    [94, 38, 4.17, 1.00], [160, 44, 2.85, 1.08], [174, 71, 3.69, 1.83], [215, 63, 4.82, 1.49],
    [237, 82, 4.99, 1.60], [179, 142, 3.61, 1.15], [151, 136, 3.32, 1.22], [125, 137, 3.69, 1.92]]) {
    const center = diquePlanPoint(x, z);
    if (!diqueRoadClear(course, center.x, center.z, Math.max(length, width) + 0.52)) continue;
    const outline = Array.from({ length: 10 }, (_, i) => {
      const angle = i / 10 * Math.PI * 2;
      const edge = 0.52 + rng() * 0.48;
      return new THREE.Vector2(Math.cos(angle) * length * edge, Math.sin(angle) * width * edge);
    });
    const level = DIQUE_GROUND + 0.029;
    const positions = [center.x, level, center.z];
    const colors = [0.86, 0.91, 0.99, 0.55];
    const indices: number[] = [];
    const rings = [[0.48, 0.47], [0.78, 0.18], [1, 0]];
    for (const [ringIndex, [span, opacity]] of rings.entries()) {
      for (const [i, point] of outline.entries()) {
        positions.push(center.x + point.x * span, level, center.z + point.y * span);
        colors.push(0.86, 0.91, 0.99, opacity);
        const at = 1 + ringIndex * outline.length + i;
        const next = 1 + ringIndex * outline.length + (i + 1) % outline.length;
        if (ringIndex === 0) indices.push(0, next, at);
        else indices.push(at - outline.length, next - outline.length, at,
          next - outline.length, next, at);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    pools.push(geometry);
  }
  const surface = pools.length > 0 ? mergeGeometries(pools) : undefined;
  for (const pool of pools) pool.dispose();
  if (surface) diquePart(parent, surface, wet, false, 'Humedad y charcos sobre el hormigón');
}

type GroundAccent = { x: number; y?: number; z: number; size: number; tint: number };

function plants(parent: THREE.Group, course: Course) {
  const rng = random(7213);
  const greens = [0x454f32, 0x616444, 0x716d45, 0x505840, 0x68664d];
  const stones = [0x65665f, 0x6e6b5c, 0x948979, 0x565a4f];
  const leaves: GroundAccent[] = [];
  const rocks: GroundAccent[] = [];
  const pockets = [[29, 87], [35, 90], [51, 90], [54, 96], [60, 107], [60, 130], [53, 139], [41, 136], [31, 126],
    [82, 36], [94, 24], [106, 24], [124, 24], [147, 26], [162, 29], [167, 38], [153, 44], [116, 42],
    [131, 77], [148, 66], [215, 60], [243, 79], [222, 99], [121, 127], [150, 139], [193, 148], [209, 143]];
  for (const [x, z] of pockets) {
    const center = diquePlanPoint(x, z);
    for (let i = 0; i < 7; i++) {
      const dx = center.x + (rng() - 0.5) * 2.65;
      const dz = center.z + (rng() - 0.5) * 0.96;
      const size = 0.12 + rng() * 0.50;
      if (!diqueRoadClear(course, dx, dz, size * 1.35)) continue;
      const target = i > 1 ? leaves : rocks;
      const palette = i > 1 ? greens : stones;
      target.push({ x: dx, z: dz, size, tint: palette[Math.floor(rng() * palette.length)] });
    }
  }
  for (const at of [414, 422, 435, 442, 455, 463, 475, 482, 490]) {
    const s = diqueRoadDistance(at);
    const p = course.sampleAt(s);
    const offset = course.wallHalfAt(s, 1) + 1.73;
    for (let i = 0; i < 6; i++) {
      const slide = (rng() - 0.5) * 1.70;
      const q = diqueEdge(course, p, offset + rng() * 0.54);
      const x = q.x + p.dx * slide;
      const z = q.z + p.dz * slide;
      if (diqueRoadClear(course, x, z, 0.72)) {
        leaves.push({ x, y: DIQUE_GROUND + (Math.hypot(x - p.x, z - p.z) < offset + 0.10 ? 0.36 : 0.07), z,
          size: 0.16 + rng() * 0.31, tint: greens[i % greens.length] });
      }
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
      point.scale.set(size * (0.82 + rng() * 0.41), size * (stones ? 0.61 : 0.38), size * (0.72 + rng() * 0.38));
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
  loadYards(parent, concrete);
  serviceApron(parent, course, concrete);
  serviceStations(parent, course, concrete);
  wetAprons(parent, course);
  plants(parent, course);
}
