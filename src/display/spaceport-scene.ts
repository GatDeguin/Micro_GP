import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Course, CourseFrame } from '../shared/courses';
import type { RaceSnapshot } from '../shared/protocol';
import { box, canvas2d, noiseField, random, texture } from './materials';
import { buildSpaceportCampus } from './spaceport-campus';
import { buildSpaceportPeople } from './spaceport-people';
import { buildSpaceportVehicles } from './spaceport-vehicles';
import { buildSpaceportActivity } from './spaceport-activity';
import { createSpaceportSurfaces } from './spaceport-surfaces';
import { buildSpaceportWorkplaces } from './spaceport-workplaces';

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 16);
const unitSphere = new THREE.SphereGeometry(1, 10, 7);
const unitCone = new THREE.ConeGeometry(1, 1, 20);
const unitRing = new THREE.TorusGeometry(1, .045, 5, 36);
const axisY = new THREE.Vector3(0, 1, 0);
const identity = new THREE.Quaternion();
const flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
const tone = { steel: 0x64747b, silver: 0xb8c4c6, dark: 0x1c2b35, navy: 0x223c52,
  white: 0xe1e1d5, orange: 0xd76c35, blue: 0x398fa9, concrete: 0x858d89, sand: 0x9e9c85, rubber: 0x233036 };
const p = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function surfaceTexture(kind: 'road' | 'metal' | 'concrete' | 'ground') {
  if (typeof document === 'undefined') return undefined;
  const size = kind === 'ground' ? 512 : 256;
  const { canvas, context } = canvas2d(size, size);
  const rng = random(9137 + kind.charCodeAt(0));
  const clouds = noiseField(kind === 'ground' ? 8 : 13, kind === 'ground' ? 7 : 11, rng);
  const pores = noiseField(79, 73, rng);
  const image = context.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, cloud = clouds(u, v), grain = rng(), pore = pores(u, v);
    const earth = kind === 'ground' ? Math.max(0, cloud - .35) : 0;
    const value = kind === 'road' ? 233 + (grain - .5) * 27 - Math.max(0, pore - .61) * 50
      : kind === 'metal' ? 245 + (grain - .5) * 8 + Math.sin(x * .84) * 2.2 - cloud * 6
      : kind === 'concrete' ? 238 + (grain - .5) * 14 - cloud * 17 - Math.max(0, pore - .72) * 50
      : 246 - cloud * 29 + (grain - .5) * 5 - Math.max(0, pore - .7) * 10;
    const i = (y * size + x) * 4;
    image.data[i] = value + earth * 12;
    image.data[i + 1] = value + earth * 2;
    image.data[i + 2] = value - earth * 17;
    image.data[i + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  const map = texture(canvas); map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 4;
  if (kind !== 'ground') map.repeat.setScalar(kind === 'road' ? 1.8 : kind === 'metal' ? .8 : .38);
  return map;
}

function point(frame: CourseFrame, offset: number, lift = 0) {
  return p(frame.x - frame.rx * offset + frame.nx * lift, frame.y - frame.ry * offset + frame.ny * lift,
    frame.z - frame.rz * offset + frame.nz * lift);
}

// Large surfaces use spatial batches; small fittings share material batches.
// Surface separation preserves physical highlights without one draw per prop.
function parts(parent: THREE.Object3D, material: THREE.MeshStandardMaterial, name: string, cell = 52,
  concrete?: THREE.MeshStandardMaterial, routes?: ReadonlyMap<number, THREE.MeshStandardMaterial>) {
  const groups = new Map<string, { material: THREE.MeshStandardMaterial; pieces: THREE.BufferGeometry[] }>();
  const matrix = new THREE.Matrix4(), color = new THREE.Color(), position = new THREE.Vector3(), scale = new THREE.Vector3();
  const direction = new THREE.Vector3(), rotation = new THREE.Quaternion();
  function part(geometry: THREE.BufferGeometry, x: number, y: number, z: number, sx: number, sy: number, sz: number,
    tint: number, orientation = identity) {
    const copy = geometry.clone();
    // RoundedBoxGeometry is non-indexed; keep it compatible with the indexed
    // primitive fittings in the same spatial batch.
    if (!copy.index) copy.setIndex(Array.from({ length: copy.getAttribute('position').count }, (_, i) => i));
    copy.deleteAttribute('uv'); copy.clearGroups();
    copy.applyMatrix4(matrix.compose(position.set(x, y, z), orientation, scale.set(sx, sy, sz)));
    const vertices = copy.getAttribute('position'), normals = copy.getAttribute('normal');
    const colors = new Float32Array(vertices.count * 3), uv = new Float32Array(vertices.count * 2);
    for (let i = 0; i < vertices.count; i++) {
      const nx = Math.abs(normals.getX(i)), ny = Math.abs(normals.getY(i)), nz = Math.abs(normals.getZ(i));
      uv[i * 2] = nx > nz ? vertices.getZ(i) : vertices.getX(i);
      uv[i * 2 + 1] = ny > Math.max(nx, nz) ? vertices.getZ(i) : vertices.getY(i);
    }
    color.setHex(tint);
    for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
    copy.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    copy.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const mineral = concrete && (tint === tone.concrete || tint === 0xaaa99b || tint === 0x777e78);
    const surface = routes?.get(tint) ?? (mineral ? concrete! : material);
    const global = surface !== material && surface.metalness < .3;
    const key = `${surface.uuid}:${global || mineral ? 'global' : `${Math.floor(x / cell)},${Math.floor(z / cell)}`}`;
    const bucket = groups.get(key);
    if (bucket) bucket.pieces.push(copy); else groups.set(key, { material: surface, pieces: [copy] });
  }
  return {
    part,
    box: (x: number, y: number, z: number, w: number, h: number, d: number, tint: number, q = identity) =>
      part(unitBox, x, y, z, w, h, d, tint, q),
    cylinder: (x: number, y: number, z: number, radius: number, height: number, tint: number, q = identity) =>
      part(unitCylinder, x, y, z, radius, height, radius, tint, q),
    sphere: (x: number, y: number, z: number, sx: number, sy: number, sz: number, tint: number) =>
      part(unitSphere, x, y, z, sx, sy, sz, tint),
    pipe(a: THREE.Vector3, b: THREE.Vector3, radius: number, tint: number) {
      direction.subVectors(b, a); const length = direction.length();
      rotation.setFromUnitVectors(axisY, direction.normalize()); position.lerpVectors(a, b, .5);
      part(unitCylinder, position.x, position.y, position.z, radius, length, radius, tint, rotation);
    },
    finish() {
      for (const [key, { pieces, material: surface }] of groups) {
        const geometry = mergeGeometries(pieces);
        for (const piece of pieces) piece.dispose();
        if (!geometry) continue;
        const mesh = new THREE.Mesh(geometry, surface); mesh.name = name + ' · ' + key;
        mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh);
      }
    },
  };
}
type Parts = ReturnType<typeof parts>;

