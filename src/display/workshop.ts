import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ROAD_HALF, TRACK, roadHalfAt, wallHalfAt } from '../shared/track';
import { buildDioramaStation } from './diorama-station';
import { makeAdjustableWrench, populateToolCup } from './hand-tool-models';
import { BENCH_SURFACE, benchMap, box, canvas2d, horizontalShadow, noiseField, random, standard, texture } from './materials';
import { buildServiceStation } from './service-station';
import { buildViseStation, dressPegboards } from './workshop-tools';

const steel = standard(0x87867e, 0.36, 0.69);
const darkSteel = standard(0x3c3e3d, 0.59, 0.49);
const castFoot = standard(0x686557, 0.87, 0.13);
const BOARD_SURFACE = -0.23;

type Contact = [x: number, y: number, z: number, width: number, depth: number, yaw?: number];

function addContacts(parent: THREE.Object3D, footprints: Contact[]) {
  const shadows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), horizontalShadow(), footprints.length);
  const transform = new THREE.Object3D();
  for (const [index, [x, y, z, width, depth, yaw = 0]] of footprints.entries()) {
    transform.position.set(x, y + 0.007, z);
    transform.rotation.set(-Math.PI / 2, 0, yaw);
    transform.scale.set(width, depth, 1);
    transform.updateMatrix();
    shadows.setMatrixAt(index, transform.matrix);
  }
  shadows.computeBoundingSphere();
  parent.add(shadows);
}

function coil(radius: number, length: number, turns: number, wire: number) {
  const segments = Math.ceil(turns * 16);
  const points = Array.from({ length: segments + 1 }, (_, index) => {
    const t = index / segments;
    const angle = t * turns * Math.PI * 2;
    return new THREE.Vector3(radius * Math.cos(angle), (t - 0.5) * length, radius * Math.sin(angle));
  });
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segments, wire, 5, false);
}

function benchWear(map: THREE.Texture) {
  const canvas = map.image as HTMLCanvasElement;
  const paint = canvas.getContext('2d')!;
  const rng = random(1307);
  const wash = paint.createLinearGradient(0, canvas.height * 0.78, 0, canvas.height);
  wash.addColorStop(0, 'rgba(132,85,50,0)');
  wash.addColorStop(0.84, 'rgba(146,87,44,.24)');
  wash.addColorStop(1, 'rgba(30,17,13,.40)');
  paint.fillStyle = wash;
  paint.fillRect(0, canvas.height * 0.78, canvas.width, canvas.height * 0.22);

  for (const seam of [0.146, 0.395, 0.784]) {
    const y = seam * canvas.height;
    paint.strokeStyle = 'rgba(27,18,13,.28)';
    paint.lineWidth = 1.4;
    paint.beginPath();
    paint.moveTo(0, y);
    paint.bezierCurveTo(canvas.width * 0.35, y - 3, canvas.width * 0.72, y + 2, canvas.width, y - 1);
    paint.stroke();
  }
  for (const [x, y, spreadX, spreadY] of [[0.47, 0.154, 0.095, 0.073], [0.29, 0.238, 0.068, 0.072], [0.55, 0.935, 0.23, 0.042]]) {
    for (let i = 0; i < 130; i++) {
      const px = canvas.width * (x + (rng() - 0.5) * spreadX);
      const py = canvas.height * (y + (rng() - 0.5) * spreadY);
      const length = 2 + 36 * rng() ** 2;
      const slope = (rng() - 0.5) * length * 0.8;
      paint.strokeStyle = i % 3 === 0 ? 'rgba(211,155,92,.42)' : 'rgba(35,23,19,.46)';
      paint.lineWidth = 0.55 + rng() * 1.15;
      paint.beginPath();
      paint.moveTo(px, py);
      paint.lineTo(px + length, py + slope);
      paint.stroke();
    }
  }
  map.needsUpdate = true;
}

