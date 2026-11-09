import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CURB_WIDTH, ROAD_HALF, TRACK, WALL_HALF, type TrackPoint } from '../shared/track';
import { BENCH_SURFACE, box, canvas2d, horizontalShadow, random, standard, texture } from './materials';

const MAT_TOP = 0.076;

type Footprint = readonly [x: number, z: number, width: number, depth: number, yaw: number];

function topSurface(parent: THREE.Object3D, map: THREE.Texture, width: number, depth: number, height: number) {
  const geometry = new THREE.PlaneGeometry(width, depth).rotateX(-Math.PI / 2);
  const face = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map, roughness: 0.88 }));
  face.position.y = height;
  face.receiveShadow = true;
  parent.add(face);
  return face;
}

function cuttingMat(parent: THREE.Object3D) {
  const { canvas, context } = canvas2d(1056, 352);
  const rng = random(3707);
  context.fillStyle = '#314b42';
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let x = 16; x <= canvas.width - 16; x += 24) {
    context.strokeStyle = (x - 16) % 120 === 0 ? '#718b78' : '#4b6c5c';
    context.beginPath();
    context.moveTo(x + 0.5, 16);
    context.lineTo(x + 0.5, canvas.height - 16);
    context.stroke();
  }
  for (let y = 16; y <= canvas.height - 16; y += 24) {
    context.strokeStyle = (y - 16) % 120 === 0 ? '#718b78' : '#4b6c5c';
    context.beginPath();
    context.moveTo(16, y + 0.5);
    context.lineTo(canvas.width - 16, y + 0.5);
    context.stroke();
  }
  context.strokeStyle = '#849685';
  context.strokeRect(11.5, 11.5, canvas.width - 23, canvas.height - 23);
  for (let i = 0; i < 410; i++) {
    const x = rng() * canvas.width;
    const y = rng() * canvas.height;
    const length = 3 + 38 * rng() ** 2;
    context.strokeStyle = i % 4 ? 'rgba(20,29,25,.18)' : 'rgba(184,183,142,.14)';
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + length, y + (rng() - 0.5) * length);
    context.stroke();
  }
  const rubber = standard(0x273c34, 0.85);
  const body = new THREE.Mesh(new RoundedBoxGeometry(10.54, 0.071, 3.22, 3, 0.031), rubber);
  body.position.set(0, 0.038, 0.10);
  body.receiveShadow = true;
  parent.add(body);
  const face = topSurface(parent, texture(canvas), 10.48, 3.16, MAT_TOP);
  face.position.z = 0.10;
}

