import * as THREE from 'three';
import { diquePlanPoint, type Course } from '../shared/courses';
import { box, canvas2d, horizontalShadow, random, standard, texture } from './materials';
import { instanceStatic } from './batches';
import { sceneryLights } from './render-layers';
import { DIQUE_GROUND, diqueBeam, diqueEdge, diquePart, diqueRoadClear, diqueSign, diqueSpan, diqueStrip } from './dique-geometry';

const galvanized = standard(0x747b7c, 0.49, 0.58);
const iron = standard(0x414949, 0.69, 0.47);
const zinc = standard(0x9c9b8d, 0.47, 0.51);
const rubber = standard(0x242627, 0.90);
const oxide = standard(0x934b34, 0.78, 0.28);
const blue = standard(0x315b6d, 0.58, 0.35);
const amber = standard(0xc99637, 0.63, 0.36);
const oak = standard(0x9d7953, 0.84);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 14);
const tire = new THREE.TorusGeometry(0.67, 0.16, 7, 18);
const lifeRing = new THREE.TorusGeometry(0.52, 0.102, 6, 20);

function round(parent: THREE.Object3D, material: THREE.Material, x: number, y: number, z: number, radius: number, height: number, casts = false) {
  const mesh = diquePart(parent, cylinder, material, casts);
  mesh.position.set(x, y, z);
  mesh.scale.set(radius, height, radius);
  return mesh;
}

function dockLabel(parent: THREE.Object3D, title: string, subtitle: string, width: number, z: number, y: number) {
  const map = diqueSign(subtitle === '' ? [title] : [title, subtitle], '#343835', '#e4d5ac', '#938268');
  const label = diquePart(parent, new THREE.PlaneGeometry(width, width / 3.35), new THREE.MeshStandardMaterial({ map, roughness: 0.70 }));
  label.position.set(0, y, z);
}

function poolMaterial(streaks = false) {
  const { canvas, context } = canvas2d(64, 64);
  const glaze = context.createRadialGradient(32, 32, 1, 32, 32, 32);
  glaze.addColorStop(0, streaks ? 'rgba(255,181,91,.53)' : 'rgba(255,181,91,.84)');
  glaze.addColorStop(0.40, streaks ? 'rgba(254,143,53,.26)' : 'rgba(254,143,53,.49)');
  glaze.addColorStop(1, 'rgba(220,111,25,0)');
  context.fillStyle = glaze;
  context.fillRect(0, 0, 64, 64);
  if (streaks) {
    const rng = random(5256);
    for (let i = 0; i < 130; i++) {
      const angle = rng() * Math.PI * 2;
      const radius = Math.sqrt(rng()) * 27;
      const x = 32 + Math.cos(angle) * radius;
      const y = 32 + Math.sin(angle) * radius * 0.78;
      const alpha = (1 - radius / 29) * (0.2 + rng() * 0.59);
      context.fillStyle = `rgba(255,204,141,${alpha})`;
      context.fillRect(x, y, 0.8 + rng() * 4.1, 0.32 + rng() * 0.72);
    }
  }
  return new THREE.MeshBasicMaterial({ map: texture(canvas), transparent: true, depthWrite: false,
    opacity: 0.29, blending: THREE.AdditiveBlending });
}

function barrel(parent: THREE.Object3D, material: THREE.Material, x: number, y: number, z: number) {
  round(parent, material, x, y + 0.365, z, 0.271, 0.73, true);
  for (const lift of [0.094, 0.365, 0.636]) round(parent, material, x, y + lift, z, 0.282, 0.043);
  round(parent, iron, x, y + 0.731, z, 0.253, 0.017);
}

function pallet(parent: THREE.Object3D, x: number, y: number, z: number) {
  for (const shift of [-0.39, 0, 0.39]) box(parent, oak, x + shift, y + 0.064, z, 0.13, 0.12, 0.88, false);
  for (const shift of [-0.38, -0.19, 0, 0.19, 0.38]) box(parent, oak, x, y + 0.147, z + shift, 1.12, 0.071, 0.139, false);
}

function tirePile(parent: THREE.Object3D, x: number, y: number, z: number, height: number) {
  for (let i = 0; i < height; i++) {
    const wheel = diquePart(parent, tire, rubber);
    wheel.position.set(x + Math.sin(i) * 0.038, y + 0.097 + i * 0.18, z);
    wheel.scale.set(0.55, 0.55, 0.58);
    wheel.rotation.x = Math.PI / 2;
  }
}

