import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { diquePlanPoint, type Course } from '../shared/courses';
import { mergeStatic } from './batches';
import { DIQUE_GROUND, diquePart, diqueRoadClear, diqueSign } from './dique-geometry';
import { containerShell } from './dique-props';
import { freightLane, sampleFreightTruck } from './dique-terminal-layout';
import { box, canvas2d, horizontalShadow, random, standard, texture } from './materials';

const steel = standard(0x747c79, 0.55, 0.57);
const coal = standard(0x333d3c, 0.76, 0.28);
const rubber = standard(0x282927, 0.94);
const cream = standard(0xb5ae8e, 0.62, 0.23);
const teal = standard(0x416a6b, 0.49, 0.44);
const canvasGreen = standard(0x666f50, 0.86, 0.03);
const yellow = standard(0xc49b52, 0.64, 0.18);
const oxide = standard(0x9b543e, 0.76, 0.27);
const drumBlue = standard(0x465f65, 0.68, 0.36);
const wood = standard(0x8d714b, 0.86);
const fender = new RoundedBoxGeometry(1, 1, 1, 2, 0.105);
const hub = new THREE.CylinderGeometry(1, 1, 1, 14).rotateX(Math.PI / 2);
const drum = new THREE.CylinderGeometry(1, 1, 1, 18);
const yardPlane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const tyre = new THREE.LatheGeometry([
  [0.39, -0.5], [0.82, -0.5], [0.96, -0.41], [1, -0.24], [1, 0.24],
  [0.96, 0.41], [0.82, 0.5], [0.39, 0.5], [0.39, -0.5],
].map(([x, y]) => new THREE.Vector2(x, y)), 22);
const floor = DIQUE_GROUND + 0.044;

function detailRubber() {
  if (rubber.map) return;
  const { canvas, context } = canvas2d(256, 64);
  context.fillStyle = '#8b8581';
  context.fillRect(0, 0, 256, 64);
  context.strokeStyle = '#4c4a47';
  context.lineWidth = 1.2;
  for (let x = -8; x < 256; x += 8) {
    context.beginPath();
    context.moveTo(x, 14);
    context.lineTo(x + 5, 31);
    context.lineTo(x + 1, 50);
    context.stroke();
  }
  context.fillStyle = '#635e59';
  for (const y of [23, 39]) context.fillRect(0, y, 256, 1);
  const map = texture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  rubber.map = map;
}

const lantern = (tint: number) => new THREE.MeshStandardMaterial({
  color: tint, emissive: tint, roughness: 0.33, emissiveIntensity: 0.24,
});

function rounded(parent: THREE.Group, material: THREE.Material, x: number, y: number, z: number,
  width: number, height: number, depth: number) {
  const part = diquePart(parent, fender, material);
  part.position.set(x, y, z);
  part.scale.set(width, height, depth);
  return part;
}

function barrelAt(parent: THREE.Group, paint: THREE.Material, x: number, y: number, z: number, radius = 0.28) {
  for (const [height, width, lift, material] of [[0.76, 1, 0.38, paint],
    [0.044, 1.07, 0.14, steel], [0.050, 1.07, 0.62, steel], [0.024, 1.045, 0.759, coal]] as const) {
    const cylinder = diquePart(parent, drum, material);
    cylinder.position.set(x, y + lift, z);
    cylinder.scale.set(radius * width, height, radius * width);
  }
  const bung = diquePart(parent, drum, steel);
  bung.position.set(x + 0.104, y + 0.781, z - 0.075);
  bung.scale.set(0.053, 0.027, 0.053);
}