function tracePlan(context: CanvasRenderingContext2D, samples: readonly TrackPoint[], offset: number, reverse = false) {
  for (let i = 0; i < samples.length; i++) {
    const point = samples[reverse ? samples.length - 1 - i : i];
    const x = 481 + (point.x - point.dz * offset) * 14.5;
    const y = 281 + (point.z + point.dx * offset) * 14.5;
    if (i === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
}

function cuttingPlan(parent: THREE.Object3D) {
  const group = new THREE.Group();
  group.position.set(-2.99, MAT_TOP, -0.08);
  group.rotation.y = 0.068;
  parent.add(group);
  const cream = standard(0xe1d1b0, 0.95);
  box(group, cream, 0.034, 0.011, 0.047, 4.20, 0.021, 2.37, false);
  const { canvas, context } = canvas2d(960, 550);
  const base = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  base.addColorStop(0, '#ede4cb');
  base.addColorStop(1, '#d1c19f');
  context.fillStyle = base;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#9a997e';
  context.lineWidth = 2;
  context.strokeRect(28, 27, 904, 496);
  for (let i = 0; i < 19; i++) {
    context.fillStyle = '#b4b19b';
    context.fillRect(39 + i * 48, 58, 1.3, 420);
  }
  for (let i = 0; i < 10; i++) context.fillRect(39, 75 + i * 44, 884, 1.3);

  context.fillStyle = '#b9c0ae';
  context.beginPath();
  tracePlan(context, TRACK.samples, ROAD_HALF);
  tracePlan(context, TRACK.samples, -ROAD_HALF, true);
  context.fill('evenodd');
  context.strokeStyle = '#3f564e';
  context.lineWidth = 4;
  context.stroke();
  context.strokeStyle = '#657467';
  context.setLineDash([10, 6]);
  context.lineWidth = 2.2;
  context.beginPath();
  tracePlan(context, TRACK.samples, 0);
  context.stroke();
  context.setLineDash([]);
  const start = TRACK.sampleAt(0);
  const x = 481 + start.x * 14.5;
  const y = 281 + start.z * 14.5;
  context.strokeStyle = '#a04e3d';
  context.lineWidth = 6;
  context.beginPath();
  context.moveTo(x + start.dz * ROAD_HALF * 14.5, y - start.dx * ROAD_HALF * 14.5);
  context.lineTo(x - start.dz * ROAD_HALF * 14.5, y + start.dx * ROAD_HALF * 14.5);
  context.stroke();
  context.fillStyle = '#425048';
  context.font = 'bold 28px ui-monospace, monospace';
  context.fillText('07  /  TRAZADO', 49, 66);
  context.lineWidth = 2;
  context.strokeStyle = '#777d6b';
  context.strokeRect(725, 457, 178, 43);
  context.fillStyle = '#6c7262';
  for (const [offset, size] of [[12, 86], [109, 54]]) context.fillRect(725 + offset, 477, size, 2.2);
  topSurface(group, texture(canvas), 4.14, 2.34, 0.026);
}

function pieceShape(samples: readonly TrackPoint[], from: number, to: number, center: THREE.Vector2, scale: number) {
  const outline = new THREE.Shape();
  for (const [row, side] of [from, to].entries()) {
    for (let i = 0; i < samples.length; i++) {
      const p = samples[row === 0 ? i : samples.length - 1 - i];
      const x = (p.x - p.dz * side - center.x) * scale;
      const y = -(p.z + p.dx * side - center.y) * scale;
      if (row === 0 && i === 0) outline.moveTo(x, y);
      else outline.lineTo(x, y);
    }
  }
  outline.closePath();
  return outline;
}

function plywoodSample(parent: THREE.Object3D) {
  const sample = new THREE.Group();
  sample.position.set(0.97, MAT_TOP + 0.008, -0.26);
  sample.rotation.y = -0.13;
  parent.add(sample);

  const start = 49.0;
  const end = 63.2;
  const scale = 0.216;
  const path = (from: number, to: number, segments: number) => Array.from({ length: segments + 1 }, (_, i) =>
    TRACK.sampleAt(THREE.MathUtils.lerp(from, to, i / segments)),
  );
  const points = path(start, end, 33);
  const middle = points[Math.floor(points.length / 2)];
  const center = new THREE.Vector2(middle.x, middle.z);
  const shape = (portion: readonly TrackPoint[], from: number, to: number) => pieceShape(portion, from, to, center, scale);
  const board = new THREE.ExtrudeGeometry(shape(points, -WALL_HALF - 0.24, WALL_HALF + 0.24), {
    depth: 0.0465, bevelEnabled: false, curveSegments: 1,
  }).rotateX(-Math.PI / 2);
  const veneer = standard(0xcb9a62, 0.86);
  const glue = standard(0x815334, 0.92);
  const sanded = standard(0xe3b680, 0.86);
  const layers = [veneer, glue, veneer, glue, veneer, sanded];
  layers.forEach((material, i) => {
    const layer = new THREE.Mesh(board, material);
    layer.position.y = i * 0.0465;
    layer.castShadow = i === layers.length - 1;
    layer.receiveShadow = true;
    sample.add(layer);
  });
  const top = layers.length * 0.0465 + 0.002;
  const panel = (portion: readonly TrackPoint[], from: number, to: number) =>
    new THREE.ShapeGeometry(shape(portion, from, to)).rotateX(-Math.PI / 2);
  const finish = (geometry: THREE.BufferGeometry, height: number, material: THREE.Material) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = height;
    mesh.receiveShadow = true;
    sample.add(mesh);
  };
  const completeUntil = 58.5;
  const assembled = path(start, completeUntil, 24);
  finish(panel(assembled, -WALL_HALF, WALL_HALF), top, standard(0x507146, 0.84));
  finish(panel(assembled, -ROAD_HALF, ROAD_HALF), top + 0.003, standard(0x393a39, 0.91));
  const red = standard(0xb44932, 0.76);
  const ivory = standard(0xe6d6b2, 0.81);
  const tiles: THREE.BufferGeometry[][] = [[], []];
  for (let at = start, i = 0; at < completeUntil; at += 0.72, i++) {
    const portion = path(at + 0.024, Math.min(at + 0.696, completeUntil), 2);
    tiles[i % 2].push(panel(portion, -ROAD_HALF - CURB_WIDTH, -ROAD_HALF), panel(portion, ROAD_HALF, ROAD_HALF + CURB_WIDTH));
  }
  tiles.forEach((group, i) => {
    const surface = mergeGeometries(group);
    group.forEach(geometry => geometry.dispose());
    if (surface) finish(surface, top + 0.006, i ? ivory : red);
  });
  const pencil = standard(0x906b4e, 0.96);
  const uncut = path(completeUntil, end, 14);
  for (const side of [-1, 1]) {
    const guide = side * ROAD_HALF;
    finish(panel(uncut, guide - 0.048, guide + 0.048), top + 0.002, pencil);
  }
}

function handTools(parent: THREE.Object3D) {
  const steel = standard(0xada79a, 0.31, 0.67);
  const dark = standard(0x3a3934, 0.76);
  const brass = standard(0x95754d, 0.41, 0.55);
  const red = standard(0xaa5036, 0.55, 0.22);

  const ruler = new THREE.Group();
  ruler.position.set(1.28, MAT_TOP + 0.004, 1.0);
  ruler.rotation.y = 0.15;
  parent.add(ruler);
  box(ruler, brass, 0, 0.024, 0, 3.23, 0.049, 0.32);
  const scale = canvas2d(640, 64);
  scale.context.fillStyle = '#b8a283';
  scale.context.fillRect(0, 0, 640, 64);
  scale.context.strokeStyle = '#574e3e';
  scale.context.lineWidth = 2;
  for (let i = 0; i <= 40; i++) {
    const x = 19 + i * 15;
    scale.context.beginPath();
    scale.context.moveTo(x, 8);
    scale.context.lineTo(x, i % 10 === 0 ? 46 : i % 5 === 0 ? 38 : 26);
    scale.context.stroke();
  }
  topSurface(ruler, texture(scale.canvas), 3.16, 0.29, 0.050);

  const knife = new THREE.Group();
  knife.position.set(3.62, MAT_TOP + 0.016, -0.85);
  knife.rotation.y = -0.20;
  parent.add(knife);
  const handle = new THREE.Mesh(new RoundedBoxGeometry(1.52, 0.14, 0.37, 3, 0.056), red);
  handle.position.set(0.29, 0.078, 0);
  handle.castShadow = handle.receiveShadow = true;
  knife.add(handle);
  box(knife, dark, 0.36, 0.154, 0.005, 0.85, 0.033, 0.19, false);
  for (let i = 0; i < 4; i++) box(knife, steel, 0.08 + 0.13 * i, 0.172, 0, 0.035, 0.010, 0.13, false);
  const bladeOutline = new THREE.Shape();
  bladeOutline.moveTo(-0.42, -0.115);
  bladeOutline.lineTo(-0.94, -0.115);
  bladeOutline.lineTo(-1.23, 0.104);
  bladeOutline.lineTo(-0.42, 0.104);
  bladeOutline.closePath();
  const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(bladeOutline, { depth: 0.024,
    bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.009, bevelSegments: 1 }).rotateX(-Math.PI / 2), steel);
  blade.position.y = 0.064;
  blade.castShadow = true;
  knife.add(blade);

  const brush = new THREE.Group();
  brush.position.set(3.83, MAT_TOP + 0.092, 0.47);
  brush.rotation.y = 0.24;
  parent.add(brush);
  const cylinders = [
    [0.085, 0.047, 1.33, 0.25, standard(0x784a31, 0.62)],
    [0.095, 0.078, 0.34, -0.56, steel],
    [0.045, 0.084, 0.36, -0.91, standard(0x8d6b45, 0.94)],
  ] as const;
  for (const [outer, inner, length, x, material] of cylinders) {
    const part = new THREE.Mesh(new THREE.CylinderGeometry(outer, inner, length, 12).rotateZ(Math.PI / 2), material);
    part.position.x = x;
    part.castShadow = part.receiveShadow = true;
    brush.add(part);
  }
}

