import * as THREE from 'three';
import { PIT_LANE, TRACK } from '../shared/track';
import { box, canvas2d, random, standard, texture } from './materials.ts';

const TOP = 0.72;
const graphite = standard(0x433f37, 0.67, 0.36);
const steel = standard(0x898780, 0.43, 0.63);
const bareMetal = standard(0xaaa79a, 0.30, 0.69);
const red = standard(0xa13d30, 0.48, 0.32);
const rubber = standard(0x282622, 0.91);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 18);

function setPiece(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material,
  x: number, y: number, z: number, casts = true) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = casts;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function round(parent: THREE.Object3D, material: THREE.Material, x: number, y: number, z: number,
  radius: number, height: number, casts = false) {
  const mesh = setPiece(parent, cylinder, material, x, y, z, casts);
  mesh.scale.set(radius, height, radius);
  return mesh;
}

function workshopStains(parent: THREE.Object3D) {
  const { canvas, context } = canvas2d(384, 144);
  const rng = random(52);
  for (const [x, y, rx, ry, opacity] of [[133, 67, 129, 53, 0.26], [326, 80, 56, 53, 0.20], [119, 116, 24, 11, 0.32],
    [152, 108, 19, 12, 0.22], [326, 103, 20, 9, 0.25]]) {
    context.save();
    context.translate(x, y);
    context.scale(rx, ry);
    const shadow = context.createRadialGradient(0, 0, 0.04, 0, 0, 1);
    shadow.addColorStop(0, `rgba(48,33,24,${opacity})`);
    shadow.addColorStop(0.5, `rgba(49,35,27,${opacity * 0.66})`);
    shadow.addColorStop(1, 'rgba(41,29,21,0)');
    context.fillStyle = shadow;
    context.fillRect(-1, -1, 2, 2);
    context.restore();
  }
  for (let i = 0; i < 34; i++) {
    context.fillStyle = i % 4 ? 'rgba(48,36,27,.17)' : 'rgba(41,29,22,.29)';
    context.fillRect(111 + rng() * 70, 102 + rng() * 24, 1 + rng() * 3.6, 1 + rng() * 1.8);
  }
  const material = new THREE.MeshBasicMaterial({ map: texture(canvas), transparent: true, depthWrite: false });
  const print = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 2.7), material);
  print.position.y = 0.015;
  print.rotation.x = -Math.PI / 2;
  parent.add(print);
}

function worktopMaterial() {
  const { canvas, context } = canvas2d(384, 144);
  const rng = random(77);
  context.fillStyle = '#b89567';
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 920; i++) {
    const x = rng() * canvas.width;
    const y = rng() * canvas.height;
    const length = 7 + 127 * rng() ** 2;
    context.strokeStyle = i % 2 ? 'rgba(64,40,25,.13)' : 'rgba(245,210,156,.22)';
    context.lineWidth = 0.3 + rng() * 1.1;
    context.beginPath();
    context.moveTo(x, y);
    context.quadraticCurveTo(x + length * 0.55, y + 3 * (rng() - 0.5), x + length, y + 1.9 * (rng() - 0.5));
    context.stroke();
  }
  const stain = context.createRadialGradient(187, 72, 6, 187, 72, 59);
  stain.addColorStop(0, 'rgba(54,38,27,.37)');
  stain.addColorStop(0.63, 'rgba(68,43,28,.21)');
  stain.addColorStop(1, 'rgba(68,43,28,0)');
  context.fillStyle = stain;
  context.fillRect(125, 11, 124, 124);
  for (let i = 0; i < 80; i++) {
    context.fillStyle = i % 3 ? 'rgba(44,32,24,.21)' : 'rgba(243,214,160,.44)';
    context.fillRect(95 + rng() * 160, 45 + rng() * 73, 1 + rng() * 11, 0.5 + rng() * 1.1);
  }
  const grain = texture(canvas);
  return new THREE.MeshStandardMaterial({ map: grain, bumpMap: grain, bumpScale: 0.016, roughness: 0.72 });
}

