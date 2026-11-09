import * as THREE from 'three';
import { box, canvas2d, random, standard, texture } from './materials.ts';

const satinSteel = standard(0x8f8e86, 0.35, 0.75);
const brightSteel = standard(0xc4c0b6, 0.24, 0.79);
const darkSteel = standard(0x494946, 0.59, 0.59);
const turnedGeometry = new THREE.CylinderGeometry(1, 1, 1, 20);

function turned(parent: THREE.Object3D, material: THREE.Material, radius: number, height: number, y: number) {
  const mesh = new THREE.Mesh(turnedGeometry, material);
  mesh.position.y = y;
  mesh.scale.set(radius, height, radius);
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function forge(shape: THREE.Shape, depth: number, bevel: number) {
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelSize: bevel, bevelThickness: bevel,
    bevelSegments: 3, curveSegments: 16 });
  const positions = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < positions.count; i++) {
    uv.setXY(i, (positions.getX(i) + 7) / 14, (positions.getY(i) + 1.8) / 3.6);
  }
  return geometry;
}

function forgedFinish() {
  const { canvas, context } = canvas2d(576, 168);
  const rng = random(234);
  const finish = context.createLinearGradient(0, 0, 0, canvas.height);
  finish.addColorStop(0, '#a3a5a0');
  finish.addColorStop(0.52, '#b0b2ad');
  finish.addColorStop(1, '#999b94');
  context.fillStyle = finish;
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 1650; i++) {
    context.fillStyle = i % 3 ? 'rgba(45,44,38,.12)' : 'rgba(238,228,206,.17)';
    context.fillRect(rng() * canvas.width, rng() * canvas.height, 1 + 47 * rng() ** 2, 0.35 + rng());
  }
  for (const [x, y, spreadX, spreadY] of [[63, 59, 82, 38], [66, 119, 78, 32], [109, 89, 52, 55], [523, 89, 64, 40]]) {
    for (let i = 0; i < 65; i++) {
      const px = x + (rng() - 0.5) * spreadX;
      const py = y + (rng() - 0.5) * spreadY;
      context.strokeStyle = i % 3 ? 'rgba(57,49,39,.32)' : 'rgba(249,233,207,.46)';
      context.lineWidth = 0.3 + rng() * 0.8;
      context.beginPath();
      context.moveTo(px, py);
      context.lineTo(px + 1.5 + rng() * 13, py + (rng() - 0.5) * 12);
      context.stroke();
    }
  }
  const map = texture(canvas);
  return new THREE.MeshPhysicalMaterial({ map, bumpMap: map, bumpScale: 0.0045, roughness: 0.34,
    metalness: 0.72, clearcoat: 0.24, clearcoatRoughness: 0.38 });
}