function grateMaterial() {
  const { canvas, context } = canvas2d(64, 64);
  context.strokeStyle = '#a5a9a1';
  context.lineWidth = 2.4;
  for (let i = -64; i < 128; i += 16) {
    context.beginPath();
    context.moveTo(i, 0);
    context.lineTo(i + 64, 64);
    context.moveTo(i, 0);
    context.lineTo(i - 64, 64);
    context.stroke();
  }
  const map = texture(canvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(7, 2);
  return new THREE.MeshStandardMaterial({ map, color: 0xb5b3a1, metalness: 0.25, roughness: 0.72, alphaTest: 0.36,
    side: THREE.DoubleSide });
}

function boxServiceFence(parent: THREE.Group, course: Course, material: THREE.Material) {
  for (const [s, face, ring] of [[course.pit.stalls[0] - 9, -1, true], [course.pit.stalls[3] + 9, 1, false]] as const) {
    const road = course.sampleAt(s);
    const at = diqueEdge(course, road, course.pit.stationOffset - 3.52);
    if (!diqueRoadClear(course, at.x, at.z + 0.77, 2.28)) continue;
    const fence = new THREE.Group();
    fence.position.set(at.x, DIQUE_GROUND, at.z + 0.77);
    fence.rotation.y = Math.atan2(-road.dz, road.dx);
    parent.add(fence);
    diquePart(fence, new THREE.PlaneGeometry(5.12, 1.62), material).position.y = 1.08;
    for (const x of [-2.61, -0.06, 2.61]) box(fence, galvanized, x, 1.08, 0, 0.12, 1.79, 0.12, false);
    for (const y of [0.27, 1.96]) box(fence, zinc, 0, y, 0, 5.25, 0.062, 0.063, false);
    if (ring) {
      const red = standard(0xbc392c, 0.56, 0.08);
      diquePart(fence, lifeRing, red).position.set(-0.83, 1.28, 0.14);
      for (const angle of [0, 2.094, 4.188]) {
        const tape = box(fence, zinc, -0.83 + Math.cos(angle) * 0.52, 1.28 + Math.sin(angle) * 0.52, 0.226,
          0.18, 0.12, 0.028, false);
        tape.rotation.z = angle;
      }
    }
    for (const x of [-1.36, -0.54, 0.21]) barrel(fence, face < 0 ? blue : oxide, x + face * 3.45, 0, -1.36);
  }
}

function garageFloor() {
  const { canvas, context } = canvas2d(512, 256);
  const rng = random(4292);
  const stain = context.createRadialGradient(263, 142, 4, 263, 142, 189);
  stain.addColorStop(0, 'rgba(30,31,29,.46)');
  stain.addColorStop(1, 'rgba(31,30,28,0)');
  context.fillStyle = stain;
  context.fillRect(0, 0, 512, 256);
  for (const x of [164, 328]) {
    for (let i = 0; i < 142; i++) {
      context.fillStyle = rng() > 0.28 ? 'rgba(35,34,31,.12)' : 'rgba(158,143,119,.16)';
      context.fillRect(x + (rng() - 0.5) * 30, 32 + rng() * 190, 0.6 + rng() * 4, 1 + rng() * 21);
    }
  }
  context.fillStyle = 'rgba(208,171,106,.53)';
  for (const x of [31, 474]) context.fillRect(x, 28, 4, 177);
  context.fillStyle = 'rgba(151,143,122,.39)';
  for (const y of [35, 212]) context.fillRect(41, y, 431, 1);
  return new THREE.MeshStandardMaterial({
    map: texture(canvas), roughness: 0.63, metalness: 0.13, transparent: true, depthWrite: false,
  });
}

function garage(parent: THREE.Group, course: Course, concrete: THREE.Material, where: number, number: number,
  light: THREE.Material, pool: THREE.Material, bounce: THREE.Material, shadow: THREE.Material,
  floorFinish: THREE.Material, model?: THREE.Object3D) {
  const p = course.sampleAt(where);
  const q = diqueEdge(course, p, course.pit.stationOffset - 3.35);
  const bay = new THREE.Group();
  bay.name = `Box ${number}`;
  bay.position.set(q.x, DIQUE_GROUND, q.z);
  bay.rotation.y = Math.atan2(-p.dz, p.dx);
  parent.add(bay);
  const width = model ? 12.55 : 9.75;
  const depth = 5.8;
  const finish = diquePart(bay, new THREE.PlaneGeometry(width - 1.1, 5.72).rotateX(-Math.PI / 2), floorFinish);
  finish.position.set(0, model ? 0.913 : 0.948, -0.029);
  dockLabel(bay, `BOX ${String(number).padStart(2, '0')}`, '', 2.40, 3.043, 4.119);
  const glow = diquePart(bay, new THREE.PlaneGeometry(width - 1.18, 5.62).rotateX(-Math.PI / 2), pool);
  glow.position.set(0, model ? 0.924 : 0.957, 1.45);
  diquePart(bay, new THREE.PlaneGeometry(10.5, 3.35), bounce).position.set(0, 2.25, -2.58);
  box(bay, iron, 0.09, 3.12, -2.556, 2.19, 0.127, 0.18, false);
  box(bay, light, 0.09, 3.04, -2.536, 1.96, 0.053, 0.113, false);
  for (const side of [-1, 1]) {
    const jamb = diquePart(bay, new THREE.PlaneGeometry(4.1, 2.68).rotateY(side * -Math.PI / 2), bounce);
    jamb.position.set(side * (model ? 5.20 : 4.29), 2.65, 1.55);
    box(bay, iron, side * 4.93, 0.93, 3.17, 0.24, 0.15, 0.12, false);
    round(bay, amber, side * 4.93, 1.18, 3.17, 0.074, 0.56);
  }
  if (number % 2 === 0) {
    round(bay, oxide, -4.50, 1.20, 2.53, 0.15, 0.57);
    round(bay, iron, -4.50, 1.49, 2.53, 0.10, 0.071);
  }
  const floorContact = diquePart(bay, new THREE.PlaneGeometry(width + 0.5, depth + 0.9).rotateX(-Math.PI / 2), shadow);
  floorContact.position.set(0, 0.014, -0.17);
  if (model) {
    bay.add(model.clone(true));
    return;
  }
  box(bay, concrete, 0, 0.45, 0, width, 0.90, depth + 1.1);
  box(bay, iron, 0, 0.915, 0.04, 8.98, 0.044, depth + 0.39, false);
  box(bay, concrete, 0, 2.70, -2.79, width, 3.72, 0.40);
  for (const side of [-1, 1]) {
    box(bay, concrete, side * 4.59, 2.61, 0, 0.57, 3.47, depth);
    box(bay, zinc, side * 4.23, 2.48, 2.82, 0.09, 3.10, 0.23);
    box(bay, oxide, side * 4.35, 1.21, 3.07, 0.29, 0.64, 0.34);
  }
  box(bay, concrete, 0, 4.16, 2.83, width, 0.58, 0.39);
  box(bay, galvanized, 0, 3.77, 2.71, 8.58, 0.34, 0.134, false);
  for (let x = -4.75; x <= 4.76; x += 0.22) {
    const ridge = box(bay, galvanized, x, 4.535, 0, 0.10, 0.13, depth + 0.60, false);
    ridge.rotation.x = -0.04;
  }
  box(bay, iron, 0, 4.44, 0, width + 0.14, 0.16, depth + 0.54).rotation.x = -0.04;
  box(bay, galvanized, 0, 4.36, 3.12, width + 0.17, 0.13, 0.24, false);
  box(bay, iron, 0, 3.64, 2.48, 2.35, 0.17, 0.34, false);
  box(bay, light, 0, 3.55, 2.48, 2.20, 0.055, 0.22, false);
  box(bay, oxide, -3.0, 1.43, -1.50, 1.50, 1.01, 1.04);
  for (const y of [1.20, 1.45, 1.71]) box(bay, zinc, -3.0, y, -0.97, 1.10, 0.042, 0.04, false);
  for (const x of [-2.25, 2.35]) box(bay, iron, x, 1.31, -2.30, 0.15, 0.81, 0.23);
  box(bay, oak, 0.21, 1.68, -2.30, 4.66, 0.16, 0.71);
  for (const x of [-0.72, 0.16, 1.74]) box(bay, x < 1 ? iron : oxide, x, 1.82, -2.35, 0.39, 0.14 + x * 0.08, 0.19, false);
  barrel(bay, number % 2 ? blue : oxide, 3.58, 0.94, -1.50);
  tirePile(bay, 3.58, 0.94, 0.40, 4);
  tirePile(bay, 2.75, 0.94, -0.21, 3);
}

const cargoPaint = new WeakMap<THREE.MeshStandardMaterial, THREE.MeshStandardMaterial>();
let cargoWear: THREE.CanvasTexture | undefined;

function wornCargoPaint(base: THREE.MeshStandardMaterial) {
  const cached = cargoPaint.get(base);
  if (cached) return cached;
  if (!cargoWear) {
    const { canvas, context } = canvas2d(256, 112);
    const wear = random(804);
    const glaze = context.createLinearGradient(0, 0, 0, 112);
    glaze.addColorStop(0, '#f5eee2');
    glaze.addColorStop(0.26, '#d9d0c4');
    glaze.addColorStop(0.72, '#f1e8d6');
    glaze.addColorStop(1, '#aba092');
    context.fillStyle = glaze;
    context.fillRect(0, 0, 256, 112);
    for (let i = 0; i < 290; i++) {
      const x = wear() * 256;
      const y = i % 3 === 0 ? wear() * 112 : (i % 2 ? 104 - wear() * 17 : wear() * 21);
      context.fillStyle = i % 4 ? 'rgba(118,82,59,.24)' : 'rgba(71,53,41,.38)';
      context.fillRect(x, y, 1 + wear() ** 2 * 8, 0.4 + wear() ** 3 * 9);
    }
    for (let i = 0; i < 64; i++) {
      context.fillStyle = 'rgba(255,243,219,.25)';
      context.fillRect(2 + wear() * 252, 3 + wear() * 106, 1 + wear() ** 2 * 12, 0.83);
    }
    cargoWear = texture(canvas);
  }
  const finish = base.clone();
  finish.map = cargoWear;
  finish.name = 'Pintura de contenedor erosionada en los cantos';
  cargoPaint.set(base, finish);
  return finish;
}

export function containerShell(paint: THREE.MeshStandardMaterial) {
  const cargo = new THREE.Group();
  const material = wornCargoPaint(paint);
  const width = 8.0;
  const depth = 3.0;
  const height = 2.65;
  box(cargo, material, 0, height / 2, 0, width, height, depth);
  for (const side of [-1, 1]) {
    box(cargo, iron, 0, 0.083, side * 1.52, width + 0.04, 0.11, 0.14, false);
    box(cargo, material, 0, height - 0.068, side * 1.53, width + 0.04, 0.13, 0.127, false);
    for (let x = -3.77; x < 3.89; x += 0.238) {
      box(cargo, material, x, height / 2, side * 1.524, 0.104, height - 0.22, 0.111, false);
    }
    for (const z of [-1.43, 1.43]) box(cargo, zinc, side * 4.014, height / 2, z, 0.116, height, 0.092, false);
  }
  for (let x = -3.79; x < 3.93; x += 0.25) box(cargo, material, x, height + 0.023, 0, 0.093, 0.052, depth - 0.21, false);
  for (const z of [-0.84, -0.26, 0.26, 0.84]) {
    box(cargo, zinc, 4.055, height / 2, z, 0.076, height - 0.23, 0.038, false);
    box(cargo, iron, 4.083, 1.02, z + 0.098, 0.035, 0.052, 0.26, false);
  }
  return cargo;
}

function shippingContainer(parent: THREE.Group, x: number, z: number, yaw: number, material: THREE.MeshStandardMaterial, stacked = false) {
  const cargo = containerShell(material);
  cargo.position.set(x, DIQUE_GROUND + (stacked ? 2.67 : 0), z);
  cargo.rotation.y = yaw;
  parent.add(cargo);
}

function containers(parent: THREE.Group, course: Course) {
  const rng = random(74149);
  const stacks = [[173, 88, -0.19, blue], [155, 133, -0.04, oxide], [194, 123, 0.11, blue],
    [201.5, 132.6, -0.06, oxide], [125.2, 130.0, -0.19, blue], [52.6, 68.7, 0, blue],
    [169.1, 67, -0.12, oxide], [166, 74, -0.07, blue], [184.1, 65.8, -0.11, amber],
    [212, 71, 0.03, blue], [221.6, 76, 0.14, oxide], [138, 127, -0.08, blue],
    [197.5, 62.5, -0.12, oxide], [233.8, 75.6, 0.03, blue], [197, 79, 0.12, blue],
    [104, 132.7, -0.12, oxide], [121, 119.6, 0.16, blue], [151.5, 30.8, -0.07, blue]] as const;
  for (const [i, [x, z, yaw, color]] of stacks.entries()) {
    const anchor = diquePlanPoint(x, z);
    if (!diqueRoadClear(course, anchor.x, anchor.z, 4.35)) continue;
    shippingContainer(parent, anchor.x, anchor.z, yaw, color);
    if ([4, 7, 12, 13].includes(i)) {
      shippingContainer(parent, anchor.x + 0.15, anchor.z + 0.038, yaw + 0.018, i % 3 === 0 ? amber : blue, true);
    }
    for (let j = 0; j < 4; j++) {
      const x = anchor.x + (j - 2) * 0.67 + (i % 2 ? 5.21 : -4.31);
      const z = anchor.z + 1.91 + rng() * 0.54;
      if (diqueRoadClear(course, x, z, 0.45)) barrel(parent, [blue, amber, oxide][(i + j) % 3], x, DIQUE_GROUND, z);
    }
    pallet(parent, anchor.x - 4.97, DIQUE_GROUND, anchor.z - 1.51);
  }
}

function serviceYards(parent: THREE.Group, course: Course, concrete: THREE.Material) {
  const rng = random(44611);
  const stations = [[45, 83], [58, 109], [102, 33], [154, 41], [130, 81],
    [158, 78], [207, 74], [226.5, 96.5], [174, 133], [219, 129]] as const;
  for (const [i, [x, z]] of stations.entries()) {
    const at = diquePlanPoint(x, z);
    if (!diqueRoadClear(course, at.x, at.z, 3.75)) continue;
    const yard = new THREE.Group();
    yard.position.set(at.x, DIQUE_GROUND, at.z);
    yard.rotation.y = 0.06 * (rng() - 0.5);
    if ((i === 6 || i === 7 || i === 9) && diqueRoadClear(course, at.x, at.z, 5.05)) {
      yard.scale.setScalar(1.31);
    }
    parent.add(yard);
    box(yard, concrete, 0, 0.076, 0, 5.80, 0.15, 4.35, false);
    for (let j = 0; j < 4; j++) barrel(yard, [oxide, blue, iron][(j + i) % 3],
      (j - 1.50) * 0.68, 0.15, -1.42 + 0.14 * rng());
    const stack = 1 + i % 3;
    for (let j = 0; j < stack; j++) {
      pallet(yard, -1.54 + j * 1.31, 0.15, 0.83);
      box(yard, j % 2 ? iron : oak, -1.54 + j * 1.31, 0.63, 0.83, 0.98, 0.58, 0.78);
    }
    const cable = round(yard, iron, 1.82, 0.68, 0.49, 0.48, 0.84);
    cable.rotation.z = Math.PI * 0.5;
    for (const x of [1.38, 2.25]) round(yard, oak, x, 0.69, 0.49, 0.64, 0.094).rotation.z = Math.PI * 0.5;
    for (let j = 0; j < 3; j++) {
      box(yard, zinc, -2.67 + j * 2.64, 0.65, -1.94, 0.097, 1.03, 0.105, false);
    }
    for (const y of [0.46, 0.78, 1.10]) box(yard, iron, 0, y, -1.94, 5.36, 0.036, 0.027, false);
  }
}

function craneFallback(parent: THREE.Group) {
  const steel = standard(0xcb8a24, 0.55, 0.49);
  const window = standard(0x34494a, 0.32, 0.32);
  const pin = standard(0xa89d7f, 0.48, 0.51);
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      diqueBeam(parent, steel, new THREE.Vector3(side * 3.0, 0.19, end * 2.2),
        new THREE.Vector3(side * 1.69, 3.36, end * 1.37), 0.43, 0.43);
      box(parent, iron, side * 3, 0.10, end * 2.20, 1.11, 0.20, 1.24);
    }
    diqueBeam(parent, steel, new THREE.Vector3(side * 3, 0.95, -2.20), new THREE.Vector3(side * 2, 2.95, 1.72), 0.16, 0.16);
  }
  box(parent, steel, 0, 3.45, 0, 4.65, 0.51, 3.30);
  round(parent, iron, 0, 3.85, -0.21, 1.64, 0.40, true);
  box(parent, steel, 0.06, 5.03, -0.53, 2.90, 2.04, 2.65);
  box(parent, steel, 0.06, 6.07, -0.53, 3.12, 0.18, 2.85);
  box(parent, window, 0.22, 5.34, 0.81, 2.25, 0.93, 0.052, false);
  box(parent, steel, 0.22, 5.34, 0.846, 0.13, 0.94, 0.05, false);
  const base = new THREE.Vector3(-0.47, 5.25, -0.03);
  const tip = new THREE.Vector3(-0.47, 12.73, 9.37);
  for (const side of [-1, 1]) {
    for (const height of [0, 0.83]) {
      diqueBeam(parent, steel, base.clone().add(new THREE.Vector3(side * 0.63, height, 0)),
        tip.clone().add(new THREE.Vector3(side * 0.23, height * 0.5, 0)), 0.17, 0.16);
    }
    for (let i = 0; i < 9; i++) {
      const a = base.clone().lerp(tip, i / 9);
      const b = base.clone().lerp(tip, (i + 1) / 9);
      a.x += side * THREE.MathUtils.lerp(0.63, 0.23, i / 9);
      b.x += side * THREE.MathUtils.lerp(0.63, 0.23, (i + 1) / 9);
      (i % 2 ? a : b).y += THREE.MathUtils.lerp(0.83, 0.42, i / 9);
      diqueBeam(parent, steel, a, b, 0.099, 0.102);
    }
  }
  const hooks = [tip.clone().add(new THREE.Vector3(0, -0.03, -0.18)), tip.clone().add(new THREE.Vector3(0, -0.03, 0.18))];
  for (const top of hooks) {
    const end = top.clone();
    end.y = 4.22;
    diqueBeam(parent, iron, top, end, 0.04, 0.034, false);
  }
  box(parent, steel, tip.x, 4.27, tip.z, 0.50, 0.48, 0.57);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.046, 6, 12, Math.PI * 1.62), pin);
  hook.position.set(tip.x, 3.89, tip.z);
  parent.add(hook);
}