function buildBench(parent: THREE.Object3D) {
  const { color, rough } = benchMap();
  benchWear(color);
  const bench = new THREE.MeshPhysicalMaterial({ color: 0xe1c6ad, map: color, roughnessMap: rough, roughness: 0.91,
    bumpMap: color, bumpScale: 0.034, clearcoat: 0.28, clearcoatRoughness: 0.41 });
  const edge = new THREE.MeshStandardMaterial({ color: 0xa38064, map: color, roughness: 0.74, bumpMap: color, bumpScale: 0.042 });
  const polishedEdge = bench.clone();
  polishedEdge.color.set(0xdbba8d);
  polishedEdge.roughness = 0.71;
  polishedEdge.clearcoat = 0.48;
  const front = 17.65;
  box(parent, bench, 0, BENCH_SURFACE - 0.44, -4.18, 105, 0.88, 43.65);
  box(parent, edge, 0, BENCH_SURFACE - 1.91, front - 0.29, 105, 2.10, 0.72);
  box(parent, polishedEdge, 0, BENCH_SURFACE - 0.27, front - 0.083, 105, 0.49, 0.19).rotation.x = -0.12;
  const backWall = box(parent, standard(0x25211c), 0, 8.1, -23.3, 106, 23, 1.04, false);
  box(parent, edge, 0, BENCH_SURFACE + 0.62, -22.32, 105, 1.24, 1.29);

  const { canvas, context } = canvas2d(768, 288);
  const rng = random(507);
  context.fillStyle = '#866138';
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 4500; i++) {
    context.fillStyle = rng() < 0.5 ? 'rgba(19,12,10,.08)' : 'rgba(247,205,142,.09)';
    context.fillRect(rng() * canvas.width, rng() * canvas.height, 1 + rng() * 70, 1 + rng());
  }
  for (let x = 13; x < canvas.width; x += 23) {
    for (let y = 15; y < canvas.height; y += 23) {
      context.beginPath();
      context.fillStyle = '#36271b';
      context.arc(x, y, 3.65, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.strokeStyle = '#b68a54';
      context.arc(x, y, 3.8, 0, Math.PI);
      context.stroke();
    }
  }
  const perforation = new THREE.MeshStandardMaterial({ map: texture(canvas), roughness: 0.9 });
  box(parent, edge, -20.4, 4.05, -21.93, 34.6, 10.8, 0.55);
  box(parent, perforation, -20.4, 4.05, -21.59, 33.7, 10.2, 0.26);
  box(parent, edge, -44, 6.30, -6.0, 0.82, 16.2, 32.4, false);
  const westPegs = perforation.clone();
  westPegs.color.set(0xc1b199);
  box(parent, westPegs, -43.54, 6.10, -6.0, 0.24, 13.4, 27.5, false);
  for (const y of [2.65, 6.82]) {
    box(parent, polishedEdge, -42.08, y, -7.6, 3.05, 0.31, 21.7, false);
  }
  const cupboard = new THREE.Mesh(new RoundedBoxGeometry(2.25, 3.32, 6.1, 2, 0.16),
    standard(0x564139, 0.58, 0.44));
  cupboard.position.set(-42.11, 4.47, -1.80);
  parent.add(cupboard);
  box(parent, steel, -40.95, 4.45, -1.80, 0.22, 0.15, 1.9, false);
  const shade = new THREE.Mesh(new THREE.LatheGeometry([
    new THREE.Vector2(1.36, 0), new THREE.Vector2(1.25, 0.24), new THREE.Vector2(0.73, 1.03),
    new THREE.Vector2(0.38, 1.36), new THREE.Vector2(0.31, 1.44),
  ], 24), darkSteel);
  const shadePosition = new THREE.Vector3(-40.5, 7.54, -0.90);
  shade.position.copy(shadePosition);
  parent.add(shade);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(1.29, 0.045, 6, 24), steel);
  lip.rotation.x = Math.PI / 2;
  lip.position.copy(shadePosition);
  lip.position.y += 0.025;
  parent.add(lip);
  const diffuser = new THREE.Mesh(new THREE.CircleGeometry(1.24, 24),
    new THREE.MeshBasicMaterial({ color: 0xffbf77, side: THREE.DoubleSide }));
  diffuser.rotation.x = Math.PI / 2;
  diffuser.position.copy(shadePosition);
  diffuser.position.y += 0.006;
  parent.add(diffuser);
  box(parent, darkSteel, -42.23, shadePosition.y + 1.36, shadePosition.z, 3.46, 0.18, 0.20, false);
  const taskLight = new THREE.SpotLight(0xffbd80, 145, 22, 0.51, 0.72, 2);
  taskLight.position.copy(shadePosition);
  taskLight.position.y -= 0.19;
  taskLight.target.position.set(-34.7, BENCH_SURFACE + 2.75, 1.3);
  parent.add(taskLight, taskLight.target);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), standard(0x211714));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -7.5;
  floor.receiveShadow = true;
  parent.add(floor);
  return backWall;
}

function buildWestBench(parent: THREE.Object3D, contacts: Contact[]) {
  const casework = new THREE.Group();
  casework.position.set(-42.00, BENCH_SURFACE, 9.8);
  casework.rotation.y = 1.48;
  parent.add(casework);
  contacts.push([casework.position.x, BENCH_SURFACE, casework.position.z, 11.2, 5.9, casework.rotation.y]);

  const hardwood = standard(0x725238, 0.84);
  const steelCase = standard(0x575648, 0.56, 0.47);
  const darkSeam = standard(0x26221c, 0.79);
  const primer = standard(0x736348, 0.62, 0.30);
  box(casework, hardwood, 0, 0.18, 0, 10.2, 0.36, 4.58);
  box(casework, steelCase, 0, 1.47, 0, 9.58, 2.22, 4.18);
  box(casework, darkSeam, 0, 1.51, 2.10, 8.99, 1.97, 0.064, false);
  box(casework, primer, 0, 2.61, 0, 9.68, 0.16, 4.3);
  for (const y of [1.02, 1.99]) {
    box(casework, steelCase, 0, y, 2.17, 8.72, 0.83, 0.17, false);
    box(casework, primer, 0, y - 0.36, 2.275, 8.65, 0.055, 0.085, false);
    for (const side of [-1, 1]) box(casework, darkSteel, side * 1.78, y + 0.09, 2.40, 0.23, 0.19, 0.34, false);
    box(casework, steel, 0, y + 0.09, 2.55, 3.73, 0.14, 0.16, false);
  }

  const tin = new THREE.Mesh(new RoundedBoxGeometry(4.05, 1.04, 2.72, 2, 0.13), standard(0x5f4933, 0.50, 0.42));
  tin.position.set(2.52, 3.21, -0.27);
  tin.rotation.y = -0.16;
  tin.receiveShadow = true;
  casework.add(tin);
  box(casework, darkSeam, 2.56, 3.54, -0.03, 4.04, 0.075, 2.76, false).rotation.y = -0.16;
  box(casework, steel, 2.41, 3.41, 1.14, 0.46, 0.26, 0.15, false);

  const oilCan = new THREE.Group();
  oilCan.position.set(-36.65, BENCH_SURFACE, 13.22);
  parent.add(oilCan);
  contacts.push([oilCan.position.x, BENCH_SURFACE, oilCan.position.z, 3.5, 3.6]);
  const paintedTin = standard(0x6b3b26, 0.59, 0.37);
  const can = new THREE.Mesh(new THREE.CylinderGeometry(1.16, 1.31, 1.83, 22), paintedTin);
  can.position.y = 0.94;
  can.castShadow = can.receiveShadow = true;
  oilCan.add(can);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.96, 1.16, 0.36, 22), darkSteel);
  lid.position.y = 1.98;
  lid.receiveShadow = true;
  oilCan.add(lid);
  const spout = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.04, 2.12, 0.03), new THREE.Vector3(0.46, 2.47, 0.12), new THREE.Vector3(1.17, 2.65, 0.37),
    new THREE.Vector3(1.75, 2.62, 0.55),
  ]);
  oilCan.add(new THREE.Mesh(new THREE.TubeGeometry(spout, 12, 0.10, 7, false), steel));
}