function screwThread(pitch: number, turns: number) {
  const profile = [[0.179, -0.056], [0.235, -0.026], [0.235, 0.026], [0.179, 0.056]];
  const sections = Math.ceil(turns * 24);
  const positions: number[] = [];
  const indices: number[] = [];
  for (let step = 0; step <= sections; step++) {
    const t = step / sections;
    const angle = t * turns * Math.PI * 2;
    const y = (t - 0.5) * turns * pitch;
    for (const [radius, offset] of profile) positions.push(Math.cos(angle) * radius, y + offset, Math.sin(angle) * radius);
    if (step === sections) continue;
    for (let edge = 0; edge < profile.length - 1; edge++) {
      const a = step * profile.length + edge;
      const b = a + profile.length;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function makeAdjustableWrench() {
  const fixed = new THREE.Shape();
  fixed.moveTo(-6.64, 0.54);
  fixed.lineTo(-4.98, 0.54);
  fixed.quadraticCurveTo(-4.86, 0.54, -4.86, 0.38);
  fixed.lineTo(-4.88, -1.01);
  fixed.quadraticCurveTo(-4.84, -1.33, -4.51, -1.34);
  fixed.quadraticCurveTo(-3.83, -1.28, -3.46, -0.94);
  fixed.quadraticCurveTo(-3.13, -0.63, -2.68, -0.59);
  fixed.bezierCurveTo(-0.07, -0.56, 3.61, -0.65, 5.74, -0.82);
  fixed.bezierCurveTo(6.94, -0.90, 6.98, 0.85, 5.77, 0.77);
  fixed.bezierCurveTo(3.43, 0.61, 0.07, 0.57, -2.69, 0.58);
  fixed.quadraticCurveTo(-3.42, 0.65, -3.75, 1.08);
  fixed.quadraticCurveTo(-4.32, 1.67, -5.24, 1.62);
  fixed.quadraticCurveTo(-6.31, 1.66, -6.65, 0.94);
  fixed.quadraticCurveTo(-6.81, 0.68, -6.64, 0.54);

  const eye = new THREE.Path();
  eye.absellipse(5.83, -0.028, 0.49, 0.40, 0, Math.PI * 2, true, 0);
  const socket = new THREE.Path();
  socket.moveTo(-4.69, -0.69);
  socket.lineTo(-4.69, 0.63);
  socket.quadraticCurveTo(-4.69, 0.72, -4.60, 0.72);
  socket.lineTo(-3.60, 0.72);
  socket.quadraticCurveTo(-3.51, 0.72, -3.51, 0.63);
  socket.lineTo(-3.51, -0.63);
  socket.quadraticCurveTo(-3.51, -0.73, -3.61, -0.73);
  socket.lineTo(-4.61, -0.73);
  socket.quadraticCurveTo(-4.69, -0.73, -4.69, -0.69);
  const gripPocket = new THREE.Shape();
  gripPocket.moveTo(-2.46, -0.230);
  gripPocket.bezierCurveTo(-1.01, -0.205, 3.40, -0.292, 4.88, -0.322);
  gripPocket.bezierCurveTo(5.29, -0.327, 5.30, 0.279, 4.90, 0.275);
  gripPocket.bezierCurveTo(2.98, 0.215, -1.01, 0.205, -2.46, 0.229);
  gripPocket.bezierCurveTo(-2.75, 0.228, -2.76, -0.232, -2.46, -0.230);
  fixed.holes.push(eye, socket, gripPocket);

  const movable = new THREE.Shape();
  movable.moveTo(-6.48, -0.74);
  movable.lineTo(-4.98, -0.74);
  movable.quadraticCurveTo(-4.77, -0.74, -4.75, -0.48);
  movable.lineTo(-4.75, 0.58);
  movable.quadraticCurveTo(-4.75, 0.64, -4.68, 0.64);
  movable.lineTo(-4.44, 0.64);
  movable.lineTo(-4.44, -0.95);
  movable.quadraticCurveTo(-4.51, -1.48, -5.03, -1.55);
  movable.quadraticCurveTo(-6.16, -1.55, -6.47, -1.10);
  movable.quadraticCurveTo(-6.59, -0.91, -6.48, -0.74);

  const wrench = new THREE.Group();
  wrench.name = 'Llave ajustable de acero forjado';
  const alloy = forgedFinish();
  const recess = alloy.clone();
  recess.color.set(0xd0cdc4);
  recess.roughness = 0.48;
  const fixedJaw = new THREE.Mesh(forge(fixed, 0.24, 0.084), [alloy, brightSteel]);
  fixedJaw.rotation.x = -Math.PI / 2;
  fixedJaw.castShadow = fixedJaw.receiveShadow = true;
  wrench.add(fixedJaw);
  const movingJaw = new THREE.Mesh(forge(movable, 0.16, 0.055), [alloy, satinSteel]);
  movingJaw.rotation.x = -Math.PI / 2;
  movingJaw.position.y = 0.045;
  movingJaw.castShadow = movingJaw.receiveShadow = true;
  wrench.add(movingJaw);
  const inset = new THREE.Mesh(forge(gripPocket, 0.10, 0.027), recess);
  inset.rotation.x = -Math.PI / 2;
  inset.position.y = 0.031;
  inset.receiveShadow = true;
  wrench.add(inset);

  box(wrench, brightSteel, -5.78, 0.129, -0.533, 1.42, 0.178, 0.027, false);
  box(wrench, brightSteel, -5.72, 0.126, 0.736, 1.42, 0.127, 0.027, false);
  box(wrench, darkSteel, -4.10, 0.013, 0, 1.19, 0.062, 1.42, false);
  box(wrench, satinSteel, -4.67, 0.108, 0, 0.092, 0.092, 1.38, false);
  for (let i = 0; i < 7; i++) {
    const tooth = box(wrench, brightSteel, -4.298, 0.173, -0.478 + i * 0.16, 0.269, 0.062, 0.062, false);
    tooth.rotation.y = -0.12;
  }

  const worm = new THREE.Group();
  worm.position.set(-3.94, 0.189, 0.02);
  worm.rotation.x = Math.PI / 2;
  turned(worm, darkSteel, 0.179, 0.87, 0);
  turned(worm, satinSteel, 0.088, 1.40, 0);
  for (const y of [-0.49, 0.49]) turned(worm, brightSteel, 0.148, 0.070, y);
  const thread = new THREE.Mesh(screwThread(0.16, 5.05), brightSteel);
  thread.receiveShadow = true;
  worm.add(thread);
  wrench.add(worm);
  return wrench;
}

function handleGeometry(profile: number[][], flutes: number) {
  const grip = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 36);
  const vertices = grip.getAttribute('position');
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i);
    const y = vertices.getY(i);
    const z = vertices.getZ(i);
    const angle = Math.atan2(x, z);
    const depth = Math.sin(Math.PI * y) ** 0.60;
    const lobe = 1 - depth * 0.13 * (0.5 + 0.5 * Math.cos(angle * flutes));
    vertices.setXYZ(i, x * lobe, y, z * lobe);
  }
  grip.computeVertexNormals();
  return grip;
}