function track(parent: THREE.Group, course: Course, material: THREE.MeshStandardMaterial) {
  const count = Math.ceil(course.length / .78), spacing = course.length / count;
  let positions: number[] = [], colors: number[] = [], indices: number[] = [], uv: number[] = [];
  let distance = 0;
  const color = new THREE.Color();
  function quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, tint: number, reverse = false) {
    const at = positions.length / 3; color.setHex(tint);
    for (const v of [a, b, c, d]) { positions.push(v.x, v.y, v.z); colors.push(color.r, color.g, color.b); }
    uv.push(0, distance, a.distanceTo(b), distance, 0, distance + spacing, c.distanceTo(d), distance + spacing);
    if (reverse) indices.push(at, at + 2, at + 1, at + 2, at + 3, at + 1);
    else indices.push(at, at + 1, at + 2, at + 2, at + 1, at + 3);
  }
  function ribbon(a: CourseFrame, b: CourseFrame, lowA: number, highA: number, lowB: number, highB: number,
    lift: number, tint: number, reverse = false) {
    quad(point(a, lowA, lift), point(a, highA, lift), point(b, lowB, lift), point(b, highB, lift), tint, reverse);
  }
  function flush() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
    const road = new THREE.Mesh(geometry, material); road.name = 'Cinta 3D, escapatorias y guías magnéticas';
    road.castShadow = positions.some((value, i) => i % 3 === 1 && value > 1.4);
    road.receiveShadow = true; parent.add(road);
    positions = []; colors = []; indices = []; uv = [];
  }
  for (let i = 0; i < count; i++) {
    const s = i * spacing, t = (i + 1) * spacing;
    distance = s;
    const a = course.frameAt!(s), b = course.frameAt!(t);
    const leftA = course.roadHalfAt(s), rightA = course.pitRoadHalfAt(s);
    const leftB = course.roadHalfAt(t), rightB = course.pitRoadHalfAt(t);
    const asphalt = i % 7 ? 0x3b454c : 0x3d474e;
    ribbon(a, b, -rightA, -1.42, -rightB, -1.42, 0, asphalt);
    ribbon(a, b, -1.42, -.85, -1.42, -.85, 0, 0x3e484e);
    ribbon(a, b, -.85, .85, -.85, .85, 0, asphalt);
    ribbon(a, b, .85, 1.42, .85, 1.42, 0, 0x3e484e);
    ribbon(a, b, 1.42, leftA, 1.42, leftB, 0, asphalt);
    ribbon(a, b, -rightA - .65, leftA + .65, -rightB - .65, leftB + .65, -.42, tone.steel, true);
    for (const side of [-1, 1]) {
      const asphaltA = side < 0 ? rightA : leftA, asphaltB = side < 0 ? rightB : leftB;
      const edgeA = course.wallHalfAt(s, side), edgeB = course.wallHalfAt(t, side);
      ribbon(a, b, side * asphaltA, side * (asphaltA + .28), side * asphaltB, side * (asphaltB + .28), .015,
        Math.floor(s / 3.8) % 2 ? tone.white : tone.orange, side < 0);
      ribbon(a, b, side * (asphaltA + .28), side * edgeA, side * (asphaltB + .28), side * edgeB, -.008, tone.navy, side < 0);
      ribbon(a, b, side * (asphaltA - .13), side * (asphaltA - .08), side * (asphaltB - .13), side * (asphaltB - .08), .018,
        tone.white, side < 0);
      quad(point(a, side * edgeA, -.42), point(a, side * edgeA, .45), point(b, side * edgeB, -.42), point(b, side * edgeB, .45),
        Math.floor(s / 9) % 3 === 0 ? tone.white : tone.navy, side < 0);
      quad(point(a, side * (edgeA + .11), -.42), point(a, side * (edgeA + .11), .45),
        point(b, side * (edgeB + .11), -.42), point(b, side * (edgeB + .11), .45), tone.steel, side > 0);
      ribbon(a, b, side * edgeA, side * (edgeA + .11), side * edgeB, side * (edgeB + .11), .45, tone.steel, side < 0);
    }
    const loop = course.loops?.find(loop => s >= loop.from - 6 && s <= loop.to + 6);
    if (loop) for (const side of [-1, 1]) {
      ribbon(a, b, side * 2.34, side * 2.43, side * 2.34, side * 2.43, .025, 0x4bc1d0, side < 0);
      if (i % 3 === 0) ribbon(a, b, side * 2.49, side * 2.67, side * 2.49, side * 2.67, .027, tone.silver, side < 0);
    }
    if (i % 100 === 99 || i === count - 1) flush();
  }
}