function craneSite(parent: THREE.Group, course: Course, concrete: THREE.Material, lamp: THREE.Material, pool: THREE.MeshBasicMaterial) {
  const { x, z } = diquePlanPoint(233, 134.0);
  const base = new THREE.Group();
  base.name = 'Grúa del muelle';
  base.position.set(x, DIQUE_GROUND, z);
  parent.add(base);
  const pad = new THREE.CylinderGeometry(6.68, 6.96, 0.75, 26);
  diquePart(base, pad, concrete, true).position.y = 0.36;
  const foundation = standard(0x66635a, 0.84, 0.03);
  round(base, foundation, 0, 0.743, 0, 5.54, 0.058);
  const puddle = new THREE.MeshPhysicalMaterial({ color: 0x243641, roughness: 0.22, clearcoat: 0.86,
    clearcoatRoughness: 0.14, transparent: true, opacity: 0.63, depthWrite: false,
    alphaMap: pool.map, polygonOffset: true, polygonOffsetFactor: -1 });
  for (const [x, z, w, h] of [[4.1, 2.14, 1.65, 1.1], [-3.1, 3.1, 1.65, 0.79], [-2.4, -2.1, 2.9, 0.92]]) {
    const slick = diquePart(base, new THREE.CircleGeometry(1, 13).rotateX(-Math.PI / 2), puddle);
    slick.position.set(x, 0.786, z);
    slick.scale.set(w, 1, h);
  }
  const profile = new THREE.Shape();
  profile.moveTo(-0.40, 0);
  profile.lineTo(0.40, 0);
  profile.lineTo(0.40, 0.21);
  profile.lineTo(0.22, 0.90);
  profile.lineTo(-0.22, 0.90);
  profile.lineTo(-0.40, 0.21);
  profile.closePath();
  const barrier = new THREE.ExtrudeGeometry(profile, { depth: 1.66, bevelEnabled: true, bevelSegments: 1,
    bevelSize: 0.044, bevelThickness: 0.039, curveSegments: 3 }).translate(0, 0, -0.83);
  const concreteBarrier = standard(0xb6aa95, 0.81, 0.01);
  for (let i = 0; i < 14; i++) {
    if (i === 8 || i === 9) continue;
    const angle = i * Math.PI * 2 / 14 + 0.17;
    const offsetX = Math.cos(angle) * 6.78;
    const offsetZ = Math.sin(angle) * 6.78;
    if (!diqueRoadClear(course, x + offsetX, z + offsetZ, 0.96)) continue;
    const block = diquePart(base, barrier, i % 3 === 1 ? concrete : concreteBarrier, true);
    block.position.set(offsetX, 0.02, offsetZ);
    block.rotation.y = -angle;
  }
  const crane = new THREE.Group();
  crane.name = 'Grúa de celosía';
  crane.position.y = 0.78;
  crane.rotation.y = 1.90;
  crane.scale.set(1.16, 1.72, 1.10);
  base.add(crane);
  const placeholder = new THREE.Group();
  crane.add(placeholder);
  craneFallback(placeholder);
  round(base, iron, 4.91, 1.10, 3.63, 0.26, 0.90);
  round(base, lamp, 4.91, 1.57, 3.63, 0.23, 0.12);
  diquePart(base, new THREE.PlaneGeometry(5.4, 4.3).rotateX(-Math.PI / 2), pool).position.set(4.73, 0.796, 2.72);
  const plate = new THREE.Group();
  plate.position.set(3.2, 0.98, 4.98);
  base.add(plate);
  box(plate, iron, 0, 0.075, -0.036, 2.44, 0.63, 0.109, false);
  dockLabel(plate, 'GRÚA', 'MUELLE', 2.36, 0.03, 0.075);
  return { crane, placeholder };
}

