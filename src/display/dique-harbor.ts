import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { diquePlanPoint, type Course } from '../shared/courses';
import { box, canvas2d, random, standard, texture } from './materials';
import { instanceStatic } from './batches';
import { DIQUE_GROUND, DIQUE_WATER, diqueBeam, diqueEdge, diquePart, diquePlane, diqueRoadClear, diqueSign, diqueSpan, diqueStrip } from './dique-geometry';

export const DIQUE_FRONT = 15.4;
const left = diquePlanPoint(6.5, 0).x;
const right = diquePlanPoint(269, 0).x;
const rear = diquePlanPoint(0, 0).z;
const front = diquePlanPoint(0, 176.5).z;
const top = -2.62;

function outline(x0: number, x1: number, z0: number, z1: number, radius: number) {
  const points: THREE.Vector2[] = [];
  for (const [i, x, z] of [[0, x1 - radius, z1 - radius], [1, x0 + radius, z1 - radius],
    [2, x0 + radius, z0 + radius], [3, x1 - radius, z0 + radius]]) {
    for (let j = 0; j <= 10; j++) {
      const angle = (i + j * 0.1) * Math.PI / 2;
      points.push(new THREE.Vector2(x + Math.cos(angle) * radius, z + Math.sin(angle) * radius));
    }
  }
  return points;
}

function planarUvs(geometry: THREE.BufferGeometry, width: number, depth: number) {
  const positions = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, positions.getX(i) / width, positions.getZ(i) / depth);
  return geometry;
}