function rocket(d: Parts, x: number, z: number, scale: number, booster = true) {
  const base = .7, body = booster ? 30 : 19, tip = booster ? 8 : 5.5;
  d.cylinder(x, -.25, z, 11.5 * scale, .5, tone.concrete);
  d.cylinder(x, .12, z, 7.4 * scale, .22, tone.dark);
  d.part(unitRing, x, .25, z, 9 * scale, 9 * scale, 9 * scale, tone.white, flat);
  d.cylinder(x, base + body * scale / 2, z, 2.15 * scale, body * scale, tone.silver);
  d.part(unitCone, x, base + (body + tip / 2) * scale, z, 2.15 * scale, tip * scale, 2.15 * scale, tone.white);
  d.cylinder(x, base + 2.6 * scale, z, 2.22 * scale, 3.9 * scale, tone.dark);
  for (let i = 0; i < 13; i++) d.cylinder(x, base + (5.2 + i * 1.85) * scale, z, 2.168 * scale, .052 * scale, tone.steel);
  d.box(x, base + 18 * scale, z + 2.126 * scale, 1.66 * scale, 13 * scale, .07 * scale, tone.dark);
  for (const side of [-1, 1]) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), side * -.18);
    d.box(x + side * 2.55 * scale, base + 22.7 * scale, z, 1.28 * scale, 5.2 * scale, .26 * scale, tone.dark, q);
    d.box(x + side * 2.48 * scale, base + 5.9 * scale, z, 1.55 * scale, 5.3 * scale, .42 * scale, tone.dark, q);
    d.pipe(p(x + side * 1.8 * scale, 1.5, z), p(x + side * 4.0 * scale, -.30, z), .20 * scale, tone.steel);
  }
  for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3;
    d.cylinder(x + Math.cos(angle) * 1.35 * scale, .9, z + Math.sin(angle) * 1.35 * scale, .40 * scale, 1.1, tone.rubber);
  }
}

function tower(d: Parts, x: number, z: number) {
  d.box(x, -.17, z, 12, .65, 12, tone.concrete);
  for (const dx of [-3.6, 3.6]) for (const dz of [-3.6, 3.6]) d.box(x + dx, 27, z + dz, .55, 55, .55, tone.steel);
  for (let i = 0; i < 9; i++) {
    const y = .8 + i * 6.1;
    d.box(x, y, z, 8.3, .35, 8.3, tone.navy);
    for (const dz of [-3.6, 3.6]) {
      d.pipe(p(x - 3.6, y, z + dz), p(x + 3.6, y + 6.1, z + dz), .16, tone.silver);
      d.pipe(p(x + 3.6, y, z + dz), p(x - 3.6, y + 6.1, z + dz), .16, tone.steel);
    }
    for (const dx of [-3.6, 3.6]) d.pipe(p(x + dx, y, z - 3.6), p(x + dx, y + 6.1, z + 3.6), .16, tone.silver);
    d.box(x - 4.18, y + .45, z, .07, .7, 7.8, tone.orange);
  }
  for (const y of [21, 35]) {
    d.box(x - 9, y, z, 18, .68, 1.0, tone.steel);
    d.pipe(p(x - 1, y + 5.6, z), p(x - 16, y, z), .13, tone.silver);
  }
  d.box(x, 56, z, 9.5, .44, 9.5, tone.white);
}