function buildWrench(parent: THREE.Object3D, contacts: Contact[]) {
  const wrench = makeAdjustableWrench();
  wrench.position.set(-0.8, BENCH_SURFACE + 0.123, -19.15);
  wrench.rotation.y = 0.15;
  wrench.scale.setScalar(1.35);
  parent.add(wrench);
  contacts.push([wrench.position.x, BENCH_SURFACE, wrench.position.z, 22.5, 4.65, wrench.rotation.y]);
}

function buildChest(parent: THREE.Object3D, contacts: Contact[]) {
  const chest = new THREE.Group();
  chest.position.set(31.55, BENCH_SURFACE, -19.3);
  chest.rotation.y = 0.022;
  chest.scale.set(1.53, 1.89, 1.22);
  parent.add(chest);
  contacts.push([chest.position.x, BENCH_SURFACE, chest.position.z + 0.3, 24.6, 8.5, chest.rotation.y]);
  const { canvas, context } = canvas2d(640, 240);
  const rng = random(833);
  const dirt = noiseField(34, 23, rng);
  const scratch = noiseField(127, 64, rng);
  const flakes = context.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const u = x / canvas.width;
      const v = y / canvas.height;
      const edgeWear = 1 - Math.min(1, 11 * Math.min(u, 1 - u, v, 1 - v));
      const speck = scratch(u, v);
      const mottling = (dirt(u, v) - 0.5) * 48;
      const chip = Math.max(0, (speck - 0.75 + edgeWear * 0.088) * 4.4);
      const shade = (rng() - 0.5) * 10 + mottling;
      const i = (y * canvas.width + x) * 4;
      flakes.data[i] = 158 + shade - chip * 69;
      flakes.data[i + 1] = 27 + shade * 0.48 + chip * 37;
      flakes.data[i + 2] = 14 + shade * 0.38 + chip * 38;
      flakes.data[i + 3] = 255;
    }
  }
  context.putImageData(flakes, 0, 0);
  for (let i = 0; i < 118; i++) {
    const x = rng() * canvas.width;
    const y = (i % 2 ? 1 : canvas.height - 2) + (i % 2 ? 1 : -1) * rng() ** 2 * 41;
    const length = 1 + rng() ** 3 * 16;
    context.fillStyle = i % 5 === 0 ? 'rgba(193,145,106,.56)' : 'rgba(65,28,20,.44)';
    context.fillRect(x, y, length, 0.7 + rng() * 1.55);
  }
  const enamel = texture(canvas);
  const red = new THREE.MeshPhysicalMaterial({ color: 0xffe7dd, map: enamel, roughness: 0.39, metalness: 0.21,
    bumpMap: enamel, bumpScale: 0.022, clearcoat: 0.53, clearcoatRoughness: 0.34 });
  const bright = red.clone();
  bright.color.set(0xffffff);
  const seam = standard(0x271a16, 0.72);
  const metal = standard(0xbdb4a8, 0.22, 0.76);
  const rounded = (width: number, height: number, depth: number, bevel: number, material: THREE.Material, y: number, z: number) => {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(width, height, depth, 3, bevel), material);
    mesh.position.set(0, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    chest.add(mesh);
  };
  rounded(14.15, 5.02, 4.97, 0.14, red, 2.54, 0);
  box(chest, seam, 0, 2.58, 2.5, 12.98, 4.48, 0.15);
  box(chest, bright, 0, 5.09, 0, 14.32, 0.31, 5.13);
  box(chest, darkSteel, 0, 5.25, 0, 12.8, 0.056, 4.02);
  const grip = new THREE.CurvePath<THREE.Vector3>();
  const gripPoint = (x: number, z: number) => new THREE.Vector3(x, 0, z);
  grip.add(new THREE.CubicBezierCurve3(gripPoint(-5.16, 0), gripPoint(-5.16, 0.30), gripPoint(-5.10, 0.41), gripPoint(-4.90, 0.41)));
  grip.add(new THREE.LineCurve3(gripPoint(-4.90, 0.41), gripPoint(4.90, 0.41)));
  grip.add(new THREE.CubicBezierCurve3(gripPoint(4.90, 0.41), gripPoint(5.10, 0.41), gripPoint(5.16, 0.30), gripPoint(5.16, 0)));
  const gripGeometry = new THREE.TubeGeometry(grip, 52, 0.115, 8, false);
  const socketGeometry = new THREE.LatheGeometry([
    [0.55, 0], [0.97, 0], [1.0, 0.13], [1.0, 0.80], [0.88, 1.0],
    [0.55, 1.0], [0.49, 0.91], [0.49, 0.12], [0.55, 0],
  ].map(([x, y]) => new THREE.Vector2(x, y)), 12);
  for (let i = 0; i < 3; i++) {
    const y = 1.16 + i * 1.42;
    const travel = i === 1 ? 1.48 : 0;
    rounded(12.73, 1.25, 0.32, 0.12, bright, y, 2.63 + travel);
    box(chest, red, 0, y - 0.51, 2.787 + travel, 12.49, 0.07, 0.08, false);
    for (const side of [-1, 1]) box(chest, darkSteel, side * 5.16, y + 0.21, 2.80 + travel, 0.38, 0.33, 0.15, false);
    const handle = new THREE.Mesh(gripGeometry, metal);
    handle.position.set(0, y + 0.21, 2.87 + travel);
    handle.castShadow = handle.receiveShadow = true;
    chest.add(handle);
    if (travel > 0) {
      box(chest, seam, 0, y - 0.21, 2.58 + travel / 2, 12.42, 0.16, travel, false);
      for (const side of [-1, 1]) box(chest, red, side * 6.22, y + 0.01, 2.58 + travel / 2, 0.18, 0.58, travel, false);
      box(chest, darkSteel, 0.1, y - 0.10, 3.13, 11.94, 0.14, 0.94, false);
      box(chest, steel, -3.50, y + 0.14, 3.33, 3.85, 0.18, 0.17, false).rotation.y = 0.065;
      for (let j = 0; j < 7; j++) {
        const socket = new THREE.Mesh(socketGeometry, metal);
        const radius = 0.19 + j * 0.022;
        socket.position.set(-0.92 + j * 0.76, y - 0.012, 3.39);
        socket.scale.set(radius, 0.31 + j * 0.044, radius);
        socket.receiveShadow = true;
        chest.add(socket);
      }
      box(chest, seam, 4.83, y + 0.10, 3.23, 1.75, 0.20, 0.47, false);
    }
  }
  for (const x of [-5.6, 5.6]) {
    for (const z of [-1.68, 1.68]) box(chest, seam, x, 0.11, z, 1.08, 0.22, 0.76);
  }
}