function pumpingStation(parent: THREE.Group, concrete: THREE.Material, glass: THREE.Material, pool: THREE.Material) {
  const { x, z } = diquePlanPoint(225, 27.5);
  const house = new THREE.Group();
  house.position.set(x, DIQUE_GROUND, z);
  house.rotation.y = -0.08;
  parent.add(house);
  box(house, concrete, 0, 2.19, 0, 28.8, 4.38, 13.70);
  box(house, galvanized, 0, 4.42, 0, 29.02, 0.19, 13.89);
  for (let x = -12.95; x <= 13; x += 4.3) {
    box(house, concrete, x, 2.22, 6.91, 0.37, 4.42, 0.42);
    for (const y of [0.4, 2.44]) box(house, iron, x + 0.65, y, 6.866, 0.36, 0.51, 0.057, false);
  }
  const shed = new THREE.Group();
  shed.position.set(0, 1.09, -0.21);
  house.add(shed);
  box(shed, concrete, -3.04, 4.86, -0.57, 11.54, 2.99, 5.82);
  for (let x = -8.73; x < 2.75; x += 0.37) box(shed, galvanized, x, 4.89, 2.348, 0.095, 2.86, 0.073, false);
  box(shed, iron, -3.04, 6.53, -0.67, 12.20, 0.33, 6.41).rotation.x = -0.10;
  for (let x = -8.94; x < 2.93; x += 0.218) box(shed, blue, x, 6.69, -0.67, 0.107, 0.12, 6.37, false).rotation.x = -0.10;
  for (const x of [-6.68, -3.83]) {
    box(shed, iron, x, 4.82, 2.45, 2.18, 1.39, 0.10, false);
    box(shed, glass, x, 4.84, 2.532, 1.97, 1.19, 0.041, false);
    for (const divider of [-0.30, 0.31]) box(shed, iron, x + divider, 4.84, 2.555, 0.052, 1.18, 0.045, false);
    box(shed, iron, x, 4.82, 2.555, 1.97, 0.065, 0.045, false);
  }
  box(shed, iron, -0.66, 4.52, 2.45, 1.64, 2.35, 0.15, false);
  box(shed, zinc, -0.18, 4.37, 2.55, 0.17, 0.052, 0.041, false);
  const sign = new THREE.Group();
  sign.position.x = 7.33;
  house.add(sign);
  dockLabel(sign, 'VERTEDERO', 'CONTROL DE COMPUERTAS', 5.32, 7.131, 2.85);
  const stairStart = 1.18;
  const stairEnd = 12.67;
  const stairDepth = 7.92;
  box(house, iron, stairStart - 1.33, 4.41, stairDepth - 0.43, 2.78, 0.22, 2.92);
  for (let i = 0; i < 18; i++) {
    box(house, amber, stairStart + i * (stairEnd - stairStart) / 17, 4.38 - i * 0.247, stairDepth, 0.72, 0.105, 1.72, false);
  }
  for (const edge of [-1, 1]) {
    const z = stairDepth + edge * 0.88;
    diqueBeam(house, iron, new THREE.Vector3(stairStart, 4.25, z), new THREE.Vector3(stairEnd, -0.04, z), 0.105, 0.18);
    diqueBeam(house, amber, new THREE.Vector3(stairStart, 5.52, z), new THREE.Vector3(stairEnd, 1.24, z), 0.088, 0.087);
    for (let i = 0; i < 5; i++) {
      box(house, amber, THREE.MathUtils.lerp(stairStart, stairEnd, i / 4), 5.0 - i * 1.045, z, 0.094, 1.02, 0.091, false);
    }
  }
  for (const x of [-14.1, -11, -8, -5, -2, 4, 7, 10, 14.1]) {
    box(house, galvanized, x, 5.0, 6.59, 0.12, 1.15, 0.11, false);
  }
  for (const y of [4.80, 5.53]) {
    box(house, iron, -8.0, y, 6.59, 12.20, 0.075, 0.077, false);
    box(house, iron, 8.8, y, 6.59, 10.7, 0.075, 0.077, false);
  }
  for (const x of [3.0, 5.9, 8.8]) barrel(house, x > 7 ? oxide : blue, x, 4.51, -3.55);
  for (const x of [-11.8, -10.9, -9.98]) barrel(house, x < -11 ? oxide : blue, x, 0.055, 7.79);
  pallet(house, -0.25, 4.54, 4.29);
  const upperGlow = diquePart(house, new THREE.PlaneGeometry(12.0, 7.4).rotateX(-Math.PI / 2), pool);
  upperGlow.position.set(-4.23, 4.535, 3.18);
  const wallGlow = diquePart(house, new THREE.PlaneGeometry(15.4, 4.08), pool);
  wallGlow.position.set(-5.5, 2.13, 7.124);
}

