import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { box, canvas2d, horizontalShadow, random, standard, texture } from './materials';

const forged = standard(0xa49b8c, 0.46, 0.62);
const machined = standard(0xc4bcb0, 0.28, 0.75);
const blackened = standard(0x393733, 0.64, 0.43);
const viceEnamel = new THREE.MeshPhysicalMaterial({ color: 0x763c2a, roughness: 0.66, metalness: 0.24,
  clearcoat: 0.31, clearcoatRoughness: 0.51 });
const brass = standard(0xb89551, 0.45, 0.57);
const handle = standard(0x745033, 0.66, 0.04);
const dowel = new THREE.CylinderGeometry(1, 1, 1, 12);
const hexHead = new THREE.CylinderGeometry(1, 1, 1, 6);
const endCap = new THREE.SphereGeometry(1, 12, 8);
const rounded = new RoundedBoxGeometry(1, 1, 1, 1, 0.13);

function fit(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function casting(parent: THREE.Object3D, material: THREE.Material, x: number, y: number, z: number, width: number, height: number, depth: number) {
  const mesh = fit(parent, rounded, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(width, height, depth);
  return mesh;
}

function finishSteel() {
  if (machined.roughnessMap) return;
  const { canvas, context } = canvas2d(256, 96);
  const rng = random(3411);
  context.fillStyle = '#dedede';
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 820; i++) {
    context.fillStyle = i % 4 ? 'rgba(87,87,87,.19)' : 'rgba(255,255,255,.33)';
    context.fillRect(rng() * canvas.width, rng() * canvas.height, 3 + 58 * rng(), 0.35 + rng() * 0.8);
  }
  const brushed = texture(canvas);
  brushed.colorSpace = THREE.NoColorSpace;
  brushed.wrapS = brushed.wrapT = THREE.RepeatWrapping;
  for (const material of [forged, machined, brass]) {
    material.roughnessMap = material.bumpMap = brushed;
    material.bumpScale = 0.0035;
  }
}

function rod(parent: THREE.Object3D, material: THREE.Material, radius: number, from: THREE.Vector3, to: THREE.Vector3) {
  const mesh = new THREE.Mesh(dowel, material);
  const axis = to.clone().sub(from);
  mesh.position.copy(from).lerp(to, 0.5);
  mesh.scale.set(radius, axis.length(), radius);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize());
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function spannerGeometry() {
  const face = new THREE.Shape();
  face.moveTo(-0.089, 0.69);
  face.quadraticCurveTo(-0.096, 0.78, -0.169, 0.848);
  face.bezierCurveTo(-0.366, 1.039, -0.226, 1.282, 0, 1.284);
  face.bezierCurveTo(0.218, 1.282, 0.347, 1.048, 0.167, 0.851);
  face.quadraticCurveTo(0.096, 0.779, 0.09, 0.69);
  face.lineTo(0.074, -0.56);
  face.quadraticCurveTo(0.091, -0.655, 0.184, -0.690);
  face.quadraticCurveTo(0.362, -0.803, 0.320, -1.080);
  face.lineTo(0.247, -1.263);
  face.lineTo(0.136, -1.273);
  face.lineTo(0.140, -1.029);
  face.lineTo(0.052, -0.938);
  face.lineTo(-0.061, -0.922);
  face.lineTo(-0.147, -0.998);
  face.lineTo(-0.151, -1.244);
  face.lineTo(-0.253, -1.218);
  face.quadraticCurveTo(-0.366, -1.048, -0.321, -0.844);
  face.quadraticCurveTo(-0.296, -0.696, -0.158, -0.648);
  face.lineTo(-0.086, -0.56);
  face.closePath();
  const opening = new THREE.Path();
  for (let i = 0; i < 24; i++) {
    const angle = -i * Math.PI / 12;
    const radius = i % 2 ? 0.131 : 0.149;
    const x = radius * Math.cos(angle);
    const y = 1.047 + radius * Math.sin(angle);
    if (i === 0) opening.moveTo(x, y);
    else opening.lineTo(x, y);
  }
  opening.closePath();
  face.holes.push(opening);
  return new THREE.ExtrudeGeometry(face, { depth: 0.074, bevelEnabled: true, bevelThickness: 0.019,
    bevelSize: 0.016, bevelSegments: 2, curveSegments: 10 }).translate(0, 0, -0.037);
}

const driverSlots = [0.57, 1.53, 2.49, 3.48];

function rackGeometry() {
  const outline = new THREE.Shape();
  outline.moveTo(-0.03, 0.045);
  outline.lineTo(4.27, 0.045);
  outline.lineTo(4.27, 0.56);
  outline.lineTo(-0.03, 0.56);
  outline.closePath();
  for (const x of driverSlots) {
    const hole = new THREE.Path();
    hole.absarc(x, 0.345, 0.086, 0, Math.PI * 2, true);
    outline.holes.push(hole);
  }
  return new THREE.ExtrudeGeometry(outline, { depth: 0.121, bevelThickness: 0.018,
    bevelSize: 0.012, bevelSegments: 1, curveSegments: 9 }).rotateX(Math.PI / 2);
}

function flutedGrip() {
  const geometry = new THREE.LatheGeometry([[0, 0.012], [0.084, 0.012], [0.091, 0.095], [0.126, 0.156], [0.149, 0.245],
    [0.147, 0.60], [0.131, 0.704], [0.116, 0.786], [0.077, 0.815], [0, 0.817]].map(([r, y]) => new THREE.Vector2(r, y)), 36);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    const x = position.getX(i), z = position.getZ(i);
    const shoulder = Math.min(1, (y - 0.11) / 0.13, (0.8 - y) / 0.15);
    const rib = 1 - Math.max(0, shoulder) * 0.105 * (0.5 + 0.5 * Math.cos(Math.atan2(x, z) * 6));
    position.setXYZ(i, x * rib, y, z * rib);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function dressPegboards(parent: THREE.Object3D) {
  finishSteel();
  const wrench = spannerGeometry();
  const driverGrip = flutedGrip();
  const rack = rackGeometry();
  const tip = new THREE.CylinderGeometry(0.046, 0.012, 0.15, 8);
  const socketTip = new THREE.CylinderGeometry(0.082, 0.082, 0.193, 6, 1, true);
  const grips = [handle, standard(0x8f331f, 0.43), standard(0xb48032, 0.38), standard(0x484945, 0.76)];
  for (const [x, y, z, angle, scale, boardX, boardY, boardWidth, boardHeight] of [
    [-19.1, 0.83, -21.42, 0, 0.76, -1.3, 3.22, 33.7, 10.2],
    [-43.39, 5.08, -8.35, Math.PI / 2, 1.12, -2.35, 1.02, 27.5, 13.4],
  ]) {
    const wall = new THREE.Group();
    wall.name = 'Herramientas en panel perforado';
    wall.position.set(x, y, z);
    wall.rotation.y = angle;
    parent.add(wall);
    const west = angle !== 0;
    const rackX = west ? 2.04 : 0;
    const rackTop = west ? 0.61 : 0.89;
    const peg = (u: number, v: number, depth: number) => {
      const px = (0.5 + (u - boardX) / boardWidth) * 768;
      const py = (0.5 + (boardY - v) / boardHeight) * 288;
      return new THREE.Vector3(boardX + ((13 + 23 * Math.round((px - 13) / 23)) / 768 - 0.5) * boardWidth,
        boardY + (0.5 - (15 + 23 * Math.round((py - 15) / 23)) / 288) * boardHeight, depth);
    };
    const lastHook = peg(rackX - 1.26 * scale, 0.7, 0).x;
    for (const [i, [size, tilt]] of [
      [1.33, -0.031], [1.16, 0.024], [1.00, -0.022], [0.85, 0.038], [0.73, 0.012],
    ].entries()) {
      const dimension = size * scale * (west ? 0.77 : 1);
      const ring = dimension * 1.047;
      const hook = peg(lastHook - (4 - i) * boardWidth * 23 / 768, west ? 0.69 : 1.20, -0.074);
      const tool = fit(wall, wrench, i === 0 ? forged : machined);
      tool.scale.setScalar(dimension);
      tool.position.set(hook.x + Math.sin(tilt) * ring, hook.y - Math.cos(tilt) * ring - (0.113 * dimension - 0.033), 0.132);
      tool.rotation.z = tilt;
      const bend = hook.clone().setZ(0.268);
      rod(wall, forged, 0.033, hook, bend);
      rod(wall, forged, 0.033, bend, bend.clone().add(new THREE.Vector3(0, 0.117, 0.035)));
      casting(wall, blackened, hook.x, hook.y, -0.021, 0.123, 0.129, 0.035);
    }
    const holder = fit(wall, rack, blackened);
    holder.position.set(rackX, rackTop, 0);
    holder.scale.x = scale;
    for (const horizontal of [0.13, 3.98]) {
      const xMount = rackX + horizontal * scale;
      const mount = peg(xMount, rackTop - 0.08, -0.054);
      casting(wall, blackened, mount.x, mount.y - 0.07, 0.014, 0.15, 0.40, 0.12);
      rod(wall, forged, 0.029, mount, mount.clone().setZ(0.086));
      rod(wall, blackened, 0.047, new THREE.Vector3(mount.x, mount.y - 0.17, 0.062), new THREE.Vector3(xMount, rackTop - 0.12, 0.466));
    }
    for (const [i, horizontal] of driverSlots.entries()) {
      const xSlot = rackX + horizontal * scale;
      const length = [1.24, 1.53, 1.12, 1.66][i];
      const top = rackTop + 0.019;
      const shaftEnd = top - length;
      rod(wall, machined, i === 3 ? 0.035 : 0.045, new THREE.Vector3(xSlot, shaftEnd, 0.345), new THREE.Vector3(xSlot, top + 0.12, 0.345));
      const grip = fit(wall, driverGrip, grips[i]);
      grip.position.set(xSlot, top, 0.345);
      grip.scale.set(i === 3 ? 0.87 : 1, i === 1 ? 1.09 : 1, i === 3 ? 0.87 : 1);
      const collar = fit(wall, dowel, i === 0 ? brass : blackened);
      collar.scale.set(0.099, 0.064, 0.099);
      collar.position.set(xSlot, top + 0.027, 0.345);
      if (i === 0) casting(wall, forged, xSlot, shaftEnd - 0.069, 0.345, 0.103, 0.15, 0.035);
      else {
        const point = fit(wall, i === 2 ? socketTip : tip, forged);
        point.position.set(xSlot, shaftEnd - 0.074, 0.345);
        if (i === 2) rod(wall, forged, 0.076, new THREE.Vector3(xSlot, shaftEnd - 0.004, 0.345),
          new THREE.Vector3(xSlot, shaftEnd + 0.023, 0.345));
      }
    }
  }
}

function filings(parent: THREE.Object3D) {
  const { canvas, context } = canvas2d(256, 128);
  const rng = random(2902);
  const stain = context.createRadialGradient(143, 64, 8, 143, 64, 70);
  stain.addColorStop(0, 'rgba(30,23,17,.43)');
  stain.addColorStop(1, 'rgba(30,23,17,0)');
  context.fillStyle = stain;
  context.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 180; i++) {
    const angle = rng() * Math.PI * 2;
    const spread = rng() ** 1.5;
    const x = 137 + Math.cos(angle) * spread * 116;
    const y = 65 + Math.sin(angle) * spread * 59;
    context.strokeStyle = i % 3 ? 'rgba(176,162,133,.57)' : 'rgba(58,49,38,.64)';
    context.lineWidth = 0.56 + rng();
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + (rng() - 0.4) * 7, y + (rng() - 0.5) * 6);
    context.stroke();
  }
  const patch = new THREE.Mesh(new THREE.PlaneGeometry(4.32, 2.21),
    new THREE.MeshBasicMaterial({ map: texture(canvas), transparent: true, depthWrite: false }));
  patch.rotation.x = -Math.PI / 2;
  patch.position.set(0.10, 0.011, 0.16);
  parent.add(patch);
}