function buildCan(parent: THREE.Object3D, contacts: Contact[]) {
  const can = new THREE.Group();
  can.position.set(-29.9, BENCH_SURFACE, -19.40);
  can.scale.setScalar(1.49);
  parent.add(can);
  contacts.push([can.position.x, BENCH_SURFACE, can.position.z, 4.35, 4.2]);
  const brushed = canvas2d(256, 192);
  const rng = random(765);
  const finish = brushed.context.createLinearGradient(0, 0, 0, brushed.canvas.height);
  finish.addColorStop(0, '#c0b8a8');
  finish.addColorStop(0.50, '#8b7f70');
  finish.addColorStop(1, '#706454');
  brushed.context.fillStyle = finish;
  brushed.context.fillRect(0, 0, brushed.canvas.width, brushed.canvas.height);
  for (let i = 0; i < 720; i++) {
    brushed.context.fillStyle = i % 3 ? 'rgba(37,28,22,.15)' : 'rgba(223,206,173,.32)';
    brushed.context.fillRect(rng() * 256, rng() * 192, 1 + 30 * rng() ** 2, 0.45 + rng());
  }
  const brush = texture(brushed.canvas);
  const aluminum = new THREE.MeshPhysicalMaterial({ map: brush, roughness: 0.32, metalness: 0.65,
    clearcoat: 0.32, clearcoatRoughness: 0.28, bumpMap: brush, bumpScale: 0.022, side: THREE.DoubleSide });
  const profile = Array.from({ length: 22 }, (_, i) => new THREE.Vector2(1.04 + i * 0.0103, 0.09 + i * 0.124));
  const dentedShell = new THREE.LatheGeometry(profile, 48);
  const vertices = dentedShell.getAttribute('position');
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i);
    const y = vertices.getY(i);
    const z = vertices.getZ(i);
    const angle = Math.atan2(x, z);
    const broadDent = Math.exp(-(((angle - 0.36) / 0.29) ** 2 + ((y - 1.35) / 0.54) ** 2));
    const smallDent = Math.exp(-(((angle + 0.78) / 0.21) ** 2 + ((y - 0.66) / 0.27) ** 2));
    const radius = 1 - broadDent * 0.17 - smallDent * 0.13;
    vertices.setXYZ(i, x * radius, y, z * radius);
  }
  dentedShell.computeVertexNormals();
  const cup = new THREE.Mesh(dentedShell, aluminum);
  cup.castShadow = cup.receiveShadow = true;
  can.add(cup);
  const bottom = new THREE.Mesh(new THREE.CylinderGeometry(1.055, 1.055, 0.12, 36), darkSteel);
  bottom.position.y = 0.13;
  can.add(bottom);
  for (const [y, radius, roll] of [[0.14, 1.045, 0.058], [0.26, 1.060, 0.030], [2.62, 1.257, 0.035], [2.69, 1.251, 0.078]]) {
    const lip = new THREE.Mesh(new THREE.TorusGeometry(radius, roll, 7, 40), steel);
    lip.rotation.x = Math.PI / 2;
    lip.position.y = y;
    can.add(lip);
  }
  populateToolCup(can);
}

interface LightPool {
  s: number;
  x: number;
  z: number;
  yaw: number;
  spread: number;
}

interface Floodlight {
  x: number;
  z: number;
  height: number;
  aim: number;
  aimOffset?: number;
  faceYaw?: number;
  footYaw?: number;
}