function tank(d: Parts, x: number, z: number, radius: number, height: number) {
  d.cylinder(x, height / 2 - .35, z, radius, height, tone.white);
  d.sphere(x, height - .35, z, radius, radius * .34, radius, tone.silver);
  for (const y of [1.2, height * .5, height - .45]) d.cylinder(x, y, z, radius + .035, .12, tone.steel);
  d.box(x, height * .5, z + radius, radius * .8, height * .42, .04, tone.navy);
  d.pipe(p(x + radius + .35, .1, z), p(x + radius + .35, height + .3, z), .06, tone.steel);
  for (let y = .45; y < height; y += .45) d.pipe(p(x + radius + .14, y, z), p(x + radius + .58, y, z), .026, tone.steel);
  d.pipe(p(x, .40, z - radius), p(x, .40, z - radius - 4), .22, tone.steel);
}

function hangar(d: Parts, x: number, z: number, width: number, depth: number, height: number, openBay = false) {
  d.box(x, -.30, z, width + 3, .6, depth + 3, tone.concrete);
  if (openBay) {
    // A real shell leaves the integration bay visible from the campus route.
    // The workplace module owns the shutters, floor and equipment inside it.
    const opening = 14, lintel = 6.6, pier = (width - opening) / 2;
    d.box(x, height / 2, z - depth / 2, width, height, .28, tone.navy);
    for (const side of [-1, 1]) {
      d.box(x + side * (width / 2 - .14), height / 2, z, .28, height, depth, tone.navy);
      d.box(x + side * (opening / 2 + pier / 2), height / 2, z + depth / 2, pier, height, .28, tone.navy);
    }
    d.box(x, (height + lintel) / 2, z + depth / 2, opening, height - lintel, .28, tone.navy);
    d.box(x, lintel + .18, z + depth / 2 + .2, opening + .6, .36, .7, tone.steel);
    for (const side of [-1, 1]) d.box(x + side * 7.15, 3.3, z + depth / 2 + .18, .28, 6.6, .4, tone.steel);
  } else {
    d.box(x, height / 2, z, width, height, depth, tone.navy);
    d.box(x, height * .42, z + depth / 2 + .03, width * .76, height * .76, .09, tone.dark);
    for (let y = .6; y < height * .78; y += .45) d.box(x, y, z + depth / 2 + .09, width * .75, .035, .06, tone.steel);
  }
  d.box(x, height + .22, z, width + .65, .44, depth + .65, tone.silver);
  for (let i = 0; i < 7; i++) {
    const sx = x + (i - 3) * width / 7;
    d.box(sx, height / 2, z - depth / 2 - .025, .10, height, .11, tone.steel);
    d.box(sx, height + .50, z, width / 8, .14, depth * .6, tone.blue);
  }
  for (const side of [-1, 1]) {
    const xx = x + side * (width / 2 + .08);
    for (let zz = z - depth / 2 + .7; zz < z + depth / 2; zz += 1.1) d.box(xx, height * .5, zz, .09, height - .4, .055, tone.steel);
    d.pipe(p(xx, .15, z + depth / 2 - .35), p(xx, height, z + depth / 2 - .35), .08, tone.steel);
    d.box(xx, .035, z + depth / 2 - .35, .65, .04, 1.3, tone.dark);
    d.box(x + side * width * .43, 1.0, z + depth / 2 + .2, .24, 2.0, .24, tone.orange);
    d.box(x + side * width * .38, height * .88, z + depth / 2 + .08, width * .10, .5, .07, tone.white);
  }
}