function makeBench(parent: THREE.Object3D) {
  const bench = new THREE.Group();
  bench.position.set(-1.0, 0, -0.12);
  parent.add(bench);
  const edge = standard(0x8b613a, 0.74);
  const birchEdge = standard(0xc9a371, 0.72);
  for (const x of [-2.24, 2.24]) {
    for (const z of [-0.65, 0.65]) {
      box(bench, graphite, x, 0.30, z, 0.15, 0.53, 0.15);
      box(bench, rubber, x, 0.029, z, 0.23, 0.058, 0.21, false);
    }
    box(bench, steel, x, 0.24, 0, 0.092, 0.10, 1.43, false);
  }
  box(bench, graphite, 0, 0.21, -0.62, 4.40, 0.14, 0.13, false);
  box(bench, graphite, 0, 0.515, 0, 4.68, 0.16, 1.48);
  box(bench, worktopMaterial(), 0, TOP - 0.059, 0, 5.00, 0.118, 1.90);
  for (const y of [TOP - 0.097, TOP - 0.052]) {
    box(bench, edge, 0, y, 0.95, 4.96, 0.027, 0.025, false);
    box(bench, birchEdge, 0, y + 0.018, 0.953, 4.94, 0.009, 0.026, false);
  }
  box(bench, graphite, 1.34, 0.356, 0.30, 1.44, 0.35, 1.03);
  box(bench, red, 1.34, 0.42, 0.935, 1.38, 0.18, 0.41);
  box(bench, graphite, 1.34, 0.517, 0.985, 1.24, 0.020, 0.23, false);
  box(bench, red, 1.34, 0.25, 0.83, 1.38, 0.13, 0.14);
  for (const [y, z] of [[0.423, 1.16], [0.252, 0.928]]) {
    box(bench, graphite, 1.34, y, z, 0.61, 0.085, 0.071, false);
    box(bench, bareMetal, 1.34, y + 0.008, z + 0.038, 0.49, 0.027, 0.040, false);
  }
  return bench;
}