function serviceTruck(group: THREE.Group, paint: THREE.Material, trailer: boolean) {
  const cab = new THREE.Group();
  group.add(cab);
  const low = lantern(0xffe1b0);
  const tail = lantern(0xbb4637);
  const backup = lantern(0xd3e1df);
  const top = lantern(0xffaf48);
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x3e535b, roughness: 0.29, metalness: 0.35, clearcoat: 0.58, clearcoatRoughness: 0.31,
  });
  const frameEnd = trailer ? -5.0 : -2.85;
  const chassisDepth = 2.27;
  box(cab, coal, (frameEnd + 2) / 2, 0.55, 0, 2 - frameEnd, 0.27, chassisDepth - 0.45, false);
  box(cab, steel, 1.93, 0.53, 0, 0.21, 0.24, chassisDepth, false);
  rounded(cab, paint, 1.05, 1.22, 0, 1.66, 0.92, chassisDepth);
  rounded(cab, paint, 0.97, 2.31, 0, 1.60, 0.24, chassisDepth);
  box(cab, paint, 0.24, 1.93, 0, 0.13, 0.73, chassisDepth - 0.15, false);
  const windshield = box(cab, glass, 1.66, 1.98, 0, 0.075, 0.65, 1.91, false);
  windshield.rotation.z = 0.155;
  box(cab, coal, 1.711, 1.98, 0, 0.022, 0.65, 0.043, false).rotation.z = 0.155;
  box(cab, coal, 1.881, 1.25, 0, 0.037, 0.54, 1.14, false);
  for (const y of [1.10, 1.22, 1.34, 1.46]) box(cab, steel, 1.902, y, 0, 0.027, 0.037, 1.07, false);
  for (const side of [-1, 1]) {
    box(cab, glass, 1.00, 1.96, side * 1.079, 1.15, 0.62, 0.049, false);
    box(cab, paint, 1.51, 1.96, side * 1.117, 0.072, 0.64, 0.054, false);
    box(cab, steel, 0.61, 1.58, side * 1.146, 0.22, 0.05, 0.033, false);
    box(cab, coal, 1.27, 0.58, side * 1.07, 0.71, 0.13, 0.38, false);
    box(cab, coal, 1.51, 2.03, side * 1.27, 0.063, 0.055, 0.35, false);
    box(cab, coal, 1.51, 2.02, side * 1.43, 0.10, 0.32, 0.17, false);
    box(cab, steel, 1.45, 2.02, side * 1.43, 0.033, 0.24, 0.124, false);
    box(cab, coal, 1.898, 0.94, side * 0.829, 0.071, 0.256, 0.28, false);
    box(cab, low, 1.941, 0.948, side * 0.827, 0.058, 0.157, 0.215, false);
    box(cab, tail, frameEnd - 0.021, 0.62, side * 0.92, 0.076, 0.13, 0.22, false);
    box(cab, backup, frameEnd - 0.034, 0.62, side * 0.70, 0.070, 0.112, 0.15, false);
    box(cab, steel, -0.42, 0.66, side * 0.85, 0.73, 0.26, 0.37, false);
  }
  box(cab, coal, 0.96, 2.474, 0, 0.35, 0.066, 0.63, false);
  box(cab, top, 0.96, 2.532, 0, 0.22, 0.074, 0.48, false);
  box(cab, cream, 1.901, 0.70, 0, 0.044, 0.103, 0.31, false);
  box(cab, steel, (frameEnd + 0.06) / 2, 0.868, 0, -frameEnd + 0.06, 0.14, chassisDepth, false);
  if (trailer) {
    const container = containerShell(oxide);
    container.position.set(-2.59, 0.94, 0);
    container.rotation.y = Math.PI;
    container.scale.set(0.599, 0.82, 0.747);
    cab.add(container);
    const marking = diqueSign(['DIQUE', 'TRANSPORTE'], '#794438', '#d0c0a1', '#9a664d');
    const livery = new THREE.MeshStandardMaterial({ map: marking, roughness: 0.78 });
    for (const side of [-1, 1]) {
      const plate = diquePart(cab, new THREE.PlaneGeometry(1.04, 0.30), livery);
      plate.position.set(-2.82, 2.37, side * 1.192);
      plate.rotation.y = side < 0 ? Math.PI : 0;
    }
  } else {
    for (const [i, x] of [-0.68, -1.36, -2.06].entries()) {
      barrelAt(cab, i === 1 ? oxide : drumBlue, x, 0.944, -0.44, 0.298);
    }
    rounded(cab, canvasGreen, -1.44, 1.373, 0.41, 1.61, 0.78, 1.01);
    for (const x of [-1.86, -1.05]) box(cab, coal, x, 1.767, 0.41, 0.07, 0.032, 1.02, false);
    for (const z of [-1.105, 1.105]) {
      box(cab, paint, -1.44, 1.152, z, 2.72, 0.43, 0.11, false);
      box(cab, steel, -1.44, 1.371, z, 2.72, 0.037, 0.12, false);
    }
  }
  mergeStatic(cab);

  const axles = trailer ? [1.22, -0.65, -3.50, -4.35] : [1.13, -1.92];
  const wheels = new THREE.InstancedMesh(tyre, rubber, axles.length * 2);
  const rims = new THREE.InstancedMesh(hub, steel, axles.length * 2);
  const locks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), coal, axles.length * 2);
  for (const batch of [wheels, rims, locks]) {
    batch.boundingSphere = new THREE.Sphere(new THREE.Vector3(-0.8, 0.45, 0), 4.5);
    batch.receiveShadow = true;
    if (trailer) batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(batch);
  }
  const point = new THREE.Object3D();
  const radius = 0.454;
  function roll(distance: number) {
    for (const [i, x] of axles.entries()) {
      for (const [j, side] of [-1, 1].entries()) {
        const index = i * 2 + j;
        const turn = -distance / radius;
        point.position.set(x, radius, side * 0.997);
        point.rotation.set(Math.PI / 2, 0, turn, 'ZYX');
        point.scale.set(radius, i === 0 ? 0.37 : 0.46, radius);
        point.updateMatrix();
        wheels.setMatrixAt(index, point.matrix);
        point.position.z = side * (i === 0 ? 1.186 : 1.23);
        point.rotation.set(0, 0, turn);
        point.scale.set(0.26, 0.26, 0.071);
        point.updateMatrix();
        rims.setMatrixAt(index, point.matrix);
        point.position.z += side * 0.041;
        point.scale.set(0.168, 0.132, 0.029);
        point.updateMatrix();
        locks.setMatrixAt(index, point.matrix);
      }
    }
    for (const batch of [wheels, rims, locks]) batch.instanceMatrix.needsUpdate = true;
  }
  roll(0);
  return { low, tail, backup, top, roll };
}