function signs(parent: THREE.Group, placements: readonly [string, number, number, number, number][]) {
  if (typeof document === 'undefined') return;
  const { canvas, context } = canvas2d(1024, 1024);
  context.fillStyle = '#132531'; context.fillRect(0, 0, 1024, 1024);
  const rows = ['SPACEX', 'CENTRO DE PRUEBAS  /  INTEGRACIÓN', 'MAGNETIC LOOP / ENSAYO 01', 'MAGNETIC LOOP / ENSAYO 02',
    'PROPULSIÓN / CRIOGENIA', 'CONTROL DE VUELO', 'OCHO DE PROTOTIPOS', 'ATERRIZAJE / RETORNO'];
  rows.forEach((text, i) => {
    context.fillStyle = '#3dbbc9'; context.fillRect(0, i * 128 + 113, 1024, 4);
    context.fillStyle = '#e8ece7'; context.font = i === 0 ? 'italic 800 94px Arial' : '600 47px Arial';
    context.textAlign = 'center'; context.fillText(text, 512, i * 128 + 86);
  });
  const material = new THREE.MeshStandardMaterial({ map: texture(canvas), roughness: .66, metalness: .10,
    emissive: 0x27414b, emissiveIntensity: .20 });
  for (const [label, x, y, z, width] of placements) {
    const row = Math.max(0, rows.indexOf(label));
    const geometry = new THREE.PlaneGeometry(width, row === 1 ? 1.45 : width / 8);
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - (row + 1 - uv.getY(i)) / 8);
    const mesh = new THREE.Mesh(geometry, material); mesh.name = label; mesh.position.set(x, y, z); parent.add(mesh);
  }
}

