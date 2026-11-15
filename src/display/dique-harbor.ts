import * as THREE from 'three';
import { diquePlanPoint, type Course } from '../shared/courses';
import { box, canvas2d, random, standard, texture } from './materials';
import { DIQUE_GROUND, DIQUE_WATER, diqueBeam, diqueEdge, diquePart, diquePlane, diqueSign, diqueSpan, diqueStrip } from './dique-geometry';

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

  const bench = new THREE.MeshStandardMaterial({ color: 0x393738, map: wood, roughness: 0.82, bumpMap: wood, bumpScale: 0.07 });
  const x = (left + right) / 2;
  const z = (rear + front) / 2;
  box(parent, bench, x, top - thickness - 0.78, z, right - left + 220, 1.56, front - rear + 210, false);
  return box(parent, standard(0x1d232b, 0.94), x, 2.9, rear - 103, right - left + 220, 17, 0.6, false);
}

const banks = [
  [65.2, 56.7], [68.2, 60.5], [74.8, 70.5], [78.9, 81.2], [78.4, 95.7], [76.6, 109.5],
  [74.6, 123.2], [76.5, 135.3], [83.2, 141.5], [90.0, 136.6], [94.7, 126.8], [98.0, 116.0],
  [101.1, 102.7], [101.6, 88.6], [96.9, 73.4], [89.9, 61.3], [79.7, 55.6],
] as const;