function brakingBoard(parent: THREE.Group, course: Course, distance: number, side: number, text: string, note: string) {
  const p = course.sampleAt(distance);
  const offset = side * (course.wallHalfAt(distance, side) + 0.99);
  const q = diqueEdge(course, p, offset);
  const stand = new THREE.Group();
  stand.position.copy(q);
  stand.rotation.y = Math.atan2(-p.dx, -p.dz);
  parent.add(stand);
  box(stand, iron, 0, 0.70, 0, 0.085, 1.40, 0.096);
  box(stand, iron, 0, 1.49, 0, 1.63, 0.53, 0.098);
  const map = diqueSign(note ? [text, note] : [text], '#cca458', '#252925');
  const face = diquePart(stand, new THREE.PlaneGeometry(1.57, 0.50), new THREE.MeshStandardMaterial({ map, roughness: 0.79 }));
  face.position.set(0, 1.49, 0.052);
}

function lights(parent: THREE.Group, course: Course) {
  const glass = new THREE.MeshStandardMaterial({ color: 0xffde92, emissive: 0xffa94c, emissiveIntensity: 1.65, roughness: 0.38 });
  const glow = poolMaterial(true);
  const halo = new THREE.SpriteMaterial({ color: 0xffc08c, map: poolMaterial().map, blending: THREE.AdditiveBlending,
    transparent: true, opacity: 0.28, depthWrite: false });
  const poles: THREE.SpotLight[] = [];
  const stations = [[4, 1], [44, 1], [92, 1], [136, -1], [171, 1], [238, 1], [279, -1],
    [325, -1], [395, 1], [445, 1], [494, -1], [555, -1], [644, -1], [692, 1], [735, -1]] as const;
  for (const [i, [s, side]] of stations.entries()) {
    const p = course.sampleAt(s);
    const margin = side * (course.wallHalfAt(s, side) + 1.25);
    const q = diqueEdge(course, p, margin);
    const foot = q.y > 1 ? q.y - 0.11 : DIQUE_GROUND;
    const tall = i === 3 || i === 4 || i === 7 || i === 8 || i === 10 || i === 12;
    const height = tall ? 7.55 : 5.36;
    const postTop = foot + height;
    const yaw = Math.atan2(p.x - q.x, p.z - q.z);
    box(parent, iron, q.x, foot + 0.13, q.z, 0.93, 0.30, 0.82);
    const tower = new THREE.Group();
    tower.position.set(q.x, foot, q.z);
    tower.rotation.y = yaw;
    parent.add(tower);
    if (tall) {
      for (const x of [-0.16, 0.16]) box(tower, amber, x, height / 2, 0, 0.081, height, 0.108);
      for (let rung = 0.48; rung < height - 0.35; rung += 0.62) {
        box(tower, amber, 0, rung, 0.008, 0.34, 0.059, 0.086, false);
        const brace = box(tower, galvanized, 0, rung + 0.31, 0.012, 0.046, 0.68, 0.048, false);
        brace.rotation.z = Math.floor(rung / 0.62) % 2 ? 0.42 : -0.42;
      }
    } else box(tower, amber, 0, height / 2, 0, 0.19, height, 0.15);
    const head = new THREE.Group();
    head.position.set(q.x, postTop, q.z);
    head.rotation.set(-0.38, yaw, 0, 'YXZ');
    head.scale.setScalar(tall ? 1.54 : 1.29);
    parent.add(head);
    box(head, iron, 0, 0, 0, 1.46, 0.68, 0.22);
    for (const y of [-0.155, 0.155]) for (const x of [-0.44, 0, 0.44]) {
      box(head, zinc, x, y, 0.129, 0.39, 0.26, 0.081, false);
      box(head, glass, x, y, 0.173, 0.31, 0.194, 0.045, false);
    }
    // Sample across the wrap near the finish, with an asymmetric footprint under the lens.
    const poolLength = tall ? 14.2 : 10.4;
    const from = s - poolLength * 0.43;
    const to = from + poolLength;
    const samples = from < 0 ? Array.from({ length: 31 }, (_, j) => ({ ...course.sampleAt(from + j * poolLength / 30), s: from + j * poolLength / 30 }))
      : diqueSpan(course, from, to);
    const projection = (p: typeof samples[number], sign: number) => diqueEdge(course, p, sign * course.roadHalfAt(p.s), 0.018);
    const floor = diqueStrip(samples, p => projection(p, -1), p => projection(p, 1), 'longitudinal');
    const uv = floor.getAttribute('uv');
    for (let j = 0; j < uv.count; j++) {
      const downtrack = (samples[Math.floor(j / 2)].s - from) / poolLength;
      uv.setXY(j, downtrack + (j % 2 ? -0.08 : 0.08) * side, j % 2 ? 0.93 : 0.07);
    }
    diquePart(parent, floor, glow);
    if (i === 0 || i === 4 || i === 7 || i === 10 || i === 12) {
      const haze = new THREE.Sprite(halo);
      haze.position.set(0, 0.01, 0.29);
      haze.scale.set(2.6, 1.12, 1);
      head.add(haze);
      const actual = new THREE.SpotLight(0xffb267, 21, 14.4, 0.58, 0.75, 2);
      actual.position.set(q.x, postTop, q.z);
      actual.target.position.copy(diqueEdge(course, p, -0.42 * side));
      actual.layers.set(sceneryLights);
      parent.add(actual, actual.target);
      poles.push(actual);
    }
  }
  return { poles, glow, halo, bulb: glass };
}