function viceBody(profile: readonly (readonly [number, number])[], width: number) {
  const face = new THREE.Shape();
  profile.forEach(([z, y], i) => i === 0 ? face.moveTo(z, y) : face.lineTo(z, y));
  face.closePath();
  return new THREE.ExtrudeGeometry(face, { depth: width, bevelSize: 0.061, bevelThickness: 0.073,
    bevelSegments: 2, curveSegments: 4 }).rotateY(-Math.PI / 2).translate(width / 2, 0, 0);
}

function clampedStock(parent: THREE.Object3D, rear: number, front: number) {
  const edge = new THREE.Shape();
  const thin = 0.007;
  edge.moveTo(-0.78, -rear - thin);
  edge.lineTo(1.55, -rear - thin);
  edge.lineTo(1.68, -rear - thin - 0.060);
  edge.lineTo(1.68, -front + thin + 0.044);
  edge.lineTo(1.59, -front + thin);
  edge.lineTo(-0.78, -front + thin);
  edge.closePath();
  for (const x of [0.79, 1.17, 1.46]) {
    const drilling = new THREE.Path();
    drilling.absarc(x, -(front + rear) / 2, x > 1.3 ? 0.071 : 0.080, 0, Math.PI * 2, true);
    edge.holes.push(drilling);
  }
  const metal = fit(parent, new THREE.ExtrudeGeometry(edge, { depth: 0.167, bevelSize: thin,
    bevelThickness: 0.007, bevelSegments: 1, curveSegments: 9 }).rotateX(-Math.PI / 2), brass);
  metal.name = 'Pieza de latón entre mordazas';
  metal.position.y = 1.284;
  for (const x of [1.31, 1.37, 1.58]) box(parent, forged, x, 1.461, (front + rear) / 2,
    0.008, 0.003, 0.259, false);
}

