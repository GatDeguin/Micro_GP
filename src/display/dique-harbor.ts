import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { diquePlanPoint, type Course } from '../shared/courses';
import { box, canvas2d, random, standard, texture } from './materials';
import { instanceStatic, mergeStatic } from './batches';
import { DIQUE_GROUND, DIQUE_WATER, diqueBeam, diqueEdge, diquePart, diquePlane, diqueSign, diqueSpan, diqueStrip } from './dique-geometry';
import { buildDiqueGorge, diqueGorgeOutline } from './dique-gorge';
import { cameraLights } from './render-layers';

export const DIQUE_FRONT = 15.4;
const left = diquePlanPoint(6.5, 0).x;
const right = diquePlanPoint(269, 0).x;
const rear = diquePlanPoint(0, 0).z;
const front = diquePlanPoint(0, 176.5).z;
const top = -2.62;
const thickness = 2.82;
const benchLevel = top - thickness;
const quaysideLights = [12.3, 39.14, 70.05, 99.64, 127.9, 159.48, 189.2, 212.7].map(distance => left + distance);

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

function laminatedBase(parent: THREE.Group, wood: THREE.Texture, gorge: readonly THREE.Vector2[], basin: readonly THREE.Vector2[]) {
  const border = outline(left, right, rear, front, 5.30);
  const finish = new THREE.MeshPhysicalMaterial({ color: 0xd7a979, map: wood, roughness: 0.63, clearcoat: 0.18, clearcoatRoughness: 0.57 });
  const cap = diquePart(parent, planarUvs(diquePlane(border, [gorge]), 59, 16), finish, false, 'Base de madera laminada');
  cap.position.y = top;
  const frame = new THREE.Shape(outline(left + .23, right - .23, DIQUE_FRONT - 1.22, front - .23, 4.65)
    .map(point => new THREE.Vector2(point.x, -point.y)));
  frame.holes.push(new THREE.Path(basin.map(point => new THREE.Vector2(point.x, -point.y))));
  const trim = new THREE.ExtrudeGeometry(frame, { depth: .53, bevelEnabled: true, bevelSegments: 2,
    bevelSize: .055, bevelThickness: .041 }).rotateX(-Math.PI / 2);
  diquePart(parent, planarUvs(trim, 59, 16), finish, false, 'Marco de madera barnizada de la dársena').position.y = top - .042;
  const tones = [0xa16c38, 0x68412a, 0xb68557, 0x7f5134, 0xcca16d, 0x94633d, 0xd0a878, 0x926940, 0xd5b089];
  let perimeter = 0;
  const distance = [...border, border[0]].map((point, i) => {
    if (i > 0) perimeter += point.distanceTo(border[i - 1]);
    return perimeter;
  });
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
        uv.push(distance[i] / 43, ratio * 0.115);
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
  box(parent, bench, x, benchLevel - 0.78, z, right - left + 350, 1.56, front - rear + 350, false);
  return box(parent, standard(0x1d232b, 0.94), x, 2.9, rear - 167, right - left + 350, 17, 0.6, false);
}