function laminatedBase(parent: THREE.Group, wood: THREE.Texture) {
  const border = outline(left, right, rear, front, 5.30);
  const finish = new THREE.MeshPhysicalMaterial({ color: 0xd5a06b, map: wood, roughness: 0.69, clearcoat: 0.15, clearcoatRoughness: 0.67 });
  const cap = diquePart(parent, planarUvs(diquePlane(border), 59, 30), finish, false, 'Base de madera laminada');
  cap.position.y = top;
  const thickness = 2.82;
  const tones = [0xa16c38, 0x68412a, 0xb68557, 0x7f5134, 0xcca16d, 0x94633d, 0xd0a878, 0x926940, 0xd5b089];
  const vertices = [];
  const colors: number[] = [];
  const uv = [];
  const indices = [];
  for (const [layer, shade] of tones.entries()) {
    const color = new THREE.Color(shade);
    for (const [i, p] of [...border, border[0]].entries()) {
      for (const level of [layer, layer + 1]) {
        const ratio = level / tones.length;
        const round = 1 - 0.006 * (Math.max(0, 1 - ratio / 0.22) + Math.max(0, (ratio - 0.84) / 0.16));
        vertices.push((left + right) / 2 + (p.x - (left + right) / 2) * round, top - thickness * (1 - ratio),
          (rear + front) / 2 + (p.y - (rear + front) / 2) * round);
        color.toArray(colors, colors.length);
        uv.push(i * 0.38, ratio * 0.48);
      }
      if (i < border.length) {
        const a = (layer * (border.length + 1) + i) * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  diquePart(parent, geometry, new THREE.MeshStandardMaterial({ map: wood, vertexColors: true,
    roughness: 0.67, side: THREE.DoubleSide }), true, 'Canto de nueve láminas');

  const bench = new THREE.MeshStandardMaterial({ color: 0x353942, map: wood, roughness: 0.82, bumpMap: wood, bumpScale: 0.07 });
  const x = (left + right) / 2;
  const z = (rear + front) / 2;
  box(parent, bench, x, top - thickness - 0.78, z, right - left + 350, 1.56, front - rear + 350, false);
  return box(parent, standard(0x1d232b, 0.94), x, 2.9, rear - 167, right - left + 350, 17, 0.6, false);
}

function workshopProps(parent: THREE.Group) {
  const darkSteel = standard(0x343c43, 0.65, 0.33);
  const brush = standard(0x544435, 0.88);
  const rust = standard(0x6c4037, 0.71, 0.2);
  for (const [x, z, radius, height, material] of [
    [left + 18, rear - 19, 8.1, 17.7, darkSteel],
    [right - 27, rear - 14, 8.6, 10.9, rust],
  ] as const) {
    const tin = diquePart(parent, new THREE.CylinderGeometry(radius, radius * 0.93, height, 18, 1, true), material);
    tin.position.set(x, -5.44 + height / 2, z);
    const inside = material.clone();
    inside.side = THREE.BackSide;
    const inner = diquePart(parent, new THREE.CylinderGeometry(radius - 0.13, radius * 0.93 - 0.13, height - 0.06, 18, 1, true), inside);
    inner.position.copy(tin.position);
    for (const y of [tin.position.y + height / 2, tin.position.y - height / 2 + 0.46]) {
      const rim = diquePart(parent, new THREE.TorusGeometry(radius - 0.1, 0.35, 5, 22), darkSteel);
      rim.position.set(x, y, z);
      rim.rotation.x = -Math.PI / 2;
    }
  }
  for (const [i, tilt] of [-0.38, 0.19, 0.08, -0.10, 0.26].entries()) {
    const x = left + 12 + i * 2.61;
    const z = rear - 20.6 + (i % 3) * 1.56;
    const end = new THREE.Vector3(x + tilt * 17, 26.8 + (i % 3) * 4, z + 2.6);
    diqueBeam(parent, brush, new THREE.Vector3(x, -2, z), end, 1.22, 1.47, false);
    diqueBeam(parent, darkSteel, end.clone().add(new THREE.Vector3(0, -3.1, -.7)), end, 1.59, 1.95, false);
  }
}

const banks = [
  [65.2, 56.7], [68.2, 60.5], [74.8, 70.5], [78.9, 81.2], [78.4, 95.7], [76.6, 109.5],
  [74.6, 123.2], [76.5, 135.3], [83.2, 141.5], [90.0, 136.6], [94.7, 126.8], [98.0, 116.0],
  [101.1, 102.7], [101.6, 88.6], [96.9, 73.4], [89.9, 61.3], [79.7, 55.6],
] as const;

function waterMaterial() {
  const time = { value: 0 };
  const night = { value: 0 };
  const water = new THREE.MeshPhysicalMaterial({ color: 0x0e3543, roughness: 0.23, metalness: 0.15,
    clearcoat: 0.85, clearcoatRoughness: 0.145, ior: 1.333, envMapIntensity: 0.92 });
  water.onBeforeCompile = shader => {
    shader.uniforms.harborTime = time;
    shader.uniforms.harborNight = night;
    shader.vertexShader = 'varying vec3 diqueWorld;\n' + shader.vertexShader.replace('#include <worldpos_vertex>',
      '#include <worldpos_vertex>\n diqueWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = `varying vec3 diqueWorld;
      uniform float harborTime;
      uniform float harborNight;
      vec2 dockWave(vec2 p) {
        float t = harborTime;
        float current = 1.0 - smoothstep(13.0, 16.0, p.y);
        vec2 first = vec2(0.62, 1.16);
        vec2 second = vec2(-1.92, 0.62);
        vec2 third = vec2(0.36, 3.42);
        float drift = sin(dot(p, vec2(0.23, 0.31)) - t * 0.63);
        return first * 0.102 * cos(dot(p, first) - (1.55 + current) * t + drift)
          + second * 0.060 * cos(dot(p, second) + 1.6 * t + 0.62 * drift)
          + third * 0.035 * cos(dot(p, third) - (2.1 + 3.7 * current) * t)
          + vec2(0.057, -0.042) * sin(dot(p, vec2(4.31, -5.4)) + t * 2.21);
      }
    ` + shader.fragmentShader
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec2 dockSlope = dockWave(diqueWorld.xz);
        normal = normalize(normal + mat3(viewMatrix) * vec3(dockSlope.x, 0.0, dockSlope.y));
      `)
      .replace('#include <clearcoat_normal_fragment_maps>', 'clearcoatNormal = normal;')
      .replace('#include <opaque_fragment>', `
        vec2 q = diqueWorld.xz;
        float t = harborTime;
        float river = 1.0 - smoothstep(13.0, 16.0, q.y);
        float crossing = sin(dot(q, vec2(0.63, -0.37)) + 0.55 * t);
        float bands = sin(q.y * 4.4 + q.x * 0.34 + 1.63 * crossing - (3.2 + 3.6 * river) * t);
        float breakup = sin(dot(q, vec2(2.28, 1.01)) - 2.1 * crossing + t * 1.44);
        float sparkle = smoothstep(0.34, 0.98, bands * (0.66 + 0.34 * breakup));
        float detail = 1.0 - smoothstep(0.65, 1.8, length(fwidth(q)));
        float teal = 0.78 + 0.15 * crossing + 0.07 * breakup;
        float grazing = pow(1.0 - max(0.0, dot(normal, normalize(vViewPosition))), 2.6);
        float amberX = q.x + 1.17 * bands + 0.87 * breakup + 0.35 * crossing;
        float reflections = pow(0.5 + 0.5 * cos((amberX - 4.5) * 0.218
          + 0.32 * sin(amberX * 0.105)), 16.0);
        float quay = smoothstep(15.5, 17.2, q.y) * (1.0 - smoothstep(21.2, 25.0, q.y));
        float gold = reflections * quay * (0.06 + 0.94 * sparkle * detail) * (0.59 + 0.63 * harborNight);
        outgoingLight = outgoingLight * teal
          + vec3(0.010, 0.033, 0.052) * (0.7 + grazing)
          + (0.022 + 0.042 * grazing) * sparkle * detail * vec3(0.44, 0.82, 1.0)
          + gold * vec3(1.0, 0.49, 0.21);
        #include <opaque_fragment>
      `);
  };
  water.customProgramCacheKey = () => 'dique-muelle-water';
  return { water, time, night };
}

function shadowWater() {
  const { canvas, context } = canvas2d(128, 64);
  const gradient = context.createLinearGradient(0, 0, 0, 64);
  gradient.addColorStop(0, 'rgba(8,22,24,0)');
  gradient.addColorStop(0.47, 'rgba(8,22,24,.24)');
  gradient.addColorStop(1, 'rgba(8,22,24,.74)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 64);
  return new THREE.MeshBasicMaterial({ map: texture(canvas), transparent: true, depthWrite: false });
}

function buildQuay(parent: THREE.Group, concrete: THREE.MeshStandardMaterial, facade?: THREE.Object3D, pier?: THREE.Object3D) {
  const metal = standard(0x746e60, 0.6, 0.61);
  const tire = standard(0x292d2d, 0.91);
  const rusty = standard(0x856238, 0.77, 0.32);
  const ochre = standard(0xc79344, 0.67, 0.36);
  const cover = standard(0x171e20, 0.92);
  const height = DIQUE_GROUND - DIQUE_WATER + 0.49;
  const mouth = diquePlanPoint(87.5, 0).x;
  const bounds = [[left + 0.43, mouth - 1.70], [mouth + 1.70, right - 0.43]];
  for (const [from, to] of bounds) {
    box(parent, concrete, (from + to) / 2, DIQUE_GROUND - height / 2, DIQUE_FRONT - 0.16, to - from, height, 0.32);
  }
  const cap = box(parent, concrete, (left + right) / 2, DIQUE_GROUND + 0.01, DIQUE_FRONT - 0.17, right - left - 0.88, 0.19, 0.58);
  const uv = cap.geometry.clone();
  const uvs = uv.getAttribute('uv');
  for (let i = 0; i < uvs.count; i++) uvs.setX(i, uvs.getX(i) * 29);
  cap.geometry = uv;
  box(parent, cover, mouth, DIQUE_WATER + 0.35, DIQUE_FRONT - 0.74, 3.32, 0.84, 0.22, false);
  for (const side of [-1, 1]) {
    box(parent, rusty, mouth + side * 1.60, DIQUE_WATER + 0.40, DIQUE_FRONT + 0.035, 0.30, 0.88, 0.22, false);
  }
  box(parent, metal, mouth, DIQUE_WATER + 0.82, DIQUE_FRONT + 0.035, 3.30, 0.18, 0.26, false);

  const shadow = diquePart(parent, new THREE.PlaneGeometry(right - left - 0.4, 3.4).rotateX(-Math.PI / 2), shadowWater());
  shadow.position.set((left + right) / 2, DIQUE_WATER + 0.006, DIQUE_FRONT + 1.65);
  if (pier) {
    const landing = pier.clone(true);
    landing.position.set(right - 13.8, DIQUE_GROUND, DIQUE_FRONT - 0.19);
    landing.rotation.y = -0.035;
    parent.add(landing);
  }
  if (facade) {
    for (const [from, to] of bounds) {
      const count = Math.round((to - from) / 7.12);
      const span = (to - from) / count;
      for (let start = 0; start < count; start += 5) {
        const tile = new THREE.Group();
        parent.add(tile);
        for (let i = start; i < Math.min(start + 5, count); i++) {
          const panel = facade.clone(true);
          panel.position.set(from + (i + 0.5) * span, DIQUE_GROUND, DIQUE_FRONT + 0.044);
          panel.scale.x = span / 7.12;
          tile.add(panel);
        }
        instanceStatic(tile);
      }
    }
    return;
  }

  const collar = new THREE.CylinderGeometry(1, 1, 1, 16);
  const bumper = new THREE.TorusGeometry(0.64, 0.184, 7, 22);
  const rng = random(1773);
  let previous = new THREE.Vector3();
  for (let x = left + 6.2; x <= right - 5.8; x += 7.15) {
    const pylon = diquePart(parent, collar, rusty);
    pylon.position.set(x, DIQUE_WATER + 0.276, DIQUE_FRONT + 0.24);
    pylon.scale.set(0.19, 1.61, 0.19);
    if (x < mouth - 2.1 || x > mouth + 2.1) {
      const fender = diquePart(parent, bumper, tire);
      fender.position.set(x + 0.28, DIQUE_WATER + 0.326, DIQUE_FRONT + 0.49);
      fender.rotation.z = 0.16 * (rng() - 0.5);
      diqueBeam(parent, metal, new THREE.Vector3(x + 0.28, DIQUE_GROUND + 0.11, DIQUE_FRONT + 0.05),
        new THREE.Vector3(x + 0.28, DIQUE_WATER + 0.89, DIQUE_FRONT + 0.49), 0.055, 0.053, false);
    }
    const bollard = diquePart(parent, collar, ochre);
    bollard.position.set(x, DIQUE_GROUND + 0.18, DIQUE_FRONT - 0.61);
    bollard.scale.set(0.24, 0.34, 0.24);
    const hat = diquePart(parent, collar, ochre);
    hat.position.copy(bollard.position).y += 0.192;
    hat.scale.set(0.32, 0.096, 0.32);
    if (previous.lengthSq() > 0) {
      const current = bollard.position.clone().add(new THREE.Vector3(0, 0.11, 0));
      const low = current.clone().lerp(previous, 0.5).add(new THREE.Vector3(0, -0.173, 0.05));
      diqueBeam(parent, rusty, previous, low, 0.062, 0.062, false);
      diqueBeam(parent, rusty, low, current, 0.062, 0.062, false);
    }
    previous = bollard.position.clone().add(new THREE.Vector3(0, 0.11, 0));
  }
}

function channelShore(parent: THREE.Group, points: readonly THREE.Vector2[], concrete: THREE.MeshStandardMaterial) {
  const rng = random(891);
  const rock = new THREE.DodecahedronGeometry(1, 0);
  const rocks = [standard(0x746b5d, 0.95), standard(0x646762, 0.86), standard(0x676a4a, 0.92)];
  const seam = standard(0x4b5145, 0.87);
  for (let i = 0; i < points.length; i += 2) {
    const a = points[i];
    const b = points[(i + 2) % points.length];
    const width = a.distanceTo(b);
    if (width < 0.10) continue;
    const wall = box(parent, concrete, (a.x + b.x) / 2, (DIQUE_GROUND + DIQUE_WATER) / 2 - 0.11, (a.y + b.y) / 2,
      0.68, DIQUE_GROUND - DIQUE_WATER + 0.23, width + 0.50, true);
    wall.rotation.y = Math.atan2(b.x - a.x, b.y - a.y);
    if (i % 4 !== 0) continue;
    const block = diquePart(parent, rock, rocks[Math.floor(rng() * rocks.length)], true);
    block.position.set(a.x + (rng() - 0.5) * 1.55, DIQUE_WATER + 0.33, a.y + (rng() - 0.5) * 1.62);
    block.rotation.set(rng() * 1.5, rng() * 6.28, rng());
    block.scale.set(0.65 + rng() * 0.83, 0.36 + rng() * 0.59, 0.62 + rng() * 0.89);
    box(parent, seam, b.x, DIQUE_GROUND + 0.033, b.y, 0.34, 0.048, 0.54, false).rotation.y = wall.rotation.y;
  }
}

function spillway(parent: THREE.Group, course: Course, concrete: THREE.MeshStandardMaterial, water: THREE.Material) {
  const origin = diquePlanPoint(73.1, 61.3);
  const gate = new THREE.Group();
  gate.name = 'Aliviadero del canal';
  gate.position.set(origin.x, 0, origin.z);
  gate.rotation.y = 0.21;
  parent.add(gate);
  const iron = standard(0x424d4c, 0.81, 0.35);
  const moss = standard(0x626b47, 0.96);
  const voidFace = standard(0x212c28, 0.96);
  const warning = standard(0xb48a45, 0.67, 0.21);
  box(gate, voidFace, 0, -0.08, -0.75, 3.80, 1.27, 0.16, false);
  box(gate, concrete, 0, 0.63, -0.30, 5.62, 0.33, 1.27, true);
  box(gate, iron, 0, -0.42, 0.39, 3.73, 0.16, 0.37, false);
  for (const side of [-1, 1]) {
    box(gate, concrete, side * 2.13, -0.78, 0.03, 0.92, 2.76, 1.29);
    for (let i = 0; i < 3; i++) {
      const wing = box(gate, concrete, side * (2.38 + i * 0.37), -1.36 - 0.26 * i, 0.98 + i * 0.85,
        0.79, 1.57 - i * 0.48, 1.12);
      wing.rotation.y = side * 0.21;
      box(gate, moss, side * (2.48 + i * 0.39), -0.56 - 0.50 * i, 1.18 + i * 0.87, 0.38, 0.053, 0.40, false);
    }
    for (const x of [0.38, 2.43]) box(gate, warning, side * x, 1.25, 0.30, 0.09, 0.88, 0.092, false);
    for (const y of [1.22, 1.64]) box(gate, warning, side * 1.29, y, 0.30, 2.39, 0.067, 0.059, false);
  }
  for (const x of [-1.52, -0.76, 0, 0.76, 1.52]) box(gate, iron, x, -0.02, 0.35, 0.047, 0.77, 0.062, false);
  const station = diquePlanPoint(71.7, 79.5);
  if (diqueRoadClear(course, station.x, station.z, 2.5)) {
    const service = new THREE.Group();
    service.position.set(station.x, DIQUE_GROUND, station.z);
    service.rotation.y = -0.28;
    parent.add(service);
    box(service, concrete, 0, 0.09, 0, 4.8, 0.18, 4.35);
    box(service, iron, 0.37, 0.48, -1.24, 2.51, 0.64, 0.96);
    for (const x of [-2.20, 2.20]) {
      for (const z of [-1.93, 1.68]) box(service, warning, x, 0.62, z, 0.098, 0.97, 0.11, false);
      for (const y of [0.57, 1.08]) box(service, warning, x, y, -0.13, 0.075, 0.061, 3.67, false);
    }
    for (let step = 0; step < 5; step++) box(service, iron, 0.96, -.15 * step, 2.05 + step * .24, 1.18, .11, .29);
  }
  const waterSheet = new THREE.BufferGeometry();
  waterSheet.setAttribute('position', new THREE.Float32BufferAttribute([
    -1.72, -0.35, 0.54, 1.72, -0.35, 0.54,
    -1.77, -1.18, 0.98, 1.77, -1.18, 0.98,
    -1.69, DIQUE_WATER + 0.012, 2.32, 1.69, DIQUE_WATER + 0.012, 2.32,
  ], 3));
  waterSheet.setIndex([0, 2, 1, 1, 2, 3, 2, 4, 3, 3, 4, 5]);
  waterSheet.computeVertexNormals();
  diquePart(gate, waterSheet, water);
  const { canvas, context } = canvas2d(128, 128);
  const rng = random(797);
  for (let i = 0; i < 114; i++) {
    const angle = rng() * Math.PI * 2;
    const radius = Math.sqrt(rng()) * 51;
    const x = 64 + Math.cos(angle) * radius;
    const y = 64 + Math.sin(angle) * radius * 0.77;
    context.fillStyle = `rgba(213,241,245,${(1 - radius / 57) * (0.20 + rng() * 0.66)})`;
    context.beginPath();
    context.ellipse(x, y, rng() * 7.6 + 1.0, rng() * 2.6 + 0.32, angle * 0.16, 0, Math.PI * 2);
    context.fill();
  }
  const foam = new THREE.MeshBasicMaterial({ map: texture(canvas), transparent: true, opacity: 0.79, depthWrite: false });
  const plume = diquePart(gate, new THREE.PlaneGeometry(5.35, 8.71).rotateX(-Math.PI / 2), foam);
  plume.position.set(0, DIQUE_WATER + 0.028, 4.10);
  return (seconds: number) => {
    foam.opacity = 0.75 + Math.sin(seconds * 3.2) * 0.13;
    plume.position.z = 4.10 + 0.41 * Math.sin(seconds * 2.19);
  };
}

export function buildDiqueHarbor(parent: THREE.Group, course: Course, wood: THREE.Texture, concrete: THREE.MeshStandardMaterial,
  facade?: THREE.Object3D, pier?: THREE.Object3D) {
  const backWall = laminatedBase(parent, wood);
  workshopProps(parent);
  const channel = new THREE.SplineCurve(banks.map(([x, z]) => { const p = diquePlanPoint(x, z); return new THREE.Vector2(p.x, p.z); }));
  channel.points.push(channel.points[0]);
  const river = channel.getSpacedPoints(120).slice(0, -1);
  const land = diquePart(parent, planarUvs(diquePlane(outline(left + 0.55, right - 0.55, rear + 0.55, DIQUE_FRONT, 2.0), [river]), 12.5, 12.5),
    concrete, false, 'Plataforma de hormigón del dique');
  land.position.y = DIQUE_GROUND;
  const { water, time, night } = waterMaterial();
  const basin = diquePart(parent, diquePlane(outline(left + 0.56, right - 0.56, DIQUE_FRONT - 1.7, front - 0.55, 3.8)), water);
  basin.name = 'Agua del muelle';
  basin.position.y = DIQUE_WATER;
  const stream = diquePart(parent, diquePlane(river), water);
  stream.name = 'Canal del vertedero';
  stream.position.y = DIQUE_WATER + 0.004;
  channelShore(parent, river, concrete);
  const falling = spillway(parent, course, concrete, water);
  buildQuay(parent, concrete, facade, pier);
  return {
    backWall,
    update(now: number) {
      time.value = (now % 900_000) / 1000;
      falling(time.value);
    },
    setNight(enabled: boolean) { night.value = Number(enabled); },
  };
}

function tunnelPortal(parent: THREE.Group, course: Course, distance: number, outgoing: boolean,
  concrete: THREE.MeshStandardMaterial, housing: THREE.Material, warm: THREE.Material) {
  const p = course.sampleAt(distance);
  const half = course.wallHalfAt(distance, 1) + 0.13;
  const { clearance, archClearance } = course.tunnel;
  const portal = new THREE.Group();
  portal.position.copy(diqueEdge(course, p));
  portal.rotation.y = Math.atan2(p.dx, p.dz) + (outgoing ? 0 : Math.PI);
  parent.add(portal);
  for (const side of [-1, 1]) {
    box(portal, concrete, side * (half + 0.40), clearance / 2 - 0.07, 0.01, 0.80, clearance + 0.22, 0.96);
    box(portal, housing, side * half * 0.83, archClearance + 0.18, 0.56, 0.33, 0.27, 0.22, false);
    box(portal, warm, side * half * 0.83, archClearance + 0.18, 0.68, 0.22, 0.16, 0.07, false);
    for (let i = 0; i < 4; i++) {
      box(portal, i % 2 === 0 ? housing : warm, side * (half + 0.31), 0.15 + i * 0.27, 0.507, 0.29, 0.14, 0.029, false).rotation.z = -0.25;
    }
  }
  box(portal, concrete, 0, archClearance + 0.31, 0.02, 2 * half + 1.55, 0.56, 0.92);
  const plate = new THREE.MeshStandardMaterial({ map: diqueSign(['TÚNEL'], '#282e2e', '#eadaba'), roughness: 0.64 });
  const roadSign = diquePart(portal, new THREE.PlaneGeometry(2.15, 0.36), plate);
  roadSign.position.set(0, archClearance + 0.30, 0.495);
}

function tunnelReflections() {
  const { canvas, context } = canvas2d(64, 64);
  const light = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  light.addColorStop(0, 'rgba(255,163,73,.83)');
  light.addColorStop(0.35, 'rgba(234,130,51,.42)');
  light.addColorStop(1, 'rgba(201,91,26,0)');
  context.fillStyle = light;
  context.fillRect(0, 0, 64, 64);
  return new THREE.MeshBasicMaterial({ map: texture(canvas), opacity: 0.73, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending });
}

export function buildDiqueTunnel(parent: THREE.Group, course: Course, concrete: THREE.MeshStandardMaterial) {
  const tunnel = new THREE.Group();
  tunnel.name = 'Túnel de hormigón bajo el puente';
  parent.add(tunnel);
  const { from, to, clearance, archClearance } = course.tunnel;
  const stations = diqueSpan(course, from, to);
  const block = concrete.clone();
  block.color.setHex(0x888277);
  const housing = standard(0x463c2d, 0.78, 0.33);
  const warm = new THREE.MeshStandardMaterial({ color: 0xffdc8b, emissive: 0xffa333, emissiveIntensity: 1.45, roughness: 0.59 });
  const half = (p: ReturnType<Course['sampleAt']>, side: number) => side * (course.wallHalfAt(p.s, side) + 0.13);
  const ceiling = (p: ReturnType<Course['sampleAt']>) => clearance + (archClearance - clearance)
    * (1 - THREE.MathUtils.smoothstep(Math.min(p.s - from, to - p.s), 1.1, 5.3));
  for (const side of [-1, 1]) {
    const inside = (p: ReturnType<Course['sampleAt']>) => diqueEdge(course, p, half(p, side), -0.21);
    const head = (p: ReturnType<Course['sampleAt']>) => diqueEdge(course, p, half(p, side), ceiling(p));
    const geometry = diqueStrip(stations, side < 0 ? head : inside, side < 0 ? inside : head, 'longitudinal');
    diquePart(tunnel, geometry, block, true, 'Pared interior del túnel');
    const outside = (p: ReturnType<Course['sampleAt']>) => diqueEdge(course, p, half(p, side) + side * 0.61, -0.245);
    const outerHead = (p: ReturnType<Course['sampleAt']>) => diqueEdge(course, p, half(p, side) + side * 0.61, ceiling(p) + 0.38);
    diquePart(tunnel, diqueStrip(stations, side < 0 ? outside : outerHead, side < 0 ? outerHead : outside, 'longitudinal'), concrete, true);
  }
  diquePart(tunnel, diqueStrip(stations,
    p => diqueEdge(course, p, half(p, 1), ceiling(p)), p => diqueEdge(course, p, half(p, -1), ceiling(p))), block, true, 'Techo continuo interior');
  diquePart(tunnel, diqueStrip(stations,
    p => diqueEdge(course, p, half(p, -1) - 0.61, ceiling(p) + 0.38),
    p => diqueEdge(course, p, half(p, 1) + 0.61, ceiling(p) + 0.38)), concrete, true, 'Losa superior del túnel');
  tunnelPortal(tunnel, course, from, false, concrete, housing, warm);
  tunnelPortal(tunnel, course, to, true, concrete, housing, warm);
  const glints = tunnelReflections();
  const projections: THREE.BufferGeometry[] = [];
  const cylinder = standard(0x454952, 0.67, 0.43);
  for (let s = from + 3.6; s < to - 2.2; s += 5.8) {
    const p = course.sampleAt(s);
    const yaw = Math.atan2(p.dx, p.dz);
    const center = diqueEdge(course, p, 0, ceiling(p) + 0.437);
    box(tunnel, concrete, center.x, center.y, center.z, course.wallHalfAt(s, 1) * 2 + 0.80, 0.086, 0.61, false).rotation.y = yaw;
    const floor = diqueEdge(course, p, 0.0, 0.023);
    projections.push(new THREE.PlaneGeometry(course.roadHalfAt(s) * 1.94, 4.5).rotateX(-Math.PI / 2).rotateY(yaw).translate(floor.x,floor.y,floor.z));
    for (const side of [-1, 1]) {
      const at = diqueEdge(course, p, side * (course.wallHalfAt(s, side) - 0.20), clearance - 0.52);
      box(tunnel, housing, at.x, at.y, at.z, 0.18, 0.19, 1.50, false).rotation.y = yaw;
      box(tunnel, warm, at.x, at.y - 0.074, at.z, 0.14, 0.07, 1.34, false).rotation.y = yaw;
      const sideGlow = diqueEdge(course, p, half(p, side) - side * 0.017, clearance - 0.92);
      const rotation = Math.atan2(side * p.dz, -side * p.dx);
      projections.push(new THREE.PlaneGeometry(4.6, 2.42).rotateY(rotation).translate(sideGlow.x, sideGlow.y, sideGlow.z));
      const conduit = diqueEdge(course, p, half(p, side) - side * 0.09, clearance - 0.22);
      box(tunnel, cylinder, conduit.x, conduit.y, conduit.z, 0.068, 0.074, 5.64, false).rotation.y = yaw;
    }
  }
  const batch = mergeGeometries(projections);
  if (batch) diquePart(tunnel, batch, glints, false, 'Luz sobre el hormigón y el asfalto');
  for (const geometry of projections) geometry.dispose();
  return { setNight(enabled: boolean) {
    warm.emissiveIntensity = enabled ? 3.10 : 1.78;
    glints.opacity = enabled ? 0.88 : 0.58;
  } };
}