function tabletopMaterial() {
  const { canvas, context } = canvas2d(512, 224);
  const rng = random(7981);
  context.fillStyle = '#aa794d';
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 2050; i++) {
    const x = rng() * canvas.width, y = rng() * canvas.height;
    context.strokeStyle = i % 3 ? 'rgba(45,27,17,.13)' : 'rgba(253,211,154,.19)';
    context.lineWidth = 0.30 + rng() * 0.90;
    context.beginPath();
    context.moveTo(x, y);
    const span = 8 + rng() * 128;
    context.quadraticCurveTo(x + span * 0.55, y + (rng() - 0.5) * 3, x + span, y + (rng() - 0.5) * 2.5);
    context.stroke();
  }
  for (const y of [0.29, 0.64]) {
    context.fillStyle = 'rgba(48,30,18,.18)';
    context.fillRect(0, y * canvas.height, canvas.width, 1.3);
  }
  const grain = texture(canvas);
  return new THREE.MeshStandardMaterial({ color: 0xd0bb9b, map: grain, bumpMap: grain, bumpScale: 0.017, roughness: 0.81 });
}

function buildFile(parent: THREE.Object3D) {
  const file = new THREE.Group();
  file.name = 'Lima plana apoyada';
  file.position.set(-1.44, 0.099, 0.84);
  file.rotation.set(0, -0.40, -0.061, 'YXZ');
  parent.add(file);

  const { canvas, context } = canvas2d(224, 64);
  context.fillStyle = '#777671';
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let x = -75; x < canvas.width + 75; x += 5) {
    for (const [tilt, color] of [[26, '#353531'], [-53, '#9a9890']] as const) {
      context.beginPath();
      context.strokeStyle = color;
      context.lineWidth = 0.85;
      context.moveTo(x, 0);
      context.lineTo(x + tilt, canvas.height);
      context.stroke();
    }
  }
  const teeth = texture(canvas);
  const bladeGeometry = new RoundedBoxGeometry(1.91, 0.042, 0.294, 1, 0.013);
  const vertices = bladeGeometry.getAttribute('position');
  for (let i = 0; i < vertices.count; i++) {
    const t = (vertices.getX(i) + 0.955) / 1.91;
    vertices.setZ(i, vertices.getZ(i) * (1 - 0.31 * t));
  }
  bladeGeometry.computeVertexNormals();
  const blade = fit(file, bladeGeometry, new THREE.MeshStandardMaterial({ color: 0xb6b0a4, map: teeth, bumpMap: teeth,
    bumpScale: 0.011, metalness: 0.61, roughness: 0.52 }));
  blade.position.x = 0.352;
  const grip = fit(file, new THREE.LatheGeometry([[0, -1.56], [0.082, -1.53], [0.142, -1.43], [0.152, -1.25],
    [0.151, -1.04], [0.138, -0.86], [0.106, -0.63], [0.09, -0.51], [0, -0.50]].map(([r, x]) => new THREE.Vector2(r, x)), 24), handle);
  grip.rotation.z = -Math.PI / 2;
  rod(file, brass, 0.108, new THREE.Vector3(-0.704, 0, 0), new THREE.Vector3(-0.551, 0, 0));
  for (const x of [-0.681, -0.576]) rod(file, forged, 0.109, new THREE.Vector3(x, 0, 0), new THREE.Vector3(x + 0.012, 0, 0));
}