function lanePaint(parent: THREE.Group) {
  const { canvas, context } = canvas2d(1024, 256);
  const rng = random(1784);
  const left = freightLane.from.x - 6.50;
  const span = freightLane.to.x - left + 4.8;
  const width = 5.6;
  const paintX = (x: number) => (x - left) * 1024 / span;
  context.fillStyle = 'rgba(27,33,32,.37)';
  context.fillRect(4, 54, 1016, 196);
  for (let i = 0; i < 540; i++) {
    const y = 75 + (i % 2) * 99 + rng() * 14;
    context.fillStyle = i % 3 ? 'rgba(24,28,26,.15)' : 'rgba(114,107,90,.24)';
    context.fillRect(rng() * 1024, y, rng() * 32, rng() * 2.5);
  }
  context.lineWidth = 4;
  context.strokeStyle = '#ba9c60';
  context.strokeRect(11, 57, 1002, 140);
  context.strokeStyle = 'rgba(208,198,160,.64)';
  context.setLineDash([19, 12]);
  context.strokeRect(paintX(freightLane.to.x - 5.1), 67, 239, 122);
  context.fillStyle = '#d5c197';
  context.font = 'bold 26px Arial';
  context.fillText('CONTROL', paintX(freightLane.to.x - 4.6), 223);
  context.fillText('CARGA 01', 32, 224);
  const decal = new THREE.MeshBasicMaterial({
    map: texture(canvas), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
  });
  const lane = diquePart(parent, yardPlane, decal, false, 'Corredor demarcado de control de carga');
  lane.position.set(left + span / 2, floor + 0.003, freightLane.from.z);
  lane.scale.set(span, 1, width);
}