function bladeGeometry(width: number, height: number, depth: number, taper: number) {
  const blade = new THREE.BoxGeometry(width, height, depth, 1, 3, 1);
  const vertices = blade.getAttribute('position');
  for (let i = 0; i < vertices.count; i++) {
    const y = vertices.getY(i);
    const portion = THREE.MathUtils.smoothstep(y / height, -0.50, 0.01);
    vertices.setXYZ(i, vertices.getX(i) * THREE.MathUtils.lerp(taper, 1, portion), y,
      vertices.getZ(i) * THREE.MathUtils.lerp(0.34, 1, portion));
  }
  blade.computeVertexNormals();
  return blade;
}

const amber = new THREE.MeshPhysicalMaterial({ color: 0x9b682e, roughness: 0.42, clearcoat: 0.36, clearcoatRoughness: 0.29 });
const redRubber = standard(0x80372d, 0.68);
const walnut = standard(0x5e4130, 0.71);
const ferrule = standard(0x8a765a, 0.45, 0.54);
const drivers = handleGeometry([[0.075, 0], [0.119, 0.04], [0.155, 0.12], [0.182, 0.23], [0.209, 0.64],
  [0.192, 0.88], [0.159, 0.96], [0.083, 0.995], [0, 1]], 6);
const fileGrip = handleGeometry([[0.07, 0], [0.14, 0.065], [0.17, 0.27], [0.158, 0.51], [0.218, 0.81],
  [0.211, 0.92], [0.14, 0.99], [0, 1]], 4);
const slottedTip = bladeGeometry(0.140, 0.245, 0.078, 0.83);
const crossTip = bladeGeometry(0.109, 0.213, 0.028, 0.32);

function tool(parent: THREE.Object3D, x: number, z: number, tiltX: number, tiltZ: number, roll = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0.21, z);
  group.rotation.set(tiltX, roll, tiltZ, 'YXZ');
  parent.add(group);
  return group;
}

function driver(parent: THREE.Object3D, shaft: number, gripLength: number, material: THREE.Material, phillips: boolean) {
  turned(parent, satinSteel, 0.052, shaft - 0.12, shaft / 2 + 0.04);
  turned(parent, darkSteel, 0.071, 0.14, shaft - 0.036);
  for (const angle of phillips ? [0, Math.PI / 2] : [0]) {
    const tip = new THREE.Mesh(phillips ? crossTip : slottedTip, darkSteel);
    tip.position.y = 0.126;
    tip.rotation.y = angle;
    tip.receiveShadow = true;
    parent.add(tip);
  }
  const grip = new THREE.Mesh(drivers, material);
  grip.position.y = shaft;
  grip.scale.y = gripLength;
  grip.castShadow = grip.receiveShadow = true;
  parent.add(grip);
  turned(parent, material === amber ? ferrule : darkSteel, 0.129, 0.065, shaft + 0.039);
}