function repairInProgress(bench: THREE.Object3D) {
  const vise = new THREE.Group();
  vise.position.set(-0.06, 0, 0.01);
  vise.rotation.y = -0.18;
  bench.add(vise);
  round(vise, steel, 0, TOP + 0.028, 0, 0.32, 0.056);
  box(vise, red, 0, TOP + 0.11, 0, 0.56, 0.19, 0.44);
  for (const side of [-1, 1]) {
    box(vise, red, -0.10, TOP + 0.239, side * 0.175, 0.37, 0.23, 0.16);
    // The plates meet the axle at its diameter.
    box(vise, steel, -0.10, TOP + 0.31, side * 0.117, 0.39, 0.084, 0.105, false);
    for (const x of [-0.226, 0.026]) {
      round(vise, graphite, x, TOP + 0.321, side * 0.063, 0.018, 0.009).rotation.x = Math.PI / 2;
    }
  }
  round(vise, steel, -0.04, TOP + 0.139, 0.249, 0.068, 0.17).rotation.x = Math.PI / 2;
  round(vise, bareMetal, -0.044, TOP + 0.141, 0.345, 0.021, 0.34).rotation.z = 0.48;

  const axleY = TOP + 0.27;
  round(vise, bareMetal, 0.16, axleY, 0, 0.067, 1.34, true).rotation.z = Math.PI / 2;
  round(vise, steel, 0.57, axleY, 0, 0.18, 0.11, true).rotation.z = Math.PI / 2;
  round(vise, bareMetal, 0.69, axleY, 0, 0.22, 0.078, true).rotation.z = Math.PI / 2;
  round(vise, graphite, 0.743, axleY, 0, 0.14, 0.05).rotation.z = Math.PI / 2;
  for (let i = 0; i < 5; i++) {
    const angle = i * Math.PI * 2 / 5;
    round(vise, bareMetal, 0.775, axleY + Math.sin(angle) * 0.109, Math.cos(angle) * 0.109, 0.018, 0.027)
      .rotation.z = Math.PI / 2;
  }

  const outline = new THREE.Shape();
  outline.moveTo(-0.63, -0.11);
  outline.lineTo(-0.46, -0.063);
  outline.lineTo(-0.46, 0.063);
  outline.lineTo(-0.63, 0.11);
  outline.quadraticCurveTo(-0.52, 0.25, -0.35, 0.177);
  outline.lineTo(-0.24, 0.071);
  outline.lineTo(0.49, 0.067);
  outline.quadraticCurveTo(0.58, 0.056, 0.58, 0);
  outline.quadraticCurveTo(0.58, -0.056, 0.49, -0.067);
  outline.lineTo(-0.24, -0.071);
  outline.lineTo(-0.35, -0.177);
  outline.quadraticCurveTo(-0.52, -0.25, -0.63, -0.11);
  const wrench = new THREE.ExtrudeGeometry(outline, { depth: 0.035, bevelThickness: 0.011, bevelSize: 0.011, bevelSegments: 1 });
  setPiece(bench, wrench, bareMetal, -1.51, TOP + 0.014, 0.09, false).rotation.set(-Math.PI / 2, 0, 0.36);
  const driver = new THREE.Group();
  driver.position.set(0.49, TOP + 0.068, 0.60);
  driver.rotation.y = -0.21;
  bench.add(driver);
  const grip = new THREE.LatheGeometry([
    [0, -0.24], [0.044, -0.235], [0.065, -0.210], [0.069, -0.171],
    [0.064, 0.070], [0.046, 0.136], [0.045, 0.19], [0.032, 0.204], [0, 0.205],
  ].map(([radius, length]) => new THREE.Vector2(radius, length)), 16).rotateZ(-Math.PI / 2);
  setPiece(driver, grip, standard(0xa64a35, 0.55), 0, 0, 0, false);
  round(driver, rubber, -0.16, 0, 0, 0.069, 0.038).rotation.z = Math.PI / 2;
  round(driver, steel, 0.19, 0, 0, 0.036, 0.054).rotation.z = Math.PI / 2;
  round(driver, bareMetal, 0.413, 0, 0, 0.018, 0.42).rotation.z = Math.PI / 2;
  box(driver, bareMetal, 0.644, 0, 0, 0.058, 0.012, 0.036, false);
}