function weighStation(parent: THREE.Group, concrete: THREE.Material) {
  const office = new THREE.Group();
  office.name = 'Control de carga · báscula y cabina';
  const x = freightLane.to.x - 1.33;
  const z = freightLane.from.z;
  office.position.set(x, DIQUE_GROUND, z + 5.25);
  parent.add(office);
  box(parent, coal, x - 0.28, floor + 0.006, z, 8.62, 0.018, 2.66, false);
  for (const side of [-1, 1]) box(parent, yellow, x - 0.28, floor + 0.019, z + side * 1.38, 8.62, 0.026, 0.085, false);
  box(office, concrete, 0, 0.087, 0, 4.15, 0.173, 2.95);
  box(office, teal, 0, 1.314, 0.015, 3.77, 2.51, 2.63);
  box(office, coal, 0, 2.66, 0.034, 4.22, 0.23, 2.98);
  const practical = lantern(0xffbb76);
  const windows = lantern(0x9b8c70);
  for (const i of [-1, 1]) {
    box(office, steel, i * 0.88, 1.884, -1.32, 1.49, 0.91, 0.05, false);
    box(office, windows, i * 0.88, 1.884, -1.361, 1.32, 0.729, 0.055, false);
  }
  box(office, coal, 0.31, 2.46, -1.39, 0.58, 0.23, 0.25, false);
  box(office, practical, 0.31, 2.39, -1.45, 0.48, 0.064, 0.22, false);
  box(office, teal, 0.93, 1.209, 1.351, 0.94, 2.02, 0.081, false);
  box(office, steel, -0.98, 1.58, 1.335, 1.46, 0.70, 0.07, false);
  box(office, windows, -0.98, 1.58, 1.384, 1.32, 0.58, 0.047, false);
  box(office, coal, -0.98, 1.58, 1.421, 0.044, 0.59, 0.041, false);
  box(office, steel, -0.98, 1.264, 1.410, 1.60, 0.067, 0.15, false);
  box(office, steel, 0.54, 1.163, 1.405, 0.043, 0.153, 0.058, false);
  box(office, coal, -1.07, 2.228, 1.345, 1.47, 0.43, 0.075, false);
  const plate = new THREE.MeshStandardMaterial({ map: diqueSign(['CONTROL', 'MUELLE 02'], '#3b5357', '#eadab0'), roughness: 0.72 });
  diquePart(office, new THREE.PlaneGeometry(1.39, 0.39), plate).position.set(-1.07, 2.228, 1.386);
  const status = lantern(0xde9861);
  box(office, steel, -2.73, 0.936, -2.51, 0.104, 1.7, 0.108, false);
  box(office, coal, -2.73, 1.82, -2.51, 0.29, 0.34, 0.27, false);
  box(office, status, -2.73, 1.83, -2.658, 0.169, 0.16, 0.041, false);
  for (const x of [-4.54, -3.56, 1.59, 2.36]) {
    box(office, yellow, x, 0.42, -2.76, 0.18, 0.82, 0.16, false);
    box(office, coal, x, 0.519, -2.76, 0.193, 0.14, 0.172, false);
  }
  const { canvas, context } = canvas2d(64, 64);
  const falloff = context.createRadialGradient(32, 32, 2, 32, 32, 32);
  falloff.addColorStop(0, 'rgba(255,188,107,.72)');
  falloff.addColorStop(0.58, 'rgba(255,186,103,.28)');
  falloff.addColorStop(1, 'rgba(255,186,103,0)');
  context.fillStyle = falloff;
  context.fillRect(0, 0, 64, 64);
  const glow = new THREE.MeshBasicMaterial({
    map: texture(canvas), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const bounce = diquePart(parent, yardPlane, glow, false, 'Luz de inspección sobre la báscula');
  bounce.position.set(x + 0.31, floor + 0.056, z + 2.39);
  bounce.scale.set(8.8, 1, 6.4);
  return {
    status,
    setNight(night: boolean) {
      practical.emissiveIntensity = night ? 2.83 : 0.90;
      windows.emissiveIntensity = night ? 0.86 : 0.18;
      glow.opacity = night ? 0.58 : 0.12;
    },
  };
}

function serviceStores(parent: THREE.Group, course: Course) {
  const rng = random(14821);
  for (const [px, pz, count, angle] of [[117, 135, 5, 0.13], [208, 137, 4, 0.31],
    [208, 65, 6, -0.14], [46, 136, 5, -0.14], [144, 37, 4, 0.1], [125, 163.2, 3, 0.06]]) {
    const { x, z } = diquePlanPoint(px, pz);
    const quay = pz > 160;
    if (!diqueRoadClear(course, x, z, quay ? 0.86 : 2.4)) continue;
    const tray = new THREE.Group();
    tray.name = 'Bidones en cubeta de retención';
    tray.position.set(x, floor, z);
    tray.rotation.y = angle;
    parent.add(tray);
    const length = (count - 1) * 0.68 + 0.80;
    box(tray, coal, 0, 0.056, 0, length, 0.105, 0.67, false);
    for (const dz of [-0.306, 0.306]) box(tray, steel, 0, 0.151, dz, length, 0.13, 0.054, false);
    for (let i = 0; i < count; i++) {
      barrelAt(tray, [oxide, drumBlue, yellow][Math.floor(rng() * 3)], (i - (count - 1) / 2) * 0.68, 0.10,
        (rng() - 0.5) * 0.072, 0.261 + rng() * 0.033);
    }
  }
  const contacts: THREE.Vector3[] = [];
  for (const [px, pz, height] of [[40, 139, 4], [43.3, 139, 3], [106, 137, 4],
    [110, 138, 5], [114, 138, 2], [222, 98, 5], [225, 101, 3], [50.7, 95.8, 4]]) {
    const { x, z } = diquePlanPoint(px, pz);
    if (!diqueRoadClear(course, x, z, 1.05)) continue;
    box(parent, wood, x, floor + 0.032, z, 1.37, 0.063, 1.37, false);
    contacts.push(new THREE.Vector3(x, floor + 0.004, z));
    for (let i = 0; i < height; i++) {
      const tire = diquePart(parent, tyre, rubber);
      tire.position.set(x + (rng() - 0.5) * 0.105, floor + 0.18 + i * 0.224, z + (rng() - 0.5) * 0.13);
      const radius = 0.47 + rng() * 0.08;
      tire.scale.set(radius, 0.231, radius);
      tire.rotation.z = (rng() - 0.5) * 0.065;
    }
  }
  const shadows = new THREE.InstancedMesh(yardPlane, horizontalShadow(), contacts.length);
  const matrix = new THREE.Matrix4().makeScale(2.48, 1, 2.48);
  contacts.forEach((contact, i) => shadows.setMatrixAt(i, matrix.setPosition(contact)));
  shadows.computeBoundingSphere();
  parent.add(shadows);
}

export function buildDiqueTerminal(fixed: THREE.Group, parent: THREE.Group, course: Course, concrete: THREE.Material) {
  detailRubber();
  serviceStores(fixed, course);
  lanePaint(fixed);
  const station = weighStation(fixed, concrete);
  const service = new THREE.Group();
  service.name = 'Camión de mantenimiento estacionado';
  const layby = diquePlanPoint(55.8, 119.8);
  if (diqueRoadClear(course, layby.x, layby.z, 4.2)) {
    service.position.set(layby.x, floor, layby.z);
    service.rotation.y = Math.PI / 2;
    fixed.add(service);
    serviceTruck(service, teal, false);
    const parked = diquePart(fixed, yardPlane, horizontalShadow());
    parked.position.set(layby.x, floor + 0.007, layby.z + 0.53);
    parked.scale.set(3.30, 1, 6.3);
    for (const x of [-1.72, 1.72]) box(fixed, yellow, layby.x + x, floor, layby.z + 0.67, 0.074, 0.012, 6.70, false);
    box(fixed, coal, layby.x, floor + 0.065, layby.z + 3.08, 3.10, 0.132, 0.245, false);
  }
  const rig = new THREE.Group();
  rig.name = 'Camión portacontenedores en maniobra';
  parent.add(rig);
  const semitrailer = serviceTruck(rig, cream, true);
  const shadow = diquePart(parent, yardPlane, horizontalShadow(), false, 'Contacto del camión con el patio');
  shadow.scale.set(8.8, 1, 3.11);

  let time = 4.5;
  let last: number | undefined;
  let previousX = NaN;
  let night = false;
  let inspection = false;
  const running = new THREE.Color(0x76b08a);
  const stopped = new THREE.Color(0xe58d50);
  function update(now: number) {
    if (last !== undefined) time += Math.min(Math.max((now - last) / 1000, 0), 0.082);
    last = now;
    const pose = sampleFreightTruck(time);
    inspection = pose.inspection;
    rig.position.set(pose.x, floor, freightLane.from.z);
    shadow.position.set(pose.x - 1.49, floor + 0.017, freightLane.from.z);
    if (pose.x !== previousX) {
      semitrailer.roll(pose.x - freightLane.from.x);
      previousX = pose.x;
    }
    semitrailer.low.emissiveIntensity = night ? 2.55 : 0.42;
    semitrailer.tail.emissiveIntensity = pose.inspection ? 1.85 : night ? 0.74 : 0.28;
    semitrailer.backup.emissiveIntensity = pose.speed < -0.04 ? (night ? 2.20 : 0.95) : 0.05;
    const reversing = pose.speed < -0.04;
    semitrailer.top.emissiveIntensity = reversing ? 0.36 + 1.71 * Math.max(0, Math.sin(time * 8)) ** 3 : 0.27;
    station.status.emissive.copy(pose.inspection ? stopped : running);
    station.status.color.copy(station.status.emissive);
    station.status.emissiveIntensity = night ? 1.65 : 0.58;
  }
  update(0);
  last = undefined;
  return {
    update,
    isInspecting: () => inspection,
    setNight(enabled: boolean) { night = enabled; station.setNight(enabled); },
  };
}