export async function buildSpaceportScene(parent: THREE.Group, course: Course, _wood: THREE.Texture, _compactEnabled = false) {
  parent.name = 'SpaceX · Centro de pruebas';
  const surfaces = createSpaceportSurfaces();
  const metal = surfaces.paint, roadway = surfaces.asphalt, concrete = surfaces.concrete;
  const batch = (parent: THREE.Object3D, material: THREE.MeshStandardMaterial, name: string, cell = 52, concrete?: THREE.MeshStandardMaterial) =>
    parts(parent, material, name, cell, concrete, surfaces.routes);
  const groundGrain = concrete.bumpMap?.clone();
  groundGrain?.repeat.set(105, 99);
  const groundMaterial = new THREE.MeshStandardMaterial({ color: tone.sand, roughness: .98,
    map: surfaceTexture('ground') ?? null, bumpMap: groundGrain ?? null, bumpScale: .026 });
  const lampMaterial = new THREE.MeshStandardMaterial({ color: 0x9edbe3, emissive: 0x4bb9d1, emissiveIntensity: 1.8, roughness: .4 });
  const warningMaterial = new THREE.MeshStandardMaterial({ color: 0xf27b49, emissive: 0xe44a22, emissiveIntensity: 1.5 });
  const fixed = new THREE.Group(); fixed.name = 'Instalaciones del centro espacial'; parent.add(fixed);
  const animated = new THREE.Group(); animated.name = 'Actividad de integración y telemetría'; parent.add(animated);
  const bounds = new THREE.Box3().setFromPoints(course.samples.map(s => p(s.x, s.y, s.z)));
  const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
  const ground = box(fixed, groundMaterial, center.x, -.88, center.z, size.x + 74, 1.6, size.z + 70, false);
  ground.name = 'Plataforma del centro de ensayos';
  const d = batch(fixed, metal, 'Equipamiento espacial', 52, concrete);
  track(fixed, course, roadway);
  // Concrete service aprons and expansion joints make the diorama read as a
  // working launch facility instead of isolated models on an empty ground plane.
  for (const [x, z, width, depth] of [[25, -160, 110, 110], [-32, -76, 55, 47], [-94, -162, 40, 34],
    [130, -106, 37, 35], [-76, -273, 24, 24]] as const) {
    d.box(x, -.066, z, width, .024, depth, 0xaaa99b);
    for (let dx = -width / 2 + 12; dx < width / 2; dx += 12) d.box(x + dx, -.052, z, .036, .003, depth, 0x777e78);
    for (let dz = -depth / 2 + 12; dz < depth / 2; dz += 12) d.box(x, -.052, z + dz, width, .003, .036, 0x777e78);
  }
  const clear = (x: number, z: number, height: number) => !course.samples.some((q, i) => i % 7 === 0
    && q.y < height - 1 && Math.hypot(q.x - x, q.z - z) < course.wallHalfAt(q.s, 1) + .65);
  for (let s = 0; s < course.length; s += 12) {
    const f = course.frameAt!(s), wall = course.wallHalfAt(s, 1);
    if (f.y < 1.8 || f.ny < .75 || course.loops?.some(loop => s > loop.from - 4 && s < loop.to + 4)) continue;
    for (const side of [-1, 1]) {
      const top = point(f, side * (wall + .75), -.30);
      if (!clear(top.x, top.z, top.y)) continue;
      d.box(top.x, -.04, top.z, 2.3, .48, 2.3, tone.concrete);
      d.box(top.x, top.y / 2 - .02, top.z, .68, top.y, .68, tone.steel);
      d.pipe(p(top.x, .4, top.z), point(f, side * (wall - .25), -1.2), .17, tone.navy);
      d.pipe(top, point(f, side * (wall - .4), -.32), .20, tone.steel);
    }
  }
  const beaconPoints: THREE.Vector3[] = [];
  const lampPoints: THREE.Vector3[] = [];
  for (let s = 4; s < course.length; s += 22) {
    const f = course.frameAt!(s), side = Math.floor(s / 22) % 2 ? 1 : -1;
    const at = point(f, side * (course.wallHalfAt(s, side) + .18), .5), top = point(f, side * (course.wallHalfAt(s, side) + .18), 1.35);
    d.pipe(at, top, .045, tone.steel); lampPoints.push(top);
  }
  for (const [index, loop] of (course.loops ?? []).entries()) {
    for (let s = loop.from; s < loop.to; s += 7.5) {
      const f = course.frameAt!(s);
      for (const side of [-1, 1]) {
        const low = point(f, side * 3.58, -.36), high = point(f, side * 3.58, 1.05);
        d.pipe(low, high, .10, tone.blue);
        d.pipe(high, point(f, side * 3.04, 1.35), .10, tone.blue);
        d.box(low.x, low.y, low.z, .29, .29, .29, tone.orange);
      }
      d.pipe(point(f, -3.58, -.65), point(f, 3.58, -.65), .085, tone.steel);
    }
    const a = course.frameAt!(loop.from - 9), b = course.frameAt!(loop.to + 10);
    for (const f of [a, b]) {
      const side = point(f, 6.4);
      d.box(side.x, .3, side.z, 2.4, .6, 3.8, tone.concrete);
      d.box(side.x, 1.75, side.z, 1.8, 2.3, 2.9, tone.navy);
      for (let k = 0; k < 7; k++) d.box(side.x + .91, 1.1 + k * .17, side.z, .025, .06, 1.9, tone.steel);
      beaconPoints.push(p(side.x, 3.0, side.z));
    }
    const mid = course.frameAt!((loop.from + loop.to) / 2);
    const pad = point(mid, index ? -8 : 8, -mid.y);
    if (clear(pad.x, pad.z, 50)) d.box(pad.x, .12, pad.z, 4, .36, 7, tone.navy);
  }

  rocket(d, 26, -184, 1.32);
  tower(d, 42, -183);
  rocket(d, -76, -273, .80, false);
  hangar(d, -32, -76, 45, 36, 13);
  hangar(d, -94, -162, 31, 25, 10, true);
  hangar(d, 130, -106, 29, 27, 9);
  for (let i = 0; i < 5; i++) tank(d, -22 + i * 8.2, -153, 2.4 + i % 2 * .5, 9.0 + i % 2 * 3);
  for (const z of [-143, -140.8, -138.6]) {
    d.pipe(p(-28, .62, z), p(48, .62, z), .22, z < -142 ? tone.blue : tone.silver);
    for (let x = -28; x <= 48; x += 7) d.box(x, .20, z, .32, .4, 1.0, tone.concrete);
  }
  // The cryogenic trunks connect to the launch mount and tower through supported
  // elbows, isolation valves and one service manifold, leaving the apron walkways clear.
  for (const [x, z, toX, endZ, color] of [[20, -143, 23.2, -184, tone.blue], [42, -140.8, 44, -176, tone.silver]] as const) {
    d.pipe(p(x, .62, z), p(x, .62, -166), .21, color);
    d.sphere(x, .62, -166, .22, .22, .22, color);
    d.pipe(p(x, .62, -166), p(x, 1.38, -166), .21, color);
    d.sphere(x, 1.38, -166, .22, .22, .22, color);
    d.pipe(p(x, 1.38, -166), p(x, 1.38, endZ), .21, color);
    d.sphere(x, 1.38, endZ, .22, .22, .22, color);
    d.pipe(p(x, 1.38, endZ), p(toX, 1.38, endZ), .21, color);
    for (let along = z - 3; along > -165; along -= 4) d.box(x, .22, along, .60, .46, .43, tone.concrete);
    for (const along of [-169, endZ + 1]) d.box(x, .58, along, .34, 1.23, .34, tone.steel);
    d.cylinder(x, 1.68, -169, .13, .53, tone.steel);
    d.part(unitRing, x, 1.97, -169, .35, .35, .35, tone.orange, flat);
    d.pipe(p(x - .29, 1.97, -169), p(x + .29, 1.97, -169), .026, tone.orange);
  }
  d.box(17.8, .04, -175, 2.2, .23, 1.6, tone.concrete);
  d.box(17.8, 1.15, -175, 1.65, 2.05, 1.10, tone.navy);
  d.box(17.8, 1.55, -174.435, 1.23, .59, .035, tone.dark);
  for (const x of [17.45, 17.8, 18.15]) d.cylinder(x, 1.55, -174.398, .09, .023, tone.white, flat);
  d.box(18.30, .76, -174.42, .045, .25, .05, tone.silver);
  d.box(-30, 4, -114, 16, 8, 12, tone.white);
  d.box(-30, 6, -107.94, 13.7, 2.2, .06, tone.blue);
  d.box(-30, 8.24, -114, 17.2, .48, 13.2, tone.navy);
  for (let i = 0; i < 6; i++) d.box(-36 + i * 2.4, 6, -107.84, .11, 2.24, .10, tone.silver);
  for (const x of [-24, -13, -2, 9, 20, 31]) {
    d.box(x, .08, -127, 6, .16, 8, tone.concrete);
    d.box(x, 1.35, -127, 2.7, 2.5, 4.2, tone.navy);
    d.box(x, 2.70, -127, 2.85, .20, 4.35, tone.silver);
    for (let i = 0; i < 8; i++) d.box(x - 1.38, 1.1 + i * .13, -127, .035, .045, 2.9, tone.steel);
  }

  // Four open integration bays, with grounded people and mechanically connected tools.
  for (const [i, s] of course.pit.stalls.entries()) {
    const f = course.frameAt!(s, course.pit.stationOffset), x = f.x, z = f.z - 3.0;
    d.box(x, -.04, z, 11.8, .12, 8.5, tone.concrete);
    d.box(x, 2.0, z - 4, 11.6, 4.2, .28, tone.navy);
    for (const side of [-1, 1]) d.box(x + side * 5.65, 2.0, z, .28, 4.2, 8.0, tone.steel);
    d.box(x, 4.15, z, 12, .30, 8.4, tone.silver);
    d.box(x, 3.50, z + 4.11, 10.8, .48, .08, tone.navy);
    d.box(x, 1.0, z - 2.75, 5.6, .18, .85, tone.steel);
    for (const side of [-1, 1]) d.box(x + side * 2.4, .50, z - 2.75, .15, 1.0, .65, tone.dark);
    d.box(x - 3.3, .72, z - 1.1, 1.5, 1.45, .85, i % 2 ? tone.blue : tone.orange);
    for (let y = .3; y < 1.4; y += .25) d.box(x - 3.3, y, z - .66, 1.3, .032, .027, tone.silver);
    for (const dx of [-1.3, -.5, .3]) d.cylinder(x + dx, 1.30, z - 2.75, .20, .42, tone.silver);
    d.box(x + 2.8, .48, z + .5, 1.35, .86, 2.0, tone.navy);
    for (const side of [-1, 1]) d.cylinder(x + 2.8 + side * .68, .27, z + .5, .26, .12, tone.rubber,
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2));
    lampPoints.push(p(x, 3.4, z + 1.2));
  }
  // Finish gantry, grid markings and the pit service lane.
  for (const z of [-4.3, 4.3]) { d.box(0, 3.2, z, .25, 6.4, .25, tone.steel); beaconPoints.push(p(0, 6.7, z)); }
  d.box(0, 6.2, 0, .35, .65, 9.1, tone.navy);
  for (let z = -3.2; z < 3.2; z += .4) for (const x of [-.3, .3]) d.box(x, .023, z, .60, .023, .4,
    (Math.floor((z + 3.2) / .4) + (x < 0 ? 0 : 1)) % 2 ? tone.white : tone.dark);
  for (const s of course.gridRows) for (const offset of [-1.25, 1.25]) {
    const f = course.frameAt!(s, offset);
    d.box(f.x, .024, f.z, 1.65, .025, 1.08, tone.white);
    d.box(f.x + .06, .040, f.z, 1.57, .025, .96, 0x3b454c);
  }
  for (let x = 18; x < 100; x += 5) d.box(x, .025, -3.65, 2.2, .025, .08, tone.white);
  for (let x = -138; x < 177; x += 9) {
    d.box(x, .03, 15, .11, .06, 8, tone.concrete);
    if (x % 3 === 0) d.box(x, .08, 19, .13, .16, .15, tone.orange);
  }
  for (const [x, z] of [[-55, -92], [-91, -181], [115, -121], [52, -165], [27, -205]]) {
    d.box(x, -.02, z, 6.3, .14, 4.2, tone.concrete);
    for (let i = 0; i < 4; i++) d.cylinder(x + (i - 1.5) * .76, .42, z - 1.0, .29, .84, i % 2 ? tone.blue : tone.orange);
    for (let i = 0; i < 3; i++) d.box(x + i * 1.25 - 1.3, .52, z + .7, 1.0, .91, .96, tone.white);
  }
  d.finish();
  const campus = buildSpaceportCampus(fixed, course, batch, { metal, concrete, roadway });
  const workplaces = buildSpaceportWorkplaces(animated, course, { ...surfaces, metal: surfaces.steel });
  const people = buildSpaceportPeople(animated, course, [...campus.people, ...workplaces.people]);
  const vehicles = await buildSpaceportVehicles(animated, {
    ...campus.fleet, routes: campus.fleet.routes.map(route => ({ ...route, cornerRadius: 0 })),
  });
  const activity = buildSpaceportActivity(animated, { material: metal });
  const signFrames = batch(fixed, metal, 'Soportes de señalización');
  for (const x of [36, 72]) signFrames.box(x, 4.82, -8.40, .15, 1.65, .15, tone.steel);
  for (const [x, y, z] of [[186, 2.8, -78], [-157, 5.6, -264]] as const) {
    for (const side of [-1, 1]) signFrames.box(x + side * 5.5, (y - .30) / 2, z - .10, .17, y + .30, .17, tone.steel);
    signFrames.box(x, y, z - .07, 13.2, 1.72, .12, tone.navy);
  }
  signFrames.finish();
  signs(fixed, [['SPACEX', -32, 11.4, -57.95, 30], ['CENTRO DE PRUEBAS  /  INTEGRACIÓN', 54, 4.92, -8.20, 38],
    ['PROPULSIÓN / CRIOGENIA', 1, 5.0, -150.52, 27], ['CONTROL DE VUELO', -30, 8.85, -107.93, 14],
    ['MAGNETIC LOOP / ENSAYO 01', 186, 2.8, -78, 13], ['MAGNETIC LOOP / ENSAYO 02', -157, 5.6, -264, 13]]);

  function lights(points: THREE.Vector3[], material: THREE.Material, radius: number) {
    const mesh = new THREE.InstancedMesh(unitSphere, material, points.length), matrix = new THREE.Matrix4();
    points.forEach((p, i) => mesh.setMatrixAt(i, matrix.compose(p, identity, new THREE.Vector3(radius, radius, radius))));
    mesh.computeBoundingSphere(); animated.add(mesh); return mesh;
  }
  lights(lampPoints, lampMaterial, .105);
  lights([...beaconPoints, p(42, 57, -183), p(26, 51.6, -184)], warningMaterial, .18);
  const radar = new THREE.Group(); radar.position.set(-30, 9.0, -114); animated.add(radar);
  const r = batch(radar, metal, 'Antena de telemetría');
  r.cylinder(0, .48, 0, .16, .96, tone.steel);
  r.box(0, 1.2, 0, 4.1, 1.6, .16, tone.white);
  for (const x of [-1.6, -.8, 0, .8, 1.6]) r.box(x, 1.2, .10, .05, 1.4, .03, tone.steel);
  r.pipe(p(0, .4, .2), p(0, 1.2, 1.4), .06, tone.orange); r.finish();
  const manipulator = new THREE.Group(); manipulator.position.set(88, .10, -12.0); animated.add(manipulator);
  const arm = batch(manipulator, metal, 'Brazo de integración');
  arm.cylinder(0, .36, 0, .45, .72, tone.dark);
  arm.pipe(p(0, .6, 0), p(0, 2.0, .7), .17, tone.orange);
  arm.pipe(p(0, 2.0, .7), p(0, 1.7, 1.8), .13, tone.orange);
  arm.cylinder(0, 1.63, 1.8, .17, .34, tone.steel);
  for (const side of [-1, 1]) arm.pipe(p(side * .14, 1.5, 1.8), p(side * .10, 1.25, 1.8), .033, tone.silver);
  arm.finish();
  const backWall = new THREE.Group(); backWall.name = 'Límite de la plataforma espacial'; parent.add(backWall);
  let night = false, detail = true;
  return {
    backWall,
    setNight(value: boolean) {
      night = value; lampMaterial.emissiveIntensity = value ? 3.1 : 1.2;
      groundMaterial.color.setHex(value ? 0x727c7d : tone.sand);
      campus.setNight(value); people.setNight(value); vehicles.setNight(value);
      activity.setNight(value);
      workplaces.setNight(value);
    },
    setDetail(value: boolean) {
      detail = value; campus.setDetail(value); people.setDetail(value); vehicles.setDetail(value);
      activity.setDetail(value);
      workplaces.setDetail(value);
    },
    observe(snapshot: RaceSnapshot) { people.observe(snapshot); activity.observe(snapshot); },
    update(now: number) {
      const time = now * .001;
      radar.rotation.y = time * .23;
      manipulator.rotation.y = Math.sin(time * .42) * .25;
      warningMaterial.emissiveIntensity = (night ? 2.3 : 1.3) * (.65 + .35 * Math.sin(time * 4.5) ** 8);
      radar.visible = manipulator.visible = detail;
      campus.update(now); people.update(now); vehicles.update(now);
      activity.update(now);
      workplaces.update(now);
    },
  };
}