export function buildDiqueProps(parent: THREE.Group, course: Course, concrete: THREE.Material, garageModel?: THREE.Object3D) {
  const lamp = new THREE.MeshStandardMaterial({ color: 0xffd59b, emissive: 0xf99335, emissiveIntensity: 1.25, roughness: 0.52 });
  const { poles, glow, halo, bulb } = lights(parent, course);
  const garageGlow = poolMaterial();
  const wallBounce = garageGlow.clone();
  wallBounce.color.setHex(0xe9d0b2);
  wallBounce.opacity = 0.40;
  const shadow = horizontalShadow();
  const floorFinish = garageFloor();
  const service = new THREE.Group();
  parent.add(service);
  course.pit.stalls.forEach((s, i) => garage(service, course, concrete, s, i + 1, lamp, garageGlow, wallBounce, shadow, floorFinish, garageModel));
  boxServiceFence(service, course, grateMaterial());
  if (garageModel) instanceStatic(service);
  const crane = craneSite(parent, course, concrete, lamp, garageGlow);
  containers(parent, course);
  serviceYards(parent, course, concrete);
  pumpingStation(parent, concrete, lamp, garageGlow);
  for (const [s, side, text, note] of [[125, 1, '100', 'GRÚA'], [141, 1, '50', 'GRÚA'],
    [222, 1, 'CHICANA', 'CONTENEDORES'], [335, -1, 'PUENTE', 'NIVEL ALTO'], [476, 1, 'FRENÁ', 'VERTEDERO'],
    [574, -1, 'TÚNEL', 'CARRIL BAJO'], [640, 1, 'MALECÓN', 'DOS CURVAS'], [20, -1, 'BOXES', 'DESPACIO']] as const) {
    brakingBoard(parent, course, s, side, text, note);
  }
  return {
    ...crane,
    setNight(enabled: boolean) {
      for (const light of poles) light.intensity = enabled ? 181 : 81;
      glow.opacity = enabled ? 0.83 : 0.56;
      garageGlow.opacity = enabled ? 0.95 : 0.75;
      wallBounce.opacity = enabled ? 0.57 : 0.33;
      halo.opacity = enabled ? 0.52 : 0.29;
      bulb.emissiveIntensity = enabled ? 4.2 : 2.8;
      lamp.emissiveIntensity = enabled ? 3.35 : 2.26;
    },
  };
}