function waterMaterial() {
  const time = { value: 0 };
  const night = { value: 0 };
  const water = new THREE.MeshPhysicalMaterial({ color: 0x28677c, roughness: 0.24, metalness: 0.17,
    clearcoat: 0.63, clearcoatRoughness: 0.19, ior: 1.333, envMapIntensity: 0.80 });
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
        vec2 first = vec2(0.45, 0.81);
        vec2 second = vec2(-0.91, 0.55);
        vec2 third = vec2(1.33, 0.24);
        return first * 0.109 * cos(dot(p, first) - 1.3 * t)
          + second * 0.078 * cos(dot(p, second) + 1.6 * t)
          + third * 0.048 * cos(dot(p, third) - 0.92 * t + 0.41 * sin(p.y))
          + vec2(0.021, -0.020) * sin(dot(p, vec2(2.11, -3.47)) + t * 1.95);
      }
    ` + shader.fragmentShader
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec2 dockSlope = dockWave(diqueWorld.xz);
        normal = normalize(normal + mat3(viewMatrix) * vec3(dockSlope.x, 0.0, dockSlope.y));
      `)
      .replace('#include <clearcoat_normal_fragment_maps>', 'clearcoatNormal = normal;')
      .replace('#include <opaque_fragment>', `
        float teal = 0.72 + 0.28 * sin(diqueWorld.x * 0.14 + diqueWorld.z * 0.19 + 0.7 * sin(diqueWorld.z * 0.17));
        vec2 q = diqueWorld.xz;
        float wander = 1.22 * sin(dot(q, vec2(0.66, -0.44)) + harborTime * 0.62)
          + 0.72 * cos(dot(q, vec2(-0.79, 0.37)) - harborTime * 0.42);
        float spark = pow(max(0.0, sin(dot(q, vec2(1.18, 1.83)) + wander + 1.4 * harborTime)
          * (0.64 + 0.36 * cos(dot(q, vec2(-1.7, 1.54)) + 0.6 * wander - 0.8 * harborTime))), 9.0);
        float posts = pow(0.5 + 0.5 * cos(diqueWorld.x * 0.47 + 0.16 * sin(diqueWorld.z * 0.7 - harborTime)), 7.0);
        float quay = smoothstep(15.4, 17.7, diqueWorld.z) * (1.0 - smoothstep(17.8, 24.8, diqueWorld.z));
        outgoingLight = outgoingLight * teal
          + (1.0 - 0.45 * harborNight) * vec3(0.009, 0.052, 0.069) * (0.7 + 0.3 * teal)
          + spark * vec3(0.06, 0.115, 0.128) * (1.0 - 0.28 * harborNight)
          + quay * posts * (0.07 + 0.17 * spark) * vec3(1.0, 0.43, 0.16) * (0.34 + 0.71 * harborNight);
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

function buildQuay(parent: THREE.Group, concrete: THREE.MeshStandardMaterial) {
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
  const shadow = diquePart(parent, new THREE.PlaneGeometry(right - left - 0.4, 3.4).rotateX(-Math.PI / 2), shadowWater());
  shadow.position.set((left + right) / 2, DIQUE_WATER + 0.006, DIQUE_FRONT + 1.65);
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
    block.position.set(a.x + (rng() - 0.5) * 0.92, DIQUE_WATER + 0.09, a.y + (rng() - 0.5) * 0.96);
    block.rotation.set(rng() * 1.5, rng() * 6.28, rng());
    block.scale.set(0.42 + rng() * 0.66, 0.27 + rng() * 0.41, 0.45 + rng() * 0.69);
    box(parent, seam, b.x, DIQUE_GROUND + 0.033, b.y, 0.34, 0.048, 0.54, false).rotation.y = wall.rotation.y;
  }
}

function spillway(parent: THREE.Group, concrete: THREE.MeshStandardMaterial, water: THREE.Material) {
  const origin = diquePlanPoint(73.1, 61.3);
  const gate = new THREE.Group();
  gate.name = 'Aliviadero del canal';
  gate.position.set(origin.x, 0, origin.z);
  gate.rotation.y = 0.21;
  parent.add(gate);
  const iron = standard(0x424d4c, 0.81, 0.35);
  const moss = standard(0x626b47, 0.96);
  const voidFace = standard(0x212c28, 0.96);
  box(gate, voidFace, 0, -1.61, -0.70, 3.80, 1.08, 0.16, false);
  box(gate, concrete, 0, -0.91, -0.04, 4.80, 0.26, 1.12, true);
  box(gate, iron, 0, -1.14, 0.39, 3.73, 0.13, 0.37, false);
  for (const side of [-1, 1]) {
    box(gate, concrete, side * 2.05, -1.58, 0.03, 0.67, 1.44, 1.15);
    const wing = box(gate, concrete, side * 2.31, -1.81, 1.14, 0.39, 0.62, 2.47);
    wing.rotation.y = side * 0.21;
    box(gate, moss, side * 1.92, -1.43, 0.65, 0.36, 0.043, 0.27, false);
  }
  for (const x of [-1.52, -0.76, 0, 0.76, 1.52]) box(gate, iron, x, -1.46, 0.35, 0.045, 0.47, 0.062, false);
  const waterSheet = new THREE.BufferGeometry();
  waterSheet.setAttribute('position', new THREE.Float32BufferAttribute([
    -1.72, -1.29, 0.54, 1.72, -1.29, 0.54,
    -1.77, -1.68, 1.20, 1.77, -1.68, 1.20,
    -1.69, DIQUE_WATER + 0.012, 2.39, 1.69, DIQUE_WATER + 0.012, 2.39,
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
    context.fillStyle = `rgba(170,217,222,${(1 - radius / 57) * (0.14 + rng() * 0.47)})`;
    context.beginPath();
    context.ellipse(x, y, rng() * 7.6 + 1.0, rng() * 2.6 + 0.32, angle * 0.16, 0, Math.PI * 2);
    context.fill();
  }
  const foam = new THREE.MeshBasicMaterial({ map: texture(canvas), transparent: true, opacity: 0.55, depthWrite: false });
  const plume = diquePart(gate, new THREE.PlaneGeometry(5.61, 6.40).rotateX(-Math.PI / 2), foam);
  plume.position.set(0, DIQUE_WATER + 0.021, 3.52);
  return (seconds: number) => {
    foam.opacity = 0.54 + Math.sin(seconds * 3.2) * 0.10;
    plume.position.z = 3.52 + 0.25 * Math.sin(seconds * 2.19);
  };
}

export function buildDiqueHarbor(parent: THREE.Group, wood: THREE.Texture, concrete: THREE.MeshStandardMaterial) {
  const backWall = laminatedBase(parent, wood);
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
  const falling = spillway(parent, concrete, water);
  buildQuay(parent, concrete);
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
  for (let s = from + 3.6; s < to - 2.2; s += 5.8) {
    const p = course.sampleAt(s);
    for (const side of [-1, 1]) {
      const at = diqueEdge(course, p, side * (course.wallHalfAt(s, side) - 0.20), clearance - 0.52);
      const yaw = Math.atan2(p.dx, p.dz);
      box(tunnel, housing, at.x, at.y, at.z, 0.18, 0.19, 1.50, false).rotation.y = yaw;
      box(tunnel, warm, at.x, at.y - 0.074, at.z, 0.14, 0.07, 1.34, false).rotation.y = yaw;
    }
  }
  return { setNight(enabled: boolean) { warm.emissiveIntensity = enabled ? 2.9 : 1.45; } };
}