function workshopProps(parent: THREE.Group) {
  const darkSteel = standard(0x4c514e, 0.73, 0.42);
  const brush = standard(0x64513d, 0.94);
  const rust = standard(0x635349, 0.82, 0.25);
  const oxidized = standard(0x5b6061, 0.64, 0.41);
  const rubber = standard(0x313c3e, .89);
  const canvas = standard(0x8e8069, .96);
  for (const [x, z, radius, height, material] of [
    [left + 20, rear - 26.5, 6.15, 13.4, darkSteel],
    [right - 32, rear - 23, 6.02, 8.65, rust],
  ] as const) {
    const tin = diquePart(parent, new THREE.CylinderGeometry(radius, radius * 0.93, height, 22, 1, true), material);
    tin.position.set(x, benchLevel + height / 2, z);
    const inside = material.clone();
    inside.side = THREE.BackSide;
    const inner = diquePart(parent, new THREE.CylinderGeometry(radius - 0.13, radius * 0.93 - 0.13, height - 0.06, 22, 1, true), inside);
    inner.position.copy(tin.position);
    for (const h of [.38, .62, height * .34, height - .31, height]) {
      const band = diquePart(parent, new THREE.TorusGeometry(radius * (.93 + .07 * h / height), h === height ? .185 : .087, 5, 22), oxidized);
      band.position.set(x, benchLevel + h, z);
      band.rotation.x = -Math.PI / 2;
    }
    diquePart(parent, new THREE.CylinderGeometry(radius * .91, radius * .91, .16, 22), rubber).position.set(x, benchLevel + .38, z);
  }
  for (const [i, tilt] of [-.44, .19, .08, .26].entries()) {
    const x = left + 15.6 + i * 2.38;
    const z = rear - 29.9 + (i % 3) * 1.43;
    const end = new THREE.Vector3(x + tilt * 11, 16.7 + (i % 3) * 2.62, z + 2.8);
    const ferrule = end.clone().add(new THREE.Vector3(-tilt * 1.8, -2.42, -.68));
    const tip = end.clone().add(new THREE.Vector3(tilt * 1.15, 2.47, .55));
    diqueBeam(parent, i === 1 ? rubber : brush, new THREE.Vector3(x, -1.5, z), ferrule, .58, .72, false);
    diqueBeam(parent, oxidized, ferrule, end, .82, 1.08, false);
    diqueBeam(parent, i % 2 ? brush : canvas, end, tip, .70, .95, false);
  }
  const rag = box(parent, canvas, right - 12.2, benchLevel + .21, rear - 24.3, 10.05, .39, 6.9, false);
  rag.rotation.y = -.16;
  box(parent, brush, right - 8.48, benchLevel + .48, rear - 24.1, .31, .16, 5.94, false).rotation.y = -.16;
  for (const [dx, dz, radius, height] of [[-19.9, 18.2, 1.96, 4.22], [-17.12, 24.54, 2.05, 2.47], [-9.37, 29.82, 2.34, 3.62]]) {
    const center = left - dx;
    diquePart(parent, new THREE.CylinderGeometry(radius * .88, radius, height, 16), rubber).position.set(center, benchLevel + height / 2, rear - dz);
    diquePart(parent, new THREE.CylinderGeometry(radius * .81, radius * .88, .67, 16), oxidized).position
      .set(center, benchLevel + height + .24, rear - dz);
  }
}

