import * as THREE from 'three';
import { diquePlanPoint, type Course } from '../shared/courses';
import { box, canvas2d, horizontalShadow, random, standard, texture } from './materials';
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

function poolMaterial() {
  const { canvas, context } = canvas2d(64, 64);
  const glaze = context.createRadialGradient(32, 32, 1, 32, 32, 32);
  glaze.addColorStop(0, 'rgba(255,178,81,.62)');
  glaze.addColorStop(0.45, 'rgba(240,136,48,.29)');
  glaze.addColorStop(1, 'rgba(220,111,25,0)');
  context.fillStyle = glaze;
  context.fillRect(0, 0, 64, 64);
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

function garage(parent: THREE.Group, course: Course, concrete: THREE.Material, where: number, number: number,
  light: THREE.Material, pool: THREE.Material, shadow: THREE.Material) {
  const p = course.sampleAt(where);
  const q = diqueEdge(course, p, course.pit.stationOffset - 3.35);
  const bay = new THREE.Group();
  bay.name = `Box ${number}`;
  bay.position.set(q.x, DIQUE_GROUND, q.z);
  bay.rotation.y = Math.atan2(-p.dz, p.dx);
  parent.add(bay);
  const width = 9.75;
  const depth = 5.8;
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
  dockLabel(bay, `BOX ${String(number).padStart(2, '0')}`, '', 2.40, 3.043, 4.169);
  const glow = diquePart(bay, new THREE.PlaneGeometry(8.02, 6.58).rotateX(-Math.PI / 2), pool);
  glow.position.set(0, 0.957, 0.73);
  const floorContact = diquePart(bay, new THREE.PlaneGeometry(width + 0.7, depth + 0.9).rotateX(-Math.PI / 2), shadow);
  floorContact.position.set(0, 0.014, -0.17);
  box(bay, oxide, -3.0, 1.43, -1.50, 1.50, 1.01, 1.04);
  for (const y of [1.20, 1.45, 1.71]) box(bay, zinc, -3.0, y, -0.97, 1.10, 0.042, 0.04, false);
  for (const x of [-2.25, 2.35]) box(bay, iron, x, 1.31, -2.30, 0.15, 0.81, 0.23);
  box(bay, oak, 0.21, 1.68, -2.30, 4.66, 0.16, 0.71);
  for (const x of [-0.72, 0.16, 1.74]) box(bay, x < 1 ? iron : oxide, x, 1.82, -2.35, 0.39, 0.14 + x * 0.08, 0.19, false);
  barrel(bay, number % 2 ? blue : oxide, 3.58, 0.94, -1.50);
  tirePile(bay, 3.58, 0.94, 0.40, 4);
  tirePile(bay, 2.75, 0.94, -0.21, 3);
}

function shippingContainer(parent: THREE.Group, x: number, z: number, yaw: number, material: THREE.Material, stacked = false) {
  const cargo = new THREE.Group();
  cargo.position.set(x, DIQUE_GROUND + (stacked ? 2.67 : 0), z);
  cargo.rotation.y = yaw;
  parent.add(cargo);
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
}

function containers(parent: THREE.Group, course: Course) {
  const rng = random(74149);
  const stacks = [[176, 90, -0.19, blue], [158, 125, -0.04, oxide], [194, 123, 0.11, blue],
    [201.5, 132.6, -0.06, oxide], [123.0, 128.0, -0.24, blue], [52.6, 68.7, 0, blue],
    [169.1, 67, -0.12, oxide], [168, 75, 0.11, blue], [190, 66.8, -0.33, amber]] as const;
  for (const [i, [x, z, yaw, color]] of stacks.entries()) {
    const anchor = diquePlanPoint(x, z);
    if (!diqueRoadClear(course, anchor.x, anchor.z, 4.35)) continue;
    shippingContainer(parent, anchor.x, anchor.z, yaw, color);
    if (i === 4 || i === 7) shippingContainer(parent, anchor.x + 0.15, anchor.z + 0.038, yaw + 0.018, i === 4 ? oxide : blue, true);
    for (let j = 0; j < 4; j++) {
      const x = anchor.x + (j - 2) * 0.67 + (i % 2 ? 5.21 : -4.31);
      const z = anchor.z + 1.91 + rng() * 0.54;
      if (diqueRoadClear(course, x, z, 0.45)) barrel(parent, [blue, amber, oxide][(i + j) % 3], x, DIQUE_GROUND, z);
    }
    pallet(parent, anchor.x - 4.97, DIQUE_GROUND, anchor.z - 1.51);
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

function craneSite(parent: THREE.Group, course: Course, concrete: THREE.Material, lamp: THREE.Material) {
  const { x, z } = diquePlanPoint(233, 134.0);
  const base = new THREE.Group();
  base.name = 'Grúa del muelle';
  base.position.set(x, DIQUE_GROUND, z);
  parent.add(base);
  const pad = new THREE.CylinderGeometry(6.68, 6.96, 0.75, 26);
  diquePart(base, pad, concrete, true).position.y = 0.36;
  round(base, iron, 0, 0.743, 0, 5.08, 0.058);
  for (let i = 0; i < 11; i++) {
    const angle = i * Math.PI * 2 / 11 + 0.17;
    const offsetX = Math.cos(angle) * 6.78;
    const offsetZ = Math.sin(angle) * 6.78;
    if (!diqueRoadClear(course, x + offsetX, z + offsetZ, 0.68)) continue;
    box(base, concrete, offsetX, 0.29, offsetZ, 0.72, 0.59, 1.57).rotation.y = -angle;
  }
  const crane = new THREE.Group();
  crane.name = 'Grúa de celosía';
  crane.position.y = 0.78;
  crane.rotation.y = -1.25;
  crane.scale.setScalar(1.10);
  base.add(crane);
  const placeholder = new THREE.Group();
  crane.add(placeholder);
  craneFallback(placeholder);
  round(base, iron, 4.91, 1.10, 3.63, 0.26, 0.90);
  round(base, lamp, 4.91, 1.57, 3.63, 0.23, 0.12);
  const plate = new THREE.Group();
  plate.position.set(3.2, 0.98, 4.98);
  base.add(plate);
  box(plate, iron, 0, 0.075, -0.036, 2.44, 0.63, 0.109, false);
  dockLabel(plate, 'GRÚA', 'MUELLE', 2.36, 0.03, 0.075);
  return { crane, placeholder };
}

function pumpingStation(parent: THREE.Group, concrete: THREE.Material, glass: THREE.Material) {
  const { x, z } = diquePlanPoint(135.6, 32.9);
  const house = new THREE.Group();
  house.position.set(x, DIQUE_GROUND, z);
  house.rotation.y = -0.08;
  parent.add(house);
  box(house, concrete, 0, 1.64, 0, 22.6, 3.26, 11.95);
  box(house, galvanized, 0, 3.32, 0, 22.86, 0.18, 12.13);
  box(house, concrete, -3.04, 4.86, -0.57, 11.54, 2.99, 5.82);
  box(house, iron, -3.04, 6.53, -0.67, 12.20, 0.33, 6.41).rotation.x = -0.10;
  for (let x = -8.94; x < 2.93; x += 0.187) box(house, galvanized, x, 6.69, -0.67, 0.096, 0.12, 6.37, false).rotation.x = -0.10;
  for (const x of [-6.68, -3.83]) {
    box(house, iron, x, 4.82, 2.38, 2.18, 1.39, 0.10, false);
    box(house, glass, x, 4.84, 2.445, 1.97, 1.19, 0.041, false);
    for (const divider of [-0.30, 0.31]) box(house, iron, x + divider, 4.84, 2.473, 0.052, 1.18, 0.045, false);
  }
  box(house, iron, -0.66, 4.52, 2.42, 1.64, 2.35, 0.15, false);
  const sign = new THREE.Group();
  sign.position.x = 6.33;
  house.add(sign);
  dockLabel(sign, 'VERTEDERO', 'CONTROL DE COMPUERTAS', 5.32, 6.067, 2.50);
  for (let i = 0; i < 15; i++) box(house, amber, 3.3 + i * 0.44, 3.23 - i * 0.215, 4.1, 0.56, 0.105, 1.53, false);
  for (const edge of [-1, 1]) {
    diqueBeam(house, amber, new THREE.Vector3(3.17, 4.17, 4.1 + edge * 0.76), new THREE.Vector3(9.69, 1.18, 4.1 + edge * 0.76), 0.088, 0.087);
    for (let i = 0; i < 4; i++) box(house, amber, 3.3 + i * 2.08, 3.71 - i * 1.018, 4.1 + edge * 0.76, 0.094, 0.94, 0.091, false);
  }
  for (const x of [3.0, 5.9, 8.8]) barrel(house, x > 7 ? oxide : blue, x, 3.45, -3.55);
  pallet(house, -0.25, 3.41, 4.29);
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

interface LampState { poles: readonly THREE.SpotLight[]; glow: THREE.MeshBasicMaterial; bulb: THREE.MeshStandardMaterial }

function lights(parent: THREE.Group, course: Course): LampState {
  const glass = new THREE.MeshStandardMaterial({ color: 0xffde92, emissive: 0xffa94c, emissiveIntensity: 1.65, roughness: 0.38 });
  const glow = poolMaterial();
  const poles: THREE.SpotLight[] = [];
  const stations = [[4, 1], [44, 1], [92, 1], [136, -1], [171, 1], [238, 1], [279, -1],
    [325, -1], [395, 1], [445, 1], [494, -1], [555, -1], [644, -1], [692, 1], [735, -1]] as const;
  for (const [i, [s, side]] of stations.entries()) {
    const p = course.sampleAt(s);
    const margin = side * (course.wallHalfAt(s, side) + 1.25);
    const q = diqueEdge(course, p, margin);
    const foot = q.y > 1 ? q.y - 0.11 : DIQUE_GROUND;
    const height = (i % 3 === 1 ? 5.45 : 4.68) + (q.y < 0.6 ? 0.25 : 0);
    const postTop = foot + height;
    const yaw = Math.atan2(p.x - q.x, p.z - q.z);
    box(parent, iron, q.x, foot + 0.13, q.z, 0.81, 0.30, 0.82);
    box(parent, amber, q.x, foot + height / 2, q.z, 0.12, height, 0.14);
    const head = new THREE.Group();
    head.position.set(q.x, postTop, q.z);
    head.rotation.set(-0.38, yaw, 0, 'YXZ');
    parent.add(head);
    box(head, iron, 0, 0, 0, 1.46, 0.68, 0.22);
    for (const y of [-0.155, 0.155]) for (const x of [-0.44, 0, 0.44]) {
      box(head, zinc, x, y, 0.129, 0.39, 0.26, 0.081, false);
      box(head, glass, x, y, 0.173, 0.31, 0.194, 0.045, false);
    }
    // Use a wrapped high-resolution strip for the fixture beside the finish line.
    const samples = s < 5.6 ? Array.from({ length: 29 }, (_, j) => ({ ...course.sampleAt(s - 5.6 + j * 0.4), s: s - 5.6 + j * 0.4 }))
      : diqueSpan(course, s - 5.6, s + 5.6);
    const projection = (p: typeof samples[number], sign: number) => diqueEdge(course, p, sign * course.roadHalfAt(p.s), 0.018);
    const floor = diqueStrip(samples, p => projection(p, -1), p => projection(p, 1), 'longitudinal');
    const uv = floor.getAttribute('uv');
    for (let j = 0; j < uv.count; j++) uv.setX(j, (samples[Math.floor(j / 2)].s - s) / 11.2 + 0.5);
    diquePart(parent, floor, glow);
    if (i === 0 || i === 4 || i === 7 || i === 10 || i === 12) {
      const actual = new THREE.SpotLight(0xffb267, 21, 14.4, 0.58, 0.75, 2);
      actual.position.set(q.x, postTop, q.z);
      actual.target.position.copy(diqueEdge(course, p, 0.25 * side));
      actual.layers.set(sceneryLights);
      parent.add(actual, actual.target);
      poles.push(actual);
    }
  }
  return { poles, glow, bulb: glass };
}

export function buildDiqueProps(parent: THREE.Group, course: Course, concrete: THREE.Material) {
  const lamp = new THREE.MeshStandardMaterial({ color: 0xffd59b, emissive: 0xf99335, emissiveIntensity: 1.25, roughness: 0.52 });
  const { poles, glow, bulb } = lights(parent, course);
  const shadow = horizontalShadow();
  course.pit.stalls.forEach((s, i) => garage(parent, course, concrete, s, i + 1, lamp, glow, shadow));
  const crane = craneSite(parent, course, concrete, lamp);
  containers(parent, course);
  pumpingStation(parent, concrete, lamp);
  for (const [s, side, text, note] of [[125, 1, '100', 'GRÚA'], [141, 1, '50', 'GRÚA'],
    [222, 1, 'CHICANA', 'CONTENEDORES'], [335, -1, 'PUENTE', 'NIVEL ALTO'], [476, 1, 'FRENÁ', 'VERTEDERO'],
    [574, -1, 'TÚNEL', 'CARRIL BAJO'], [640, 1, 'MALECÓN', 'DOS CURVAS'], [20, -1, 'BOXES', 'DESPACIO']] as const) {
    brakingBoard(parent, course, s, side, text, note);
  }
  return {
    ...crane,
    setNight(enabled: boolean) {
      for (const light of poles) light.intensity = enabled ? 111 : 21;
      glow.opacity = enabled ? 0.82 : 0.29;
      bulb.emissiveIntensity = enabled ? 3.7 : 1.65;
      lamp.emissiveIntensity = enabled ? 3.05 : 1.25;
    },
  };
}