export function buildViseStation(parent: THREE.Object3D) {
  finishSteel();
  const table = new THREE.Group();
  table.name = 'Banco de morsa';
  table.position.set(-25.45, -0.141, -0.91);
  table.rotation.y = Math.PI * 0.43;
  table.scale.setScalar(0.78);
  parent.add(table);
  const base = standard(0x4d5045, 0.72, 0.30);
  const floorShadow = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.86, 0.76), horizontalShadow(), 4);
  const footprint = new THREE.Object3D();
  footprint.rotation.x = -Math.PI / 2;
  let foot = 0;
  for (const x of [-2.72, 2.72]) {
    for (const z of [-1.18, 1.18]) {
      casting(table, base, x, 1.19, z, 0.26, 2.38, 0.26);
      casting(table, blackened, x, 0.061, z, 0.43, 0.122, 0.43);
      footprint.position.set(x, 0.005, z);
      footprint.updateMatrix();
      floorShadow.setMatrixAt(foot++, footprint.matrix);
    }
    box(table, base, x, 0.46, 0, 0.22, 0.22, 2.37);
  }
  floorShadow.computeBoundingSphere();
  table.add(floorShadow);
  box(table, base, 0, 1.99, -1.15, 5.54, 0.35, 0.20);
  box(table, base, 0, 0.46, -1.12, 5.45, 0.17, 0.18);
  casting(table, tabletopMaterial(), 0, 2.40, 0, 6.52, 0.28, 3.01);
  box(table, handle, 0, 2.29, 1.49, 6.49, 0.12, 0.075, false);
  const station = new THREE.Group();
  station.position.y = 2.54;
  table.add(station);
  filings(station);

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.52, 2.63), horizontalShadow());
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.007;
  station.add(shadow);
  const vise = new THREE.Group();
  vise.name = 'Morsa con base y mordaza móvil';
  station.add(vise);

  for (const [radius, y, height, material] of [[1.02, 0.076, 0.146, blackened], [0.942, 0.164, 0.079, forged],
    [0.908, 0.232, 0.113, viceEnamel]] as const) {
    const flange = fit(vise, dowel, material);
    flange.position.y = y;
    flange.scale.set(radius, height, radius);
  }
  for (const x of [-1.12, 1.12]) {
    for (const z of [-0.54, 0.54]) {
      casting(vise, blackened, x, 0.067, z, 0.52, 0.128, 0.42);
      const washer = fit(vise, dowel, forged);
      washer.position.set(x, 0.147, z);
      washer.scale.set(0.121, 0.028, 0.121);
      const bolt = fit(vise, hexHead, machined);
      bolt.position.set(x, 0.190, z);
      bolt.scale.set(0.082, 0.059, 0.082);
    }
  }
  const fixed = fit(vise, viceBody([[-1.02, 0.26], [-1.12, 0.62], [-0.94, 0.82], [-0.89, 1.24], [-0.74, 1.37],
    [-0.46, 1.36], [-0.38, 1.25], [-0.52, 0.94], [-0.33, 0.77], [0.31, 0.73], [0.31, 0.35], [0.10, 0.24]], 1.59), viceEnamel);
  fixed.name = 'Cuerpo fijo';
  casting(vise, blackened, 0, 0.617, 0.351, 1.28, 0.316, 0.104);
  const slide = casting(vise, machined, 0, 0.623, 0.572, 0.925, 0.214, 0.81);
  slide.name = 'Guía rectangular';
  const moving = fit(vise, viceBody([[-0.107, 0.74], [-0.081, 1.28], [0.141, 1.36], [0.31, 1.21], [0.39, 0.99],
    [0.62, 0.83], [0.89, 0.79], [0.95, 0.67], [0.90, 0.51], [0.49, 0.47], [0.15, 0.56]], 1.51), viceEnamel);
  moving.name = 'Mordaza móvil';

  const fixedJawZ = -0.55, movingJawZ = 0.075, jawDepth = 0.27;
  for (const [z, inward] of [[fixedJawZ, 1], [movingJawZ, -1]]) {
    casting(vise, machined, 0, 1.399, z, 2.12, 0.258, jawDepth);
    const contactZ = z + inward * jawDepth / 2;
    for (let i = -9; i <= 9; i++) {
      box(vise, blackened, i * 0.098, 1.413, contactZ + inward * 0.0035, 0.012, 0.184, 0.008, false);
    }
    for (const y of [1.338, 1.394, 1.450]) box(vise, blackened, 0, y, contactZ + inward * 0.005, 1.89, 0.007, 0.006, false);
    for (const x of [-0.74, 0.74]) rod(vise, blackened, 0.051, new THREE.Vector3(x, 1.400, z - inward * 0.130),
      new THREE.Vector3(x, 1.400, z - inward * 0.142));
  }
  clampedStock(vise, fixedJawZ + jawDepth / 2, movingJawZ - jawDepth / 2);

  const axis = 0.628;
  for (const [from, to, radius, material] of [[0.82, 1.012, 0.235, viceEnamel], [0.977, 1.139, 0.188, forged],
    [1.120, 1.402, 0.163, machined], [1.356, 1.404, 0.169, blackened]] as const) {
    rod(vise, material, radius, new THREE.Vector3(0, axis, from), new THREE.Vector3(0, axis, to));
  }
  const low = new THREE.Vector3(-0.88, axis - 0.239, 1.297), high = new THREE.Vector3(1.12, axis + 0.304, 1.297);
  rod(vise, machined, 0.055, low, high);
  for (const at of [low, high]) {
    const cap = fit(vise, endCap, machined);
    cap.position.copy(at);
    cap.scale.setScalar(0.087);
  }
  buildFile(station);
}