// Front feet and cable share the positions derived from the atlas anchors.
const FRONT_TOWERS = [
  { s: -8.97, margin: 0.48, height: 3.37, aim: -16.9 },
  { s: 6.44, margin: 1.03, height: 3.03, aim: -4.4 },
] as const;

function bakeLightPools(parent: THREE.Object3D, pools: LightPool[]) {
  const { canvas, context } = canvas2d(64, 64);
  const glow = context.createRadialGradient(32, 32, 1, 32, 32, 32);
  glow.addColorStop(0, 'rgba(246,169,104,.24)');
  glow.addColorStop(0.46, 'rgba(235,156,79,.11)');
  glow.addColorStop(1, 'rgba(222,135,47,0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, 64, 64);
  const material = new THREE.MeshBasicMaterial({ map: texture(canvas), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false });
  material.name = 'Luz sobre la calzada';
  const positions: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  const samples = TRACK.samples;
  const spacing = samples[1].s;
  for (const { s, x, z, yaw, spread } of pools) {
    const start = Math.floor((s - 5.3) / spacing);
    const end = Math.ceil((s + 5.3) / spacing);
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    for (let step = start; step <= end; step++) {
      const p = samples[(step + samples.length) % samples.length];
      const first = positions.length / 3;
      for (const side of [-1, 1]) {
        const offset = side * (roadHalfAt(p.s) - 0.035);
        const px = p.x - p.dz * offset;
        const pz = p.z + p.dx * offset;
        positions.push(px, TRACK.heightAt(p.s, offset) + 0.007, pz);
        uv.push(0.5 + ((px - x) * cos - (pz - z) * sin) / (5.0 * spread),
          0.5 + ((px - x) * sin + (pz - z) * cos) / (6.8 * spread));
      }
      if (step < end) indices.push(first, first + 1, first + 2, first + 2, first + 1, first + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  parent.add(new THREE.Mesh(geometry, material));
}

function buildFloodlights(parent: THREE.Object3D, contacts: Contact[]) {
  const bulb = new THREE.MeshStandardMaterial({ color: 0xffe2b8, emissive: 0xffb86e, emissiveIntensity: 2.18, roughness: 0.25 });
  bulb.name = 'Difusor de foco de pista';
  const core = new THREE.MeshBasicMaterial({ color: 0xfff4de, toneMapped: false });
  const bezel = standard(0xb09169, 0.29, 0.63);
  const fixtureGeometry = new RoundedBoxGeometry(0.91, 0.57, 0.29, 2, 0.035);
  const lensGeometry = new RoundedBoxGeometry(0.183, 0.151, 0.035, 2, 0.014);
  const coreGeometry = new RoundedBoxGeometry(0.114, 0.098, 0.012, 2, 0.005);
  const bloom = canvas2d(64, 64);
  const halo = bloom.context.createRadialGradient(32, 32, 2, 32, 32, 32);
  halo.addColorStop(0, 'rgba(255,198,126,.33)');
  halo.addColorStop(0.36, 'rgba(255,178,100,.12)');
  halo.addColorStop(1, 'rgba(255,152,45,0)');
  bloom.context.fillStyle = halo;
  bloom.context.fillRect(0, 0, 64, 64);
  const haloMaterial = new THREE.SpriteMaterial({ map: texture(bloom.canvas), color: 0xffffff,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  haloMaterial.name = 'Halo de foco de pista';
  const outward = (s: number, margin: number, height: number, aim = s + 0.65) => {
    const p = TRACK.sampleAt(s);
    const offset = wallHalfAt(p.s, 1) + margin;
    return { x: p.x - p.dz * offset, z: p.z + p.dx * offset, height: height + p.y, aim, footYaw: Math.atan2(-p.dz, p.dx) };
  };
  const mark = TRACK.anchors;
  const standLamp = TRACK.sampleAt(-10.55);
  const standLampOffset = wallHalfAt(standLamp.s, -1) + 0.48;
  const towers: Floodlight[] = [
    { ...outward(mark.backStraight + 8.8, 0.37, 3.37), faceYaw: 0.44 },
    { ...outward(mark.crest - 11.4, 0.73, 2.66), faceYaw: -0.13 },
    { ...outward(mark.hairpinApex + 1.6, 0.57, 3.45), faceYaw: -0.72 },
    { ...outward(mark.essesMid - 2.0, 0.65, 4.15), faceYaw: -0.83 },
    ...FRONT_TOWERS.map(({ s, margin, height, aim }) => ({ ...outward(s, margin, height, aim), aimOffset: ROAD_HALF - 0.30 })),
    { x: standLamp.x + standLamp.dz * standLampOffset, z: standLamp.z - standLamp.dx * standLampOffset,
      height: 4.62, aim: -10.8, faceYaw: 0.31 },
    { x: 8.34, z: 1.36, height: 3.53, aim: 15.5, faceYaw: -0.63 },
  ];
  const pools: LightPool[] = [];
  for (const [index, { x, z, height, aim, aimOffset = 0, faceYaw, footYaw = 0 }] of towers.entries()) {
    const p = TRACK.sampleAt(aim);
    const aimX = p.x - p.dz * aimOffset;
    const aimZ = p.z + p.dx * aimOffset;
    const yaw = Math.atan2(aimX - x, aimZ - z);
    const reach = Math.hypot(aimX - x, aimZ - z);
    const spread = THREE.MathUtils.clamp(0.86 + (reach - 2.9) * 0.105, 0.86, 1.23);
    pools.push({ s: p.s, x: aimX, z: aimZ, yaw, spread });
    contacts.push([x, BOARD_SURFACE, z, 1.32, 1.19, footYaw]);
    const lamp = new THREE.Group();
    lamp.position.set(x, BOARD_SURFACE, z);
    parent.add(lamp);
    box(lamp, castFoot, 0, 0.07, 0, 0.55, 0.14, 0.44).rotation.y = footYaw;
    box(lamp, darkSteel, 0, height / 2, 0, 0.10, height, 0.105);
    box(lamp, steel, 0, 0.38, 0, 0.145, 0.51, 0.15);
    const front = faceYaw === undefined;
    if (front) box(lamp, steel, -0.11, height - 0.06, 0, 0.34, 0.09, 0.14, false);
    const head = new THREE.Group();
    head.position.set(front ? -0.27 : 0, height, 0);
    head.rotation.set(front ? -0.07 : -0.12, faceYaw ?? yaw, 0, 'YXZ');
    head.scale.setScalar(1.40);
    lamp.add(head);
    const fixture = new THREE.Mesh(fixtureGeometry, darkSteel);
    fixture.castShadow = fixture.receiveShadow = true;
    head.add(fixture);
    box(head, steel, 0, 0.25, 0.14, 0.86, 0.06, 0.16, false);
    box(head, bezel, 0, 0, 0.147, 0.809, 0.477, 0.03, false);
    box(head, darkSteel, 0, 0, -0.16, 0.36, 0.22, 0.083, false);
    for (const y of [-0.12, 0.12]) {
      for (const offset of [-0.251, 0, 0.251]) {
        box(head, darkSteel, offset, y, 0.163, 0.216, 0.18, 0.027, false);
        const lens = new THREE.Mesh(lensGeometry, bulb);
        lens.position.set(offset, y, 0.184);
        head.add(lens);
        const emitter = new THREE.Mesh(coreGeometry, core);
        emitter.position.set(offset, y, 0.206);
        head.add(emitter);
      }
    }
    const flare = new THREE.Sprite(haloMaterial);
    flare.position.set(0, 0, 0.209);
    flare.scale.set(0.88, 0.64, 1);
    head.add(flare);
    if (index !== 3 && index !== 6) {
      const finish = index === 5;
      const beam = new THREE.SpotLight(finish ? 0xffdca9 : 0xffb773, finish ? 23 : index < 6 ? 26 : 36,
        finish ? 17.5 : 13.4, finish ? 0.54 : 0.60, 0.78, 2);
      beam.name = 'Foco de pista';
      beam.userData.finishFloodlight = finish;
      beam.userData.secondary = !finish && index !== 2;
      beam.position.set(x, BOARD_SURFACE + height, z);
      beam.target.position.set(aimX, p.y, aimZ);
      parent.add(beam, beam.target);
    }
  }
  bakeLightPools(parent, pools);
}

function wireFrontLights(parent: THREE.Object3D) {
  const rubber = standard(0x292724, 0.85);
  const copper = standard(0x8d693d, 0.58, 0.45);
  const [left, right] = FRONT_TOWERS;
  const points = Array.from({ length: 23 }, (_, i) => {
    const progress = i / 22;
    const p = TRACK.sampleAt(THREE.MathUtils.lerp(left.s, right.s, progress));
    const offset = wallHalfAt(p.s, 1) + THREE.MathUtils.lerp(left.margin, right.margin, progress) + 0.16 * Math.sin(Math.PI * progress);
    return new THREE.Vector3(p.x - p.dz * offset, BOARD_SURFACE + 0.043, p.z + p.dx * offset);
  });
  const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 72, 0.035, 6, false), rubber);
  cable.receiveShadow = true;
  parent.add(cable);
  for (const [i, p] of points.entries()) {
    if (i % 4 !== 1) continue;
    box(parent, steel, p.x, p.y + 0.012, p.z, 0.12, 0.08, 0.16, false);
  }
  const p = points[10];
  box(parent, darkSteel, p.x, BOARD_SURFACE + 0.113, p.z + 0.16, 0.92, 0.23, 0.51);
  box(parent, rubber, p.x + 0.28, BOARD_SURFACE + 0.238, p.z + 0.16, 0.29, 0.065, 0.22, false);
  const pilot = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 6),
    new THREE.MeshBasicMaterial({ color: 0xf7a652 }));
  pilot.scale.y = 0.40;
  pilot.position.set(p.x - 0.24, BOARD_SURFACE + 0.237, p.z + 0.11);
  parent.add(pilot);
  for (const x of [-0.35, 0.35]) box(parent, copper, p.x + x, BOARD_SURFACE + 0.234, p.z + 0.32, 0.055, 0.018, 0.055, false);
}

function fastenerShapes() {
  const hexagon = new THREE.Shape();
  for (let side = 0; side < 6; side++) {
    const angle = side * Math.PI / 3;
    const x = Math.cos(angle) * 0.24;
    const y = Math.sin(angle) * 0.24;
    if (side === 0) hexagon.moveTo(x, y);
    else hexagon.lineTo(x, y);
  }
  hexagon.closePath();
  const opening = new THREE.Path();
  opening.absarc(0, 0, 0.106, 0, Math.PI * 2, true);
  hexagon.holes.push(opening);
  const nut = new THREE.ExtrudeGeometry(hexagon, { depth: 0.12, bevelEnabled: true,
    bevelSize: 0.022, bevelThickness: 0.020, bevelSegments: 1, curveSegments: 6 });
  nut.rotateX(-Math.PI / 2).translate(0, -0.06, 0);
  const bolt = new THREE.LatheGeometry([[0, -0.31], [0.062, -0.27], [0.091, 0.13], [0.091, 0.18],
    [0.193, 0.19], [0.187, 0.275], [0.14, 0.30], [0, 0.30]].map(([r, y]) => new THREE.Vector2(r, y)), 10);
  const washer = new THREE.LatheGeometry([[0.083, -0.027], [0.215, -0.027], [0.231, -0.016], [0.231, 0.017],
    [0.213, 0.028], [0.083, 0.028], [0.083, -0.027]].map(([r, y]) => new THREE.Vector2(r, y)), 15);
  return [nut, bolt, washer];
}

function buildPartsBin(parent: THREE.Object3D, contacts: Contact[], parts: THREE.BufferGeometry[]) {
  const bin = new THREE.Group();
  bin.position.set(-14.6, BENCH_SURFACE, -18.95);
  bin.rotation.y = 0.22;
  bin.scale.setScalar(1.22);
  parent.add(bin);
  contacts.push([bin.position.x, BENCH_SURFACE, bin.position.z, 6.2, 4.1, bin.rotation.y]);
  const plastic = standard(0xa56a20, 0.67);
  const ribs = standard(0xc68f29, 0.58);
  const rim = standard(0xdd9f28, 0.47);
  const rubbed = standard(0xeac771, 0.69);
  box(bin, plastic, 0, 0.12, 0, 4.48, 0.24, 2.62);
  for (const side of [-1, 1]) {
    box(bin, plastic, side * 2.13, 0.62, 0, 0.22, 1.13, 2.62);
    box(bin, rim, side * 2.13, 1.18, 0, 0.29, 0.16, 2.75);
    box(bin, plastic, 0, 0.58, side * 1.22, 4.48, 1.03, 0.18);
    box(bin, rim, 0, 1.11, side * 1.22, 4.6, 0.17, 0.28);
  }
  for (const x of [-1.76, -0.89, 0.06, 0.96, 1.79]) {
    box(bin, ribs, x, 0.57, 1.339, 0.105, 0.79, 0.13, false).rotation.x = -0.035;
  }
  box(bin, ribs, 0, 0.19, 1.345, 4.24, 0.11, 0.115, false);
  for (const [x, width] of [[-1.96, 0.35], [-1.47, 0.16], [0.73, 0.31], [1.88, 0.45]]) {
    box(bin, rubbed, x, 1.197, 1.28, width, 0.011, 0.13, false);
  }
  for (const [x, y, width] of [[-1.67, 0.78, 0.28], [0.51, 0.41, 0.16], [1.98, 0.90, 0.17]]) {
    box(bin, rubbed, x, y, 1.312, width, 0.038, 0.012, false).rotation.z = 0.08 * x;
  }
  const rng = random(41);
  for (let i = 0; i < 15; i++) {
    const kind = i % parts.length;
    const piece = new THREE.Mesh(parts[kind], i % 4 === 0 ? darkSteel : steel);
    piece.position.set((rng() - 0.5) * 3.45, 0.32 + rng() * 0.11, (rng() - 0.5) * 1.76);
    piece.rotation.set(kind === 1 ? 1.36 + 0.17 * rng() : 0.46 * rng(), rng() * Math.PI, rng() * 0.53, 'YXZ');
    piece.scale.setScalar(0.82 + 0.37 * rng());
    piece.receiveShadow = true;
    bin.add(piece);
  }
}

function buildFastenerJar(parent: THREE.Object3D, contacts: Contact[], parts: THREE.BufferGeometry[]) {
  const jar = new THREE.Group();
  jar.position.set(-20.5, BENCH_SURFACE, -19.05);
  parent.add(jar);
  contacts.push([jar.position.x, BENCH_SURFACE, jar.position.z, 2.67, 2.55]);
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xdbd9c5, roughness: 0.13, metalness: 0.04,
    transparent: true, opacity: 0.25, clearcoat: 0.90, clearcoatRoughness: 0.09, depthWrite: false });
  const heavyGlass = glass.clone();
  heavyGlass.color.set(0xc7c2a7);
  heavyGlass.opacity = 0.58;
  const profile = [[0, 0.045], [0.69, 0.045], [0.93, 0.075], [1.03, 0.19], [1.02, 1.76], [0.91, 1.98], [0.79, 2.10],
    [0.79, 2.29], [0.70, 2.29], [0.70, 2.12], [0.82, 1.96], [0.94, 1.73], [0.94, 0.25], [0.84, 0.17], [0, 0.17]];
  const vessel = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 42), glass);
  jar.add(vessel);
  const base = new THREE.Mesh(new THREE.TorusGeometry(0.935, 0.057, 7, 36), heavyGlass);
  base.rotation.x = Math.PI / 2;
  base.position.y = 0.155;
  jar.add(base);
  const thread = new THREE.Mesh(coil(0.805, 0.205, 1.75, 0.035), heavyGlass);
  thread.position.y = 2.108;
  jar.add(thread);
  const capGeometry = new THREE.CylinderGeometry(0.916, 0.938, 0.235, 56);
  const capVertices = capGeometry.getAttribute('position');
  for (let i = 0; i < capVertices.count; i++) {
    const x = capVertices.getX(i);
    const z = capVertices.getZ(i);
    const flute = 1 - 0.016 * (0.5 + 0.5 * Math.cos(Math.atan2(x, z) * 28));
    capVertices.setXYZ(i, x * flute, capVertices.getY(i), z * flute);
  }
  capGeometry.computeVertexNormals();
  const cap = new THREE.Mesh(capGeometry, standard(0xa38b70, 0.35, 0.62));
  cap.position.y = 2.305;
  cap.castShadow = true;
  jar.add(cap);
  for (const y of [2.207, 2.417]) {
    const rolled = new THREE.Mesh(new THREE.TorusGeometry(0.912, 0.033, 6, 36), steel);
    rolled.position.y = y;
    rolled.rotation.x = Math.PI / 2;
    jar.add(rolled);
  }
  const rng = random(42);
  for (let i = 0; i < 26; i++) {
    const fastener = new THREE.Mesh(parts[i % parts.length], i % 4 ? steel : darkSteel);
    const r = Math.sqrt(rng()) * 0.69;
    const angle = rng() * Math.PI * 2;
    fastener.position.set(Math.cos(angle) * r, 0.27 + 1.08 * rng() ** 1.7, Math.sin(angle) * r);
    fastener.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    fastener.scale.setScalar(0.66 + 0.32 * rng());
    fastener.receiveShadow = true;
    jar.add(fastener);
  }
}