function waterMaterial() {
  const time = { value: 0 };
  const night = { value: 0 };
  const pilingPositions = { value: new Float32Array(quaysideLights) };
  const water = new THREE.MeshPhysicalMaterial({ color: 0x0c2c36, roughness: 0.20, metalness: 0.12,
    clearcoat: 0.95, clearcoatRoughness: 0.095, ior: 1.333, envMapIntensity: 1.15 });
  water.onBeforeCompile = shader => {
    shader.uniforms.harborTime = time;
    shader.uniforms.harborNight = night;
    shader.uniforms.quayPilings = pilingPositions;
    shader.vertexShader = 'varying vec3 diqueWorld;\n' + shader.vertexShader.replace('#include <worldpos_vertex>',
      '#include <worldpos_vertex>\n diqueWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = `varying vec3 diqueWorld;
      uniform float harborTime;
      uniform float harborNight;
      uniform float quayPilings[8];
      vec2 dockWave(vec2 p) {
        float t = harborTime;
        float current = 1.0 - smoothstep(13.0, 16.0, p.y);
        vec2 first = vec2(0.62, 1.16);
        vec2 second = vec2(-1.92, 0.62);
        vec2 third = vec2(0.36, 3.42);
        float drift = sin(dot(p, vec2(0.23, 0.31)) - t * 0.63);
        return first * mix(0.058, 0.102, current) * cos(dot(p, first) - (1.55 + current) * t + drift)
          + second * 0.045 * cos(dot(p, second) + 1.6 * t + 0.62 * drift)
          + third * 0.024 * cos(dot(p, third) - (2.1 + 3.7 * current) * t)
          + vec2(0.038, -0.032) * sin(dot(p, vec2(4.31, -5.4)) + t * 2.21);
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
        float quay = smoothstep(15.5, 16.38, q.y) * (1.0 - smoothstep(20.64, 25.5, q.y));
        float split = 0.38 + smoothstep(15.5, 24.7, q.y) * 1.22;
        float distortedX = q.x + split * (0.87 * bands + 0.69 * breakup + 0.35 * crossing);
        float reflections = 0.0;
        float darkPiling = 0.0;
        for (int i = 0; i < 8; i++) {
          float alignment = abs(quayPilings[i] - distortedX);
          reflections += 1.0 - smoothstep(0.13, 2.16, alignment);
          darkPiling += 1.0 - smoothstep(0.08, 0.66, abs(quayPilings[i] - q.x - 0.33 * bands));
        }
        float gold = reflections * quay * (0.032 + 0.58 * sparkle * detail) * (0.27 + 1.05 * harborNight);
        float shadow = darkPiling * (1.0 - smoothstep(16.0, 19.73, q.y)) * smoothstep(15.5, 16.2, q.y);
        float riverShade = smoothstep(-4.7, -2.75, diqueWorld.y);
        float ridge = smoothstep(0.19, 0.93, breakup * crossing + 0.54 * breakup);
        outgoingLight = outgoingLight * teal * (1.0 - 0.51 * shadow) * (0.55 + 0.45 * riverShade)
          + vec3(0.010, 0.033, 0.052) * (0.7 + grazing)
          + (0.014 + 0.037 * grazing) * sparkle * detail * mix(1.0, 0.36 + 0.64 * ridge, river)
            * vec3(0.44, 0.82, 1.0)
          + gold * vec3(1.0, 0.58, 0.27);
        #include <opaque_fragment>
      `);
  };
  water.customProgramCacheKey = () => 'dique-muelle-water';
  return { water, time, night };
}

function shadowWater() {
  const { canvas, context } = canvas2d(128, 64);
  const gradient = context.createLinearGradient(0, 0, 0, 64);
  gradient.addColorStop(0, 'rgba(8,22,24,.72)');
  gradient.addColorStop(0.48, 'rgba(8,22,24,.28)');
  gradient.addColorStop(1, 'rgba(8,22,24,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 64);
  return new THREE.MeshBasicMaterial({ map: texture(canvas), transparent: true, depthWrite: false });
}

function tideStain() {
  const { canvas, context } = canvas2d(512, 60);
  const gradient = context.createLinearGradient(0, 0, 0, 60);
  gradient.addColorStop(0, 'rgba(47,51,43,0)');
  gradient.addColorStop(.48, 'rgba(60,59,42,.45)');
  gradient.addColorStop(.70, 'rgba(39,48,42,.89)');
  gradient.addColorStop(1, 'rgba(25,43,40,.82)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 512, 60);
  const rng = random(132);
  for (let i = 0; i < 380; i++) {
    const x = rng() * 512;
    const y = 13 + rng() ** .38 * 47;
    const width = .61 + rng() ** 2 * 4.75;
    context.fillStyle = i % 5 === 0 ? 'rgba(125,122,82,.25)' : 'rgba(28,39,34,.23)';
    context.fillRect(x, y, width, 3 + rng() ** 1.5 * 21);
  }
  const map = texture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  return new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false });
}

function quayFittings(parent: THREE.Group, corners: readonly (readonly [number, number])[], wood: THREE.Texture) {
  const stains = tideStain();
  for (const [from, to] of corners) {
    const geometry = new THREE.PlaneGeometry(to - from, .54);
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (to - from) / 16.3);
    diquePart(parent, geometry, stains, false, 'Marca de marea en el muro')
      .position.set((from + to) / 2, DIQUE_WATER + .227, DIQUE_FRONT + .223);
  }
  const dark = standard(0x4b4842, .87, .31);
  const edge = standard(0x837251, .67, .35);
  const timber = new THREE.MeshPhysicalMaterial({ color: 0x9a8172, map: wood, roughness: .81,
    clearcoat: .16, clearcoatRoughness: .78 });
  const lamp = new THREE.MeshStandardMaterial({ color: 0xffc584, emissive: 0xf99138, emissiveIntensity: 1.37, roughness: .48 });
  const rust = standard(0x765741, .82, .37);
  for (const [i, x] of quaysideLights.entries()) {
    const z = DIQUE_FRONT + .92;
    const piling = box(parent, timber, x, DIQUE_WATER + .57, z, .48, 1.74, .49);
    piling.rotation.y = .14 * Math.sin(i * 4.15);
    for (const h of [.17, 1.27]) {
      box(parent, dark, x, DIQUE_WATER + h, z, .52, .10, .53).rotation.y = piling.rotation.y;
    }
    box(parent, edge, x, DIQUE_WATER + 1.47, z, .58, .10, .63).rotation.y = piling.rotation.y;
    box(parent, dark, x, DIQUE_WATER + 1.37, z + .28, .36, .17, .13);
    box(parent, lamp, x, DIQUE_WATER + 1.37, z + .35, .23, .079, .023, false);
    box(parent, rust, x, DIQUE_WATER + .95, DIQUE_FRONT + .43, .27, .22, .54);
  }
}

function buildQuay(parent: THREE.Group, concrete: THREE.MeshStandardMaterial, wood: THREE.Texture,
  facade?: THREE.Object3D, pier?: THREE.Object3D) {
  const metal = standard(0x746e60, 0.6, 0.61);
  const tire = standard(0x292d2d, 0.91);
  const rusty = standard(0x856238, 0.77, 0.32);
  const ochre = standard(0xc79344, 0.67, 0.36);
  const cover = standard(0x171e20, 0.92);
  const height = DIQUE_GROUND - DIQUE_WATER + 0.49;
  const mouth = diquePlanPoint(87.5, 0).x;
  const bounds = [[left + 0.43, mouth - 1.70], [mouth + 1.70, right - 0.43]] as const;
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
  quayFittings(parent, bounds, wood);

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

export function buildDiqueHarbor(parent: THREE.Group, course: Course, wood: THREE.Texture, concrete: THREE.MeshStandardMaterial,
  facade?: THREE.Object3D, pier?: THREE.Object3D) {
  const river = diqueGorgeOutline();
  const moorings = outline(left + 1.15, right - 1.15, DIQUE_FRONT - 0.82, front - 1.21, 3.8);
  const backWall = new THREE.Group();
  backWall.name = 'Pared y herramientas exteriores del taller';
  parent.add(backWall);
  backWall.add(laminatedBase(parent, wood, river, moorings));
  workshopProps(backWall);
  mergeStatic(backWall, undefined, 28);
  const land = diquePart(parent, planarUvs(diquePlane(outline(left + 0.55, right - 0.55, rear + 0.55, DIQUE_FRONT, 2.0), [river]), 12.5, 12.5),
    concrete, false, 'Plataforma de hormigón del dique');
  land.position.y = DIQUE_GROUND;
  const { water, time, night } = waterMaterial();
  // The basin gets a separate material before static batching so its local
  // reflection can be refreshed independently of the moving river.
  const basinMaterial = water.clone();
  basinMaterial.onBeforeCompile = water.onBeforeCompile;
  basinMaterial.customProgramCacheKey = water.customProgramCacheKey;
  const basin = diquePart(parent, diquePlane(moorings), basinMaterial);
  basin.name = 'Agua del muelle';
  basin.position.y = DIQUE_WATER;
  buildDiqueGorge(parent, course, river, concrete, water, time, night);
  buildQuay(parent, concrete, wood, facade, pier);
  let reflection: THREE.WebGLRenderTarget | undefined;
  let capturedAtNight = false;
  function captureReflections(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    const target = new THREE.WebGLCubeRenderTarget(128, {
      type: renderer.extensions.has('EXT_color_buffer_float') ? THREE.HalfFloatType : THREE.UnsignedByteType,
    });
    const camera = new THREE.CubeCamera(.18, 74, target);
    cameraLights(camera, false);
    camera.position.set((left + right) * .5 + 28, DIQUE_WATER + .32, DIQUE_FRONT + 9.2);
    const generator = new THREE.PMREMGenerator(renderer);
    try {
      basin.visible = false;
      renderer.shadowMap.needsUpdate = true;
      camera.update(renderer, scene);
      const next = generator.fromCubemap(target.texture);
      reflection?.dispose(); reflection = next;
      basinMaterial.envMap = next.texture;
      capturedAtNight = !!night.value;
      applyReflectionIntensity();
    } finally {
      basin.visible = true;
      generator.dispose(); target.dispose();
    }
  }
  function applyReflectionIntensity() {
    if (reflection) {
      basinMaterial.envMapIntensity = night.value ? (capturedAtNight ? 1.25 : .45) : (capturedAtNight ? .85 : 1.30);
    }
  }
  return {
    backWall,
    captureReflections,
    update(now: number) { time.value = (now % 900_000) / 1000; },
    setNight(enabled: boolean) { night.value = Number(enabled); applyReflectionIntensity(); },
  };
}

function tunnelWarning() {
  const { canvas, context } = canvas2d(64, 144);
  context.fillStyle = '#c99c4c';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#2b2d2a';
  for (let y = -64; y < 144; y += 34) {
    context.beginPath();
    context.moveTo(0, y + 21);
    context.lineTo(64, y - 9);
    context.lineTo(64, y + 9);
    context.lineTo(0, y + 39);
    context.closePath();
    context.fill();
  }
  const rng = random(27842);
  for (let i = 0; i < 117; i++) {
    context.fillStyle = i % 4 === 0 ? 'rgba(187,160,99,.38)' : 'rgba(55,43,31,.28)';
    context.fillRect(rng() * 64, rng() * 144, .75 + rng() * 4, .8 + rng() * 2.7);
  }
  return new THREE.MeshStandardMaterial({ map: texture(canvas), roughness: .86 });
}

function tunnelPortal(parent: THREE.Group, course: Course, distance: number, outgoing: boolean,
  concrete: THREE.MeshStandardMaterial, facing: THREE.MeshStandardMaterial, housing: THREE.Material,
  warm: THREE.Material, warning: THREE.Material) {
  const p = course.sampleAt(distance);
  const half = course.wallHalfAt(distance, 1) + 0.13;
  const { clearance, archClearance } = course.tunnel;
  const portal = new THREE.Group();
  portal.position.copy(diqueEdge(course, p));
  portal.rotation.y = Math.atan2(p.dx, p.dz) + (outgoing ? 0 : Math.PI);
  parent.add(portal);
  const inner = half + .028;
  const outer = half + .74;
  const collar = new THREE.Shape([
    [inner, -.05], [outer, -.05], [outer, archClearance + .18], [outer - .30, archClearance + .68],
    [-outer + .30, archClearance + .68], [-outer, archClearance + .18], [-outer, -.05],
    [-inner, -.05], [-inner, archClearance + .035], [-inner + .47, archClearance + .28],
    [inner - .47, archClearance + .28], [inner, archClearance + .035],
  ].map(([x, y]) => new THREE.Vector2(x, y)));
  diquePart(portal, new THREE.ExtrudeGeometry(collar, { depth: .24, bevelEnabled: true,
    bevelSize: .044, bevelThickness: .044, bevelSegments: 2 }), facing, true, 'Marco biselado de boca vial').position.z = .54;
  for (const side of [-1, 1]) {
    box(portal, concrete, side * (half + 0.47), clearance / 2 - 0.07, 0.018, 0.94, clearance + 0.22, 1.19);
    box(portal, facing, side * (half + .84), .32, .99, .65, .69, .92);
    diqueBeam(portal, concrete, new THREE.Vector3(side * (half + .81), 1.74, .58),
      new THREE.Vector3(side * (half + 1.04), .36, 1.53), .62, .59);

    const panel = diquePart(portal, new THREE.PlaneGeometry(.54, 1.46), warning);
    panel.position.set(side * (half + .36), .80, .835);
    const shoulder = box(portal, housing, side * (half + .99), .84, .75, .09, 1.47, .63);
    shoulder.rotation.y = side * .16;
    const marker = diquePart(portal, new THREE.PlaneGeometry(.58, 1.39), warning);
    marker.position.set(side * (half + 1.047), .85, .75);
    marker.rotation.y = side * 1.73;

    const floodlight = new THREE.Group();
    floodlight.position.set(side * (half - .70), archClearance + .24, .84);
    floodlight.rotation.set(-.37, side * .29, 0, 'YXZ');
    portal.add(floodlight);
    box(floodlight, housing, 0, 0, 0, 1.03, .34, .25, false);
    for (const x of [-.245, .245]) box(floodlight, warm, x, 0, .135, .35, .174, .04, false);

    const sideLamp = new THREE.Group();
    sideLamp.position.set(side * (half + .72), archClearance - .39, .32);
    sideLamp.rotation.set(-.31, side * 1.23, 0, 'YXZ');
    portal.add(sideLamp);
    box(sideLamp, housing, 0, 0, 0, .67, .27, .15, false);
    for (const x of [-.155, .155]) box(sideLamp, warm, x, 0, .086, .22, .126, .033, false);
  }
  box(portal, concrete, 0, archClearance + 0.41, 0.02, 2 * half + 1.66, .76, .97);
  box(portal, facing, 0, archClearance + .76, .12, 2 * half + 1.88, .17, 1.39);
  const hasPlant = outgoing && course.treatmentDetour;
  const plate = new THREE.MeshStandardMaterial({
    map: diqueSign(hasPlant ? ['DEPURADORA', 'DESVÍO POR EL RIACHO'] : ['TÚNEL'], '#262d2c', '#dfd2af'), roughness: .69,
  });
  const roadSign = diquePart(portal, new THREE.PlaneGeometry(2.54, .50), plate);
  roadSign.position.set(0, archClearance + .48, .833);
  if (hasPlant) {
    const map = diqueSign(['←  DEPURADORA', 'SEGUÍ LAS BALIZAS ÁMBAR'], '#352e22', '#ffe1a0', '#bd955e');
    const station = course.sampleAt(distance - 4.2);
    const side = 1;
    const guide = diquePart(parent, new THREE.PlaneGeometry(2.64, 0.58),
      new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffbd78, emissiveIntensity: 1.04 }));
    guide.position.copy(diqueEdge(course, station, side * (course.wallHalfAt(station.s, side) + 0.103), 1.59));
    guide.rotation.y = Math.atan2(side * station.dz, -side * station.dx);
  }
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
  block.color.setHex(0x797970);
  const facing = concrete.clone();
  facing.color.setHex(0xb7a793);
  const slab = concrete.clone();
  slab.color.setHex(0x8c9897);
  slab.roughness = .72;
  slab.bumpScale = .038;
  const coping = standard(0x746f62, .88);
  const caulk = standard(0x3f4747, .91);
  const housing = standard(0x463c2d, 0.78, 0.33);
  const warm = new THREE.MeshStandardMaterial({ color: 0xffdc8b, emissive: 0xffa333, emissiveIntensity: 1.45, roughness: 0.59 });
  const warning = tunnelWarning();
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
    const margin = (p: ReturnType<Course['sampleAt']>, offset: number) =>
      diqueEdge(course, p, half(p, side) + side * offset, ceiling(p) + .402);
    diquePart(tunnel, diqueStrip(stations, p => margin(p, side < 0 ? .65 : .40), p => margin(p, side < 0 ? .40 : .65)),
      coping, true, 'Remate longitudinal de la losa');
  }
  diquePart(tunnel, diqueStrip(stations,
    p => diqueEdge(course, p, half(p, 1), ceiling(p)), p => diqueEdge(course, p, half(p, -1), ceiling(p))), block, true, 'Techo continuo interior');
  diquePart(tunnel, diqueStrip(stations,
    p => diqueEdge(course, p, half(p, -1) - 0.61, ceiling(p) + 0.38),
    p => diqueEdge(course, p, half(p, 1) + 0.61, ceiling(p) + 0.38)), slab, true, 'Losa prefabricada gris del túnel');
  tunnelPortal(tunnel, course, from, false, concrete, facing, housing, warm, warning);
  tunnelPortal(tunnel, course, to, true, concrete, facing, housing, warm, warning);
  const glints = tunnelReflections();
  const projections: THREE.BufferGeometry[] = [];
  const cylinder = standard(0x454952, 0.67, 0.43);
  for (let s = from + 3.6, i = 0; s < to - 2.2; s += 5.8, i++) {
    const p = course.sampleAt(s);
    const yaw = Math.atan2(p.dx, p.dz);
    const center = diqueEdge(course, p, 0, ceiling(p) + .398);
    box(tunnel, caulk, center.x, center.y, center.z, course.wallHalfAt(s, 1) * 2 + .92, .023, .115, false).rotation.y = yaw;
    const lip = diqueEdge(course, p, 0, ceiling(p) + .424).addScaledVector(new THREE.Vector3(p.dx, 0, p.dz), .146);
    box(tunnel, slab, lip.x, lip.y, lip.z, course.wallHalfAt(s, 1) * 2 + .92, .056, .115, false).rotation.y = yaw;
    if (i % 2 === 0) {
      const access = diqueEdge(course, p, -2.0, ceiling(p) + .438);
      box(tunnel, coping, access.x, access.y, access.z, .82, .092, 1.04, false).rotation.y = yaw;
      box(tunnel, caulk, access.x, access.y + .05, access.z, .63, .021, .85, false).rotation.y = yaw;
    }
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