function partsAndCloth(bench: THREE.Object3D) {
  const tray = new THREE.Group();
  tray.position.set(1.63, TOP, -0.45);
  tray.rotation.y = 0.11;
  bench.add(tray);
  const enamel = standard(0x666a57, 0.55, 0.22);
  box(tray, enamel, 0, 0.029, 0, 1.13, 0.058, 0.68, false);
  for (const side of [-1, 1]) {
    box(tray, enamel, 0, 0.077, side * 0.32, 1.14, 0.10, 0.067, false);
    box(tray, enamel, side * 0.544, 0.077, 0, 0.07, 0.10, 0.61, false);
  }
  const washer = new THREE.TorusGeometry(0.061, 0.018, 5, 12);
  for (const [x, z] of [[-0.30, 0.13], [-0.13, 0.16], [0.27, -0.07], [0.35, 0.12]]) {
    setPiece(tray, washer, bareMetal, x, 0.083, z, false).rotation.x = Math.PI / 2;
  }
  for (const [x, z, angle] of [[0.07, -0.13, 0.51], [0.12, 0.082, -0.37], [-0.33, -0.14, -0.8]]) {
    const bolt = new THREE.Group();
    bolt.position.set(x, 0.084, z);
    bolt.rotation.y = angle;
    tray.add(bolt);
    round(bolt, steel, 0, 0, 0, 0.024, 0.18).rotation.z = Math.PI / 2;
    round(bolt, bareMetal, 0.083, 0.003, 0, 0.041, 0.045).rotation.z = Math.PI / 2;
  }

  const { canvas, context } = canvas2d(80, 96);
  context.fillStyle = '#b1a389';
  context.fillRect(0, 0, 80, 96);
  context.fillStyle = '#6a756b';
  context.fillRect(8, 0, 5, 96);
  context.fillRect(17, 0, 2, 96);
  context.fillRect(69, 0, 3, 96);
  const oil = context.createRadialGradient(45, 26, 2, 45, 26, 26);
  oil.addColorStop(0, 'rgba(51,43,35,.72)');
  oil.addColorStop(1, 'rgba(52,40,29,0)');
  context.fillStyle = oil;
  context.fillRect(19, 0, 52, 52);
  const cloth = new THREE.PlaneGeometry(0.72, 0.74, 7, 9);
  const positions = cloth.getAttribute('position');
  const uv = cloth.getAttribute('uv');
  for (let i = 0; i < positions.count; i++) {
    const u = uv.getX(i);
    const t = 1 - uv.getY(i);
    const fold = Math.max(0, (t - 0.59) / 0.41);
    const waviness = Math.sin(u * 21 + t) * (0.008 + 0.014 * fold);
    positions.setXYZ(i, (u - 0.5) * 0.70 + 0.052 * t, 0.014 + waviness - 0.23 * fold,
      Math.min(0.59, t) * 0.75 + fold * (0.075 + waviness));
  }
  cloth.computeVertexNormals();
  setPiece(bench, cloth, new THREE.MeshStandardMaterial({ map: texture(canvas), roughness: 0.97, side: THREE.DoubleSide }),
    -1.0, TOP, 0.51, false);
}

function spareRack(parent: THREE.Object3D) {
  const rack = new THREE.Group();
  rack.position.set(2.55, 0, 0.17);
  parent.add(rack);
  for (const x of [-0.96, 0.96]) {
    box(rack, graphite, x, 0.085, 0, 0.14, 0.16, 1.42);
    box(rack, red, x, 0.405, -0.52, 0.12, 0.81, 0.14);
    box(rack, graphite, x, 0.282, 0.54, 0.106, 0.53, 0.13);
    box(rack, steel, x, 0.411, 0, 0.095, 0.10, 1.27, false).rotation.x = -0.20;
  }
  box(rack, graphite, 0, 0.775, -0.52, 2.01, 0.11, 0.11);
  box(rack, steel, 0, 0.16, 0.096, 2.03, 0.085, 0.10);
  box(rack, graphite, 0, 0.164, -0.096, 2.03, 0.092, 0.10);

  const tire = new THREE.LatheGeometry([[0.146, -0.098], [0.236, -0.119], [0.301, -0.089], [0.33, -0.047],
    [0.33, 0.047], [0.301, 0.089], [0.236, 0.119], [0.146, 0.098], [0.146, -0.098]]
    .map(([r, y]) => new THREE.Vector2(r, y)), 24);
  for (const [x, z, scale, tilt] of [[-0.65, 0.008, 1, -0.13], [0.015, -0.04, 0.95, 0.08], [0.665, 0.015, 0.91, -0.06]]) {
    const wheel = setPiece(rack, tire, rubber, x, 0.179 + 0.33 * scale, z);
    wheel.rotation.set(Math.PI / 2 + tilt, tilt, 0.21);
    wheel.scale.setScalar(scale);
  }
}

export function buildServiceStation(parent: THREE.Object3D) {
  const station = new THREE.Group();
  station.name = 'Taller de boxes y puesta a punto';
  const lane = TRACK.sampleAt(PIT_LANE.stalls[1]);
  station.position.set(lane.x - lane.dz * PIT_LANE.stationOffset, -0.23, lane.z + lane.dx * PIT_LANE.stationOffset);
  parent.add(station);
  workshopStains(station);
  const bench = makeBench(station);
  repairInProgress(bench);
  partsAndCloth(bench);
  spareRack(station);
}