function offcuts(parent: THREE.Object3D) {
  const veneer = standard(0xc9915b, 0.90);
  const sanded = standard(0xe0b07a, 0.88);
  const templates = [
    [0.62, 0.32, -4.26, 1.26, -0.11, veneer],
    [0.46, 0.25, -3.68, 1.39, 0.21, sanded],
    [0.42, 0.30, 4.52, 1.26, 0.36, sanded],
    [0.26, 0.23, 4.05, 1.32, -0.22, veneer],
  ] as const;
  for (const [width, depth, x, z, angle, material] of templates) {
    const outline = new THREE.Shape();
    outline.moveTo(-width / 2, -depth / 2);
    outline.lineTo(width / 2, -depth / 2 + 0.025);
    outline.lineTo(width * 0.30, depth / 2);
    outline.lineTo(-width / 2 + 0.06, depth * 0.21);
    outline.closePath();
    const piece = new THREE.Mesh(new THREE.ExtrudeGeometry(outline, { depth: 0.043, bevelEnabled: false }).rotateX(-Math.PI / 2), material);
    piece.position.set(x, MAT_TOP + 0.004, z);
    piece.rotation.y = angle;
    piece.castShadow = piece.receiveShadow = true;
    parent.add(piece);
  }
}

function supportShadows(parent: THREE.Object3D) {
  const footprints: readonly Footprint[] = [
    [-2.99, -0.08, 4.54, 2.69, 0.068], [0.97, -0.26, 3.92, 2.22, -0.13],
    [1.28, 1.0, 3.56, 0.58, 0.15], [3.62, -0.85, 2.67, 0.68, -0.20], [3.83, 0.47, 2.33, 0.43, 0.24],
  ];
  const quad = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const contact = horizontalShadow();
  const matShadow = new THREE.Mesh(quad, contact);
  matShadow.position.set(0, 0.006, 0.10);
  matShadow.scale.set(11.03, 1, 3.48);
  parent.add(matShadow);
  const shadows = new THREE.InstancedMesh(quad, contact, footprints.length);
  const placement = new THREE.Object3D();
  footprints.forEach(([x, z, width, depth, yaw], i) => {
    placement.position.set(x, MAT_TOP + 0.002, z);
    placement.scale.set(width, 1, depth);
    placement.rotation.y = yaw;
    placement.updateMatrix();
    shadows.setMatrixAt(i, placement.matrix);
  });
  shadows.computeBoundingSphere();
  parent.add(shadows);
}

export function buildDioramaStation(parent: THREE.Object3D) {
  const station = new THREE.Group();
  station.position.set(-17.0, BENCH_SURFACE, 14.94);
  parent.add(station);
  cuttingMat(station);
  cuttingPlan(station);
  plywoodSample(station);
  handTools(station);
  offcuts(station);
  supportShadows(station);
}