function buildTires(parent: THREE.Object3D, contacts: Contact[]) {
  const rubber = standard(0x292824, 0.94);
  const { canvas, context } = canvas2d(256, 96);
  context.fillStyle = '#393734';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const rng = random(285);
  for (let i = 0; i < 1600; i++) {
    context.fillStyle = i % 3 === 0 ? 'rgba(123,112,95,.26)' : 'rgba(15,15,14,.32)';
    context.fillRect(rng() * canvas.width, rng() * canvas.height, 0.4 + rng() * 2.0, 0.6 + rng());
  }
  context.strokeStyle = '#211f1d';
  context.lineWidth = 3;
  for (let x = -16; x < canvas.width + 16; x += 16) {
    context.beginPath();
    context.moveTo(x + 1, 37);
    context.lineTo(x + 8, 46);
    context.lineTo(x + 6, 52);
    context.lineTo(x + 13, 63);
    context.stroke();
  }
  const treadMap = texture(canvas);
  const texturedRubber = new THREE.MeshStandardMaterial({ map: treadMap, bumpMap: treadMap, bumpScale: 0.018, roughness: 0.91 });
  const profile = [[0.122, -0.062], [0.168, -0.082], [0.230, -0.072], [0.264, -0.055], [0.282, -0.023],
    [0.282, 0.025], [0.269, 0.058], [0.236, 0.074], [0.169, 0.083], [0.123, 0.063], [0.122, -0.062]];
  const tireProfile = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const tire = new THREE.LatheGeometry(tireProfile, 16);
  const detailedTire = new THREE.LatheGeometry(tireProfile, 24);
  const mark = TRACK.anchors;
  const piles = [
    { s: mark.esses - 0.9, side: -1, heights: [2, 4, 3], near: true },
    { s: mark.hairpinApex - 3.5, side: 1, heights: [3, 3, 2, 2], near: false },
    { s: mark.bridgeApproach - 1.5, side: 1, heights: [2, 3], near: false },
    { s: mark.rearLink + 1.6, side: -1, heights: [3, 2, 3], near: false },
    { s: mark.rearBend + 2.1, side: -1, heights: [2, 2], near: false },
    { s: mark.sweepApex - 5.1, side: 1, heights: [4, 2, 3], near: true },
    { s: mark.front - 1.2, side: -1, heights: [3, 4, 3], near: true },
    { s: TRACK.length - 12.15, side: 1, heights: [4, 3, 4], near: true },
    { s: TRACK.length - 10.30, side: 1, heights: [5, 4], near: true },
    { s: TRACK.length - 7.0, side: -1, heights: [4, 5, 4], near: true },
  ];
  for (const { s, side, heights, near } of piles) {
    for (const [i, height] of heights.entries()) {
      const p = TRACK.sampleAt(s + i * 0.55);
      const offset = (wallHalfAt(p.s, side) + 0.49 + (rng() - 0.5) * 0.11) * side;
      const x = p.x - p.dz * offset;
      const z = p.z + p.dx * offset;
      contacts.push([x, BOARD_SURFACE, z, 0.82, 0.75]);
      for (let layer = 0; layer < height; layer++) {
        const mesh = new THREE.Mesh(near ? detailedTire : tire, near ? texturedRubber : rubber);
        mesh.position.set(x + (rng() - 0.5) * 0.055, BOARD_SURFACE + 0.082 + layer * 0.146, z + (rng() - 0.5) * 0.047);
        mesh.rotation.set((rng() - 0.5) * 0.13, rng() * Math.PI * 2, (rng() - 0.5) * 0.13);
        mesh.scale.setScalar(0.94 + rng() * 0.13);
        mesh.castShadow = layer === height - 1;
        mesh.receiveShadow = true;
        parent.add(mesh);
      }
    }
  }
}

export function buildWorkshop(parent: THREE.Object3D, detail: THREE.Object3D = parent) {
  const contacts: Contact[] = [];
  const parts = fastenerShapes();
  const backWall = buildBench(parent);
  dressPegboards(detail);
  buildWestBench(parent, contacts);
  buildViseStation(detail);
  buildDioramaStation(detail);
  buildServiceStation(parent);
  buildWrench(parent, contacts);
  buildChest(parent, contacts);
  buildCan(parent, contacts);
  buildFastenerJar(detail, contacts, parts);
  buildPartsBin(detail, contacts, parts);
  buildFloodlights(parent, contacts);
  wireFrontLights(parent);
  buildTires(parent, contacts);
  addContacts(parent, contacts);
  return backWall;
}