function handFile(parent: THREE.Object3D) {
  const { canvas, context } = canvas2d(64, 192);
  context.fillStyle = '#666661';
  context.fillRect(0, 0, 64, 192);
  for (const sign of [-1, 1]) {
    context.strokeStyle = sign === -1 ? '#464642' : '#8b8981';
    context.lineWidth = 0.82;
    for (let y = -64; y < 196; y += 4) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(64, y + 31 * sign);
      context.stroke();
    }
  }
  const grit = texture(canvas);
  const material = new THREE.MeshStandardMaterial({ map: grit, bumpMap: grit, bumpScale: 0.015, roughness: 0.77, metalness: 0.64 });
  const file = new THREE.Mesh(bladeGeometry(0.211, 2.63, 0.095, 0.51), material);
  file.position.y = 1.337;
  file.receiveShadow = true;
  parent.add(file);
  turned(parent, darkSteel, 0.044, 0.53, 2.85);
  turned(parent, ferrule, 0.132, 0.17, 2.99);
  const grip = new THREE.Mesh(fileGrip, walnut);
  grip.position.y = 3.03;
  grip.scale.y = 1.45;
  grip.castShadow = grip.receiveShadow = true;
  parent.add(grip);
}

function combinationSpanner(parent: THREE.Object3D) {
  const outline = new THREE.Shape();
  outline.moveTo(-0.11, 0.04);
  outline.lineTo(-0.08, 0.32);
  outline.lineTo(0.08, 0.32);
  outline.lineTo(0.12, 0.04);
  outline.quadraticCurveTo(0.28, 0.14, 0.26, 0.32);
  outline.quadraticCurveTo(0.23, 0.51, 0.098, 0.61);
  outline.lineTo(0.102, 3.77);
  outline.bezierCurveTo(0.102, 3.89, 0.238, 3.94, 0.238, 4.14);
  outline.bezierCurveTo(0.238, 4.45, -0.238, 4.45, -0.238, 4.14);
  outline.bezierCurveTo(-0.238, 3.94, -0.102, 3.89, -0.102, 3.77);
  outline.lineTo(-0.098, 0.61);
  outline.quadraticCurveTo(-0.25, 0.49, -0.25, 0.31);
  outline.quadraticCurveTo(-0.26, 0.14, -0.11, 0.04);
  const ring = new THREE.Path();
  for (let i = 0; i < 24; i++) {
    const angle = -i * Math.PI / 12;
    const radius = i % 2 ? 0.111 : 0.148;
    const x = Math.cos(angle) * radius;
    const y = 4.13 + Math.sin(angle) * radius;
    if (i === 0) ring.moveTo(x, y);
    else ring.lineTo(x, y);
  }
  ring.closePath();
  outline.holes.push(ring);
  const tool = new THREE.Mesh(new THREE.ExtrudeGeometry(outline, { depth: 0.091, bevelThickness: 0.024, bevelSize: 0.019,
    bevelSegments: 2, curveSegments: 14 }), [satinSteel, brightSteel]);
  tool.position.z = -0.045;
  tool.castShadow = tool.receiveShadow = true;
  parent.add(tool);
}

export function populateToolCup(parent: THREE.Object3D) {
  driver(tool(parent, -0.39, 0.15, 0.04, 0.254, 0.11), 2.92, 1.49, amber, false);
  driver(tool(parent, -0.21, -0.34, -0.13, 0.093, -0.08), 3.09, 1.73, redRubber, true);
  driver(tool(parent, 0.075, 0.34, 0.135, -0.064, 0.08), 2.80, 1.23, amber, false);
  handFile(tool(parent, 0.28, -0.28, -0.101, -0.14, -0.19));
  combinationSpanner(tool(parent, 0.47, 0.20, 0.087, -0.20, 0.40));
}
