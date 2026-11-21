import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CAR_DIMENSIONS, WHEEL_RADIUS, WHEEL_SIDE, type CarDimensions } from '../shared/car-dimensions';
import { CAR_SPECS, type CarView } from '../shared/protocol';
import { TALLER, type Course } from '../shared/courses';
import { mergeStatic } from './batches';
import { ARCH_RADIUS, archFloor, crownHeight, sectionAt, shellGeometry, shellSections, sidePoint, type Section } from './car-shell';
import { box, canvas2d, random, standard, texture } from './materials';
import { headlightLayer } from './render-layers';
import { buildLocalReflections, type LocalReflector } from './local-reflections';

const compact: Section[] = [
  [-0.88, 0.414, 0.142, 0.408], [-0.77, 0.465, 0.134, 0.451], [-0.56, 0.537, 0.133, 0.490],
  [-0.30, 0.470, 0.129, 0.451], [0.27, 0.473, 0.129, 0.452], [0.56, 0.538, 0.131, 0.480],
  [0.70, 0.513, 0.133, 0.465], [0.82, 0.459, 0.139, 0.441], [0.88, 0.413, 0.143, 0.423],
];
const coupe: Section[] = [
  [-0.97, 0.405, 0.17, 0.387], [-0.79, 0.48, 0.14, 0.443], [-0.61, 0.522, 0.13, 0.477],
  [-0.31, 0.453, 0.135, 0.419], [0.23, 0.448, 0.14, 0.412], [0.61, 0.526, 0.14, 0.477],
  [0.81, 0.474, 0.139, 0.427], [0.92, 0.408, 0.146, 0.377], [0.99, 0.373, 0.15, 0.354],
];
const racer: Section[] = [
  [-0.97, 0.337, 0.2, 0.301], [-0.89, 0.418, 0.159, 0.366], [-0.76, 0.494, 0.136, 0.441],
  [-0.585, 0.534, 0.13, 0.478], [-0.34, 0.491, 0.12, 0.461], [-0.10, 0.452, 0.12, 0.44],
  [0.29, 0.472, 0.13, 0.443], [0.585, 0.524, 0.133, 0.483], [0.75, 0.494, 0.144, 0.446],
  [0.86, 0.432, 0.156, 0.390], [0.95, 0.355, 0.171, 0.325], [0.99, 0.305, 0.180, 0.296],
];
const wedge: Section[] = [
  [-0.96, 0.495, 0.15, 0.428], [-0.78, 0.547, 0.13, 0.476], [-0.605, 0.548, 0.13, 0.48],
  [-0.36, 0.467, 0.13, 0.423], [0.18, 0.452, 0.13, 0.372], [0.405, 0.48, 0.135, 0.421],
  [0.605, 0.523, 0.14, 0.456], [0.725, 0.498, 0.14, 0.394], [0.825, 0.46, 0.142, 0.318],
  [0.94, 0.406, 0.144, 0.259], [1.02, 0.356, 0.151, 0.228],
];

const models = ([
  { body: compact, glass: [[-0.783, 0.388, 0.398, 0.467], [-0.672, 0.393, 0.420, 0.751], [-0.40, 0.389, 0.422, 0.765], [-0.10, 0.381, 0.423, 0.761], [0.175, 0.383, 0.426, 0.727], [0.404, 0.392, 0.434, 0.470]], roof: [-0.677, 0.142, 0.768, 0.380, 0.726], hood: 0.422, stripe: [-0.039, 0.039], wing: false },
  { body: coupe, glass: [[-0.73, 0.363, 0.39, 0.457], [-0.4, 0.368, 0.387, 0.676], [-0.09, 0.35, 0.38, 0.666], [0.091, 0.352, 0.397, 0.612], [0.45, 0.38, 0.4, 0.431]], roof: [-0.417, 0.025, 0.684, 0.337, 0.644], hood: 0.467, stripe: [-0.108, 0.108], wing: true },
  { body: racer, glass: [[-0.72, 0.361, 0.39, 0.438], [-0.47, 0.37, 0.40, 0.603], [-0.23, 0.353, 0.39, 0.701], [0.02, 0.357, 0.38, 0.686], [0.23, 0.368, 0.39, 0.606], [0.48, 0.377, 0.391, 0.435]], roof: [-0.39, 0.06, 0.701, 0.29, 0.679], hood: 0.54, stripe: [-0.07, 0.07], wing: false },
  { body: wedge, glass: [[-0.78, 0.407, 0.39, 0.476], [-0.49, 0.381, 0.39, 0.6], [-0.21, 0.362, 0.377, 0.597], [0.36, 0.376, 0.323, 0.408]], roof: [-0.521, -0.153, 0.607, 0.335, 0.588], hood: 0.4, stripe: [-0.105, 0.105], wing: true },
] as const).map((model, i) => ({ ...model, wheelbase: CAR_DIMENSIONS[i].axle / CAR_DIMENSIONS[i].renderScale[2] }));
type Model = (typeof models)[number];
const enamelColors = [0x118e99, 0xc7291c, 0xf3c312, 0x902a8e] as const;
const cleanEnamels = [0x206456, 0x802f28, 0xb78726, 0x65376e] as const;
const sectorEnamels = [0x17384b, 0x4f2437, 0x4a4030, 0x34304f] as const;
const sectorStripes = [0x54c8d2, 0xf07854, 0xffcb55, 0xe4a0ee] as const;

const WHEEL_Y = 0.208;
const GROUND_CLEARANCE = -0.001;
const hub = standard(0x292c2d, 0.49, 0.42);
const splitter = standard(0x292729, 0.72, 0.18);
const rubberSeal = standard(0x14181a, 0.78);
const upholstery = standard(0x46382e, 0.87);
const defrostWire = standard(0x675140, 0.81, 0.18);
const reverseLens = standard(0xaba99b, 0.30, 0.28);
const stripePaint = new THREE.MeshStandardMaterial({ color: 0xf0e2c7, roughness: 0.43, polygonOffset: true, polygonOffsetFactor: -2 });
const glass = new THREE.MeshPhysicalMaterial({ color: 0x192b32, metalness: 0.17, roughness: 0.22, clearcoat: 0.72, clearcoatRoughness: 0.22 });
const closeGlass = new THREE.MeshPhysicalMaterial({
  color: 0x23292d, metalness: 0.025, roughness: 0.13, clearcoat: 0.89, clearcoatRoughness: 0.13,
  envMapIntensity: 1.15, opacity: 0.45, transparent: true, depthWrite: false,
});
const frontMarker = new THREE.MeshPhysicalMaterial({ color: 0xad5317, roughness: 0.27,
  emissive: 0x984c16, emissiveIntensity: 0.1, clearcoat: 0.65 });
const tyreGeometry = new THREE.LatheGeometry([
  [0.122, -0.084], [0.172, -0.084], [0.192, -0.076], [0.206, -0.055],
  [0.207, -0.028], [0.201, -0.024], [0.207, -0.02],
  [0.207, 0.02], [0.201, 0.024], [0.207, 0.028], [0.206, 0.055],
  [0.192, 0.076], [0.172, 0.084], [0.122, 0.084],
].map(([x, y]) => new THREE.Vector2(x, y)), 48);
tyreGeometry.rotateZ(Math.PI / 2);

function wheelFaces() {
  const profile = [
    [0.109, -0.035], [0.117, -0.028], [0.123, -0.012], [0.128, -0.003],
    [0.132, 0.004], [0.135, 0.005], [0.138, -0.001], [0.136, -0.014],
  ];
  const turnedRim = new THREE.LatheGeometry(profile.reverse().map(([radius, depth]) =>
    new THREE.Vector2(radius, depth)), 36).rotateX(Math.PI / 2);
  const brakeDrum = new THREE.CircleGeometry(0.124, 28).translate(0, 0, -0.042);
  const hubCap = new THREE.CylinderGeometry(0.030, 0.036, 0.023, 16).rotateX(Math.PI / 2).translate(0, 0, -0.018);
  const lug = new THREE.CylinderGeometry(0.0046, 0.006, 0.007, 5).rotateX(Math.PI / 2).translate(0, 0.0245, -0.003);
  const valve = new THREE.CylinderGeometry(0.0040, 0.0034, 0.017, 5).rotateX(Math.PI / 2)
    .translate(0.036, -0.118, -0.012);
  const createFace = (spokeCount: number, tint: number, spokeWidth: number, direction: number) => {
    const pieces: THREE.BufferGeometry[] = [];
    const finish = (source: THREE.BufferGeometry, color: number) => {
      const g = source.clone();
      const c = new THREE.Color(color);
      const rgb = new Float32Array(g.getAttribute('position').count * 3);
      for (let i = 0; i < rgb.length; i += 3) c.toArray(rgb, i);
      g.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
      pieces.push(g);
      return g;
    };
    finish(turnedRim, 0xffffff);
    finish(brakeDrum, 0x313033);
    finish(hubCap, tint);
    finish(valve, 0x5a5850);
    const arm = new THREE.BoxGeometry(spokeWidth, 0.087, 0.016).rotateX(-0.19).rotateZ(direction)
      .translate(0.006 * direction, 0.071, -0.020);
    for (let i = 0; i < spokeCount; i++) {
      const angle = i * Math.PI * 2 / spokeCount;
      finish(arm, tint).rotateZ(angle);
      finish(lug, 0xc3b6a1).rotateZ(angle);
    }
    const merged = mergeGeometries(pieces).rotateY(Math.PI / 2);
    for (const piece of pieces) piece.dispose();
    arm.dispose();
    return merged;
  };
  const faces = [[5, 0xa29173, 0.026, 0.04], [4, 0x989694, 0.032, 0.07],
    [5, 0xb7b3a8, 0.025, -0.09], [6, 0x8b8894, 0.022, 0.14]]
    .map(([count, color, width, angle]) => createFace(count, color, width, angle));
  for (const geometry of [turnedRim, brakeDrum, hubCap, lug, valve]) geometry.dispose();
  return faces;
}

const wheelFace = wheelFaces();
const lampCup = new THREE.CylinderGeometry(1, 1, 1, 28).rotateX(Math.PI / 2);
const lampRing = new THREE.TorusGeometry(0.942, 0.058, 8, 30);
const lampLens = new THREE.SphereGeometry(1, 28, 16);
const lensVertices = lampLens.getAttribute('position');
const lensUV = lampLens.getAttribute('uv');
for (let i = 0; i < lensVertices.count; i++) {
  lensUV.setXY(i, (lensVertices.getX(i) + 1) / 2, (lensVertices.getY(i) + 1) / 2);
}
const screwHead = new THREE.CylinderGeometry(1, 0.88, 1, 16).rotateX(Math.PI / 2);
const roundedGeometry = new RoundedBoxGeometry(1, 1, 1, 1, 0.22);

function roundedPart(parent: THREE.Object3D, material: THREE.Material, x: number, y: number, z: number, width: number, height: number, depth: number) {
  const mesh = new THREE.Mesh(roundedGeometry, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(width, height, depth);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function metalFinish(polished: boolean) {
  const { canvas, context } = canvas2d(256, 64);
  const rng = random(polished ? 74 : 291);
  context.fillStyle = '#dbdbdb';
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 230; i++) {
    const x = rng() * canvas.width;
    const y = rng() * canvas.height;
    context.fillStyle = i % 4 ? `rgba(74, 74, 74, ${rng() * (polished ? 0.21 : 0.39)})` : 'rgba(255,255,255,.32)';
    context.fillRect(x, y, 5 + rng() * (polished ? 46 : 116), 0.28 + rng() * 0.52);
  }
  const scratches = texture(canvas);
  scratches.colorSpace = THREE.NoColorSpace;
  return new THREE.MeshPhysicalMaterial({
    color: polished ? 0xd2c8b5 : 0x9b9892,
    metalness: polished ? 0.79 : 0.61,
    roughness: polished ? 0.22 : 0.49,
    roughnessMap: scratches, bumpMap: scratches,
    bumpScale: polished ? 0.0018 : 0.0036,
    clearcoat: polished ? 0.72 : 0.2, clearcoatRoughness: polished ? 0.13 : 0.33,
    envMapIntensity: polished ? 1.3 : 0.84,
  });
}

function tyreMaterial() {
  const { canvas, context } = canvas2d(512, 160);
  const shoulder = context.createLinearGradient(0, 0, 0, canvas.height);
  for (const [v, shade] of [[0, '#8c8c8c'], [0.16, '#c2c2c2'], [0.32, '#aaaaaa'], [0.5, '#c5c5c5'],
    [0.68, '#aaaaaa'], [0.84, '#c2c2c2'], [1, '#8c8c8c']] as const) {
    shoulder.addColorStop(v, shade);
  }
  context.fillStyle = shoulder;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const tread = [[-13, 45], [-4, 54], [1, 67], [8, 74], [-1, 86], [3, 99], [14, 116]] as const;
  for (let x = -16; x <= canvas.width + 16; x += 16) {
    for (const [offset, color, width] of [[0, '#626262', 2.7], [1.9, '#dadada', 0.75]] as const) {
      context.beginPath();
      context.strokeStyle = color;
      context.lineWidth = width;
      tread.forEach(([dx, y], i) => {
        if (i === 0) context.moveTo(x + dx + offset, y);
        else context.lineTo(x + dx + offset, y);
      });
      context.stroke();
    }
  }
  for (const [y, color, width] of [[9, '#adadad', 1], [28, '#cdcdcd', 0.9], [38, '#8a8a8a', 1], [69, '#939393', 1.25],
    [91, '#939393', 1.25], [122, '#8a8a8a', 1], [132, '#cdcdcd', 0.9], [151, '#adadad', 1]] as const) {
    context.fillStyle = color;
    context.fillRect(0, y, canvas.width, width);
  }
  const rng = random(313);
  for (let i = 0; i < 745; i++) {
    context.fillStyle = i % 6 === 0 ? 'rgba(220,216,210,.18)' : 'rgba(102,97,90,.16)';
    context.fillRect(rng() * canvas.width, rng() * canvas.height, 0.5 + rng(), 0.4 + rng() * 0.75);
  }
  context.font = '700 8px Arial, sans-serif';
  for (const y of [20, 144]) for (const x of [19, 141, 262, 384]) {
    context.fillStyle = '#8c8c8c';
    context.fillText('RADIAL · 55 R13', x + 1, y + 1);
    context.fillStyle = '#cfcfcf';
    context.fillText('RADIAL · 55 R13', x, y);
  }
  const map = texture(canvas);
  map.colorSpace = THREE.NoColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  return new THREE.MeshStandardMaterial({ color: 0x252323, roughness: 0.98, map,
    bumpMap: map, bumpScale: 0.0039, roughnessMap: map });
}

function flutedLens() {
  const { canvas, context } = canvas2d(128, 128);
  const facets = context.createRadialGradient(50, 52, 3, 64, 65, 65);
  facets.addColorStop(0, '#e3dfd1');
  facets.addColorStop(0.54, '#bebeb0');
  facets.addColorStop(0.86, '#eeeeeb');
  facets.addColorStop(1, '#96958c');
  context.fillStyle = facets;
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let x = 1; x < canvas.width; x += 6) {
    context.fillStyle = 'rgba(76,73,65,.25)';
    context.fillRect(x, 0, 1.05, canvas.height);
    context.fillStyle = 'rgba(255,250,225,.32)';
    context.fillRect(x + 1.2, 0, 1.05, canvas.height);
    for (let y = 4 + x % 4; y < canvas.height; y += 5) {
      context.fillStyle = 'rgba(78,75,66,.38)';
      context.fillRect(x + 2, y, 1.35, 1.25);
    }
  }
  const map = texture(canvas);
  return new THREE.MeshPhysicalMaterial({
    color: 0xd3d4c7, map, metalness: 0.29, roughness: 0.21,
    emissive: 0x8c602b, emissiveIntensity: 0.12, clearcoat: 0.95, clearcoatRoughness: 0.15,
  });
}

function tailLightMap() {
  const { canvas, context } = canvas2d(128, 64);
  const gradient = context.createLinearGradient(0, 0, 0, 64);
  gradient.addColorStop(0, '#505050');
  gradient.addColorStop(0.19, '#d6d6d6');
  gradient.addColorStop(0.50, '#b9b9b9');
  gradient.addColorStop(0.80, '#d0d0d0');
  gradient.addColorStop(1, '#575757');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 64);
  for (let x = 2; x < 128; x += 5) {
    context.fillStyle = 'rgba(55,55,55,.48)';
    context.fillRect(x, 5, 1.55, 54);
    context.fillStyle = 'rgba(240,240,240,.32)';
    context.fillRect(x + 1.55, 7, 1, 50);
  }
  for (const y of [13, 31, 49]) {
    context.fillStyle = '#5d5d5d';
    context.fillRect(2, y, 124, 1.3);
    context.fillStyle = 'rgba(226,226,226,.45)';
    context.fillRect(2, y + 1.5, 124, 0.9);
  }
  return texture(canvas);
}

function enamelRelief() {
  const { canvas, context } = canvas2d(256, 128);
  const rng = random(1740);
  context.fillStyle = '#e7e7e7';
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 2200; i++) {
    context.fillStyle = i % 5 === 0 ? 'rgba(255,255,255,.24)' : 'rgba(156,156,156,.13)';
    context.fillRect(rng() * canvas.width, rng() * canvas.height, 0.55 + rng() * 1.35, 0.45 + rng() * 0.85);
  }
  // The lower panels and handled edges have lost more gloss than the roof.
  const abrasion = context.createLinearGradient(0, 0, 0, canvas.height);
  abrasion.addColorStop(0, 'rgba(255,255,255,.43)');
  abrasion.addColorStop(.21, 'rgba(255,255,255,.02)');
  abrasion.addColorStop(.76, 'rgba(75,75,75,.22)');
  abrasion.addColorStop(1, 'rgba(255,255,255,.18)');
  context.fillStyle = abrasion;
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 32; i++) {
    context.fillStyle = 'rgba(255,255,255,.32)';
    const edge = i % 2 ? rng() * 18 : canvas.height - rng() * 24;
    context.fillRect(rng() * canvas.width, edge, 1 + rng() ** 2 * 13, .7);
  }
  const relief = texture(canvas);
  relief.colorSpace = THREE.NoColorSpace;
  return relief;
}

function loft(parent: THREE.Object3D, sections: readonly Section[], material: THREE.Material, wheelbase?: number) {
  const mesh = new THREE.Mesh(shellGeometry(sections, wheelbase), material);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function seam(parent: THREE.Object3D, points: THREE.Vector3[], material: THREE.Material, radius: number, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'catmullrom', 0.18);
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, points.length * 4, radius, 5, closed), material);
  mesh.receiveShadow = true;
  parent.add(mesh);
}

function fastener(parent: THREE.Object3D, metal: THREE.Material, at: THREE.Vector3, normal: THREE.Vector3, radius: number, angle: number) {
  const screw = new THREE.Group();
  screw.position.copy(at);
  screw.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.normalize());
  screw.rotateZ(angle);
  const head = new THREE.Mesh(screwHead, metal);
  head.scale.set(radius, radius, 0.006);
  screw.add(head);
  box(screw, rubberSeal, 0, 0, 0.0033, radius * 1.20, radius * 0.24, 0.0018, false);
  box(screw, rubberSeal, 0, 0, 0.0044, radius * 0.24, radius * 1.20, 0.0018, false);
  parent.add(screw);
}

function sideDetails(parent: THREE.Object3D, close: THREE.Object3D, model: Model, paint: THREE.Material, trim: THREE.Material, side: number) {
  const body = (z: number, height: number) => sidePoint(model.body, z, height, side, 0.003, model.wheelbase);
  const window = (z: number, height: number) => sidePoint(model.glass, z, height, side);
  const edge = model.wheelbase - ARCH_RADIUS - 0.027;
  const door = [
    body(-edge, 0.79), body(edge * 0.76, 0.79), body(edge, 0.61),
    body(edge * 0.92, 0.23), body(-edge, 0.21), body(-edge * 1.02, 0.36),
  ];
  seam(close, door, rubberSeal, 0.0038, true);
  const handle = body(-0.23, 0.72);
  roundedPart(close, trim, handle.x, handle.y, handle.z, 0.019, 0.016, 0.079);
  const sill = [-edge, 0, edge].map(z => body(z, 0.12));
  seam(parent, sill, paint, 0.011);

  for (const center of [-model.wheelbase, model.wheelbase]) {
    for (const offset of [-0.17, -0.092, 0.128, 0.19]) {
      const z = center + offset;
      const dims = sectionAt(model.body, z);
      const [, , bottom, top] = dims;
      const height = Math.min(0.95, (archFloor(dims, model.wheelbase) + 0.028 - bottom) / (top - bottom));
      const at = body(z, height);
      const along = body(z + 0.008, height).sub(body(z - 0.008, height));
      const up = body(z, height + 0.018).sub(body(z, height - 0.018));
      fastener(close, trim, at, up.cross(along).multiplyScalar(side), model.body === compact ? 0.0152 : 0.0132, offset * 8);
    }
  }

  const rows = model.glass.slice(1, -1).map(([z]) => z);
  const pane = [model.glass[0][0] + 0.04, ...rows, model.glass[model.glass.length - 1][0] - 0.046];
  const frame = [...pane.map(z => window(z, 0.24)), ...pane.reverse().map(z => window(z, 0.87))];
  seam(parent, frame, trim, 0.012, true);
  seam(parent, frame.map(p => p.clone().add(new THREE.Vector3(side * 0.006, 0, 0))), rubberSeal, 0.009, true);
  const pillar = THREE.MathUtils.lerp(model.glass[1][0], model.roof[1], 0.48);
  seam(parent, [window(pillar, 0.24), window(pillar - 0.033, 0.87)], paint, 0.026);

  const mirror = window(model.glass[model.glass.length - 1][0] - 0.17, 0.29);
  box(parent, rubberSeal, mirror.x + side * 0.028, mirror.y, mirror.z, 0.075, 0.027, 0.036);
  roundedPart(parent, paint, mirror.x + side * 0.072, mirror.y + 0.016, mirror.z, 0.092, 0.056, 0.075);
  box(close, trim, mirror.x + side * 0.072, mirror.y + 0.016, mirror.z - 0.04, 0.067, 0.035, 0.008, false);
}

function roundHeadlight(parent: THREE.Object3D, trim: THREE.Material, lensMaterial: THREE.Material, x: number, y: number, z: number, radius: number, rake = 0) {
  const housing = new THREE.Group();
  housing.position.set(x, y, z);
  housing.rotation.x = rake;
  const socket = new THREE.Mesh(lampCup, rubberSeal);
  socket.scale.set(radius * 1.036, radius * 1.036, 0.026);
  const bezel = new THREE.Mesh(lampRing, trim);
  bezel.position.z = 0.013;
  bezel.scale.set(radius, radius, 0.071);
  const lens = new THREE.Mesh(lampLens, lensMaterial);
  lens.position.z = 0.011;
  lens.scale.set(radius * 0.906, radius * 0.906, 0.014);
  housing.add(socket, bezel, lens);
  parent.add(housing);
}

function windowBorders(parent: THREE.Object3D, model: Model, trim: THREE.Material) {
  const [rear, front] = model.roof;
  const panes = [
    [model.glass[0][0] + 0.019, rear - 0.018],
    [front + 0.036, model.glass[model.glass.length - 1][0] - 0.02],
  ];
  for (const [from, to] of panes) {
    const rows = [from, ...shellSections(model.glass).map(([z]) => z).filter(z => z > from + 0.02 && z < to - 0.02), to];
    const at = (z: number, side: number, edge: number, lift: number) => {
      const section = sectionAt(model.glass, z);
      const x = side * section[1] * edge;
      return new THREE.Vector3(x, crownHeight(section, x, false) + lift, z);
    };
    const border = (edge: number, lift: number, inset: number) => {
      const samples = rows.map(z => THREE.MathUtils.clamp(z, from + inset, to - inset));
      return [...samples.map(z => at(z, 1, edge, lift)), ...samples.reverse().map(z => at(z, -1, edge, lift))];
    };
    seam(parent, border(.736, .005, 0), trim, .0057, true);
    seam(parent, border(.699, .0067, .006), rubberSeal, .0081, true);
  }
}

function cockpit(parent: THREE.Object3D, model: Model) {
  const [rear, front, top, width] = model.roof;
  const seatZ = THREE.MathUtils.lerp(rear, front, 0.40);
  const parcelZ = THREE.MathUtils.lerp(model.glass[0][0], rear, 0.71);
  const parcel = sectionAt(model.glass, parcelZ);
  box(parent, splitter, 0, parcel[2] + 0.057, parcelZ, parcel[1] * 1.35, 0.027, 0.105, false);
  const shelf = new THREE.Mesh(topDecal(model.body, 0, parcel[1] * 1.46, model.glass[0][0] + .021,
    THREE.MathUtils.lerp(rear, front, .19), model.wheelbase), rubberSeal);
  shelf.name = 'Bandeja interior bajo la luneta';
  parent.add(shelf);
  for (const side of [-1, 1]) {
    const x = side * width * 0.48;
    box(parent, rubberSeal, x, 0.472, seatZ + 0.04, 0.181, 0.043, 0.217, false);
    box(parent, upholstery, x, (top + 0.472) * 0.5, seatZ - 0.076,
      0.179, top - 0.53, 0.074, false).rotation.x = -0.2;
    box(parent, rubberSeal, x, top - 0.084, seatZ - 0.094, 0.104, 0.064, 0.051, false);
  }
  const dash = sectionAt(model.glass, front + 0.11);
  box(parent, rubberSeal, 0, dash[3] - 0.072, dash[0], width * 1.57, 0.049, 0.105, false);
  const steering = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.010, 7, 20), splitter);
  steering.position.set(width * 0.47, dash[3] - 0.055, dash[0] - 0.071);
  steering.rotation.x = -0.34;
  parent.add(steering);
  box(steering, hub, 0, 0, 0, 0.102, 0.015, 0.009, false);
  box(parent, splitter, 0, 0.49, seatZ + 0.096, 0.027, 0.054, 0.028, false);

  const windshieldTip = model.glass[model.glass.length - 1][0];
  const mirrorZ = front + 0.071;
  const mirrorY = sectionAt(model.glass, mirrorZ)[3] - 0.050;
  box(parent, rubberSeal, 0, mirrorY, mirrorZ, 0.106, 0.025, 0.013, false);
  box(parent, hub, 0, mirrorY + 0.020, mirrorZ - 0.009, 0.012, 0.038, 0.019, false);
  for (const side of [-1, 1]) {
    const at = (x: number, z: number) => new THREE.Vector3(x, crownHeight(sectionAt(model.glass, z), x, false) + 0.010, z);
    const rest = windshieldTip - 0.033;
    seam(parent, [at(side * 0.157, rest), at(side * 0.075, rest - 0.018)], rubberSeal, 0.0038);
    seam(parent, [at(side * 0.050, rest - 0.020), at(side * 0.212, rest - 0.037)], rubberSeal, 0.0048);
  }
}

function rearDefroster(parent: THREE.Object3D, model: Model) {
  const first = model.glass[0][0] + 0.026;
  const last = model.roof[0] - 0.013;
  const positions: number[] = [];
  const indices: number[] = [];
  for (const ratio of [0.21, 0.38, 0.55, 0.72, 0.88]) {
    const center = THREE.MathUtils.lerp(first, last, ratio);
    const half = sectionAt(model.glass, center)[1] * 0.64;
    const zFrom = center - 0.00055;
    const zTo = center + 0.00055;
    for (let i = 0; i <= 10; i++) {
      const x = THREE.MathUtils.lerp(-half, half, i / 10);
      const start = positions.length / 3;
      for (const z of [zFrom, zTo]) positions.push(x, crownHeight(sectionAt(model.glass, z), x, false) - 0.0026, z);
      if (i < 10) indices.push(start, start + 1, start + 2, start + 2, start + 1, start + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const wire = new THREE.Mesh(geometry, defrostWire);
  wire.name = 'Hilos térmicos en la luneta';
  parent.add(wire);
}

function paintWear(parent: THREE.Object3D, model: Model, seed: number) {
  const rng = random(seed);
  const vertices: number[] = [];
  const colors: number[] = [];
  const bare = [new THREE.Color(0xb8ab91), new THREE.Color(0x6c6258), new THREE.Color(0x3e3127)];
  function chip(project: (u: number, v: number) => THREE.Vector3, length: number) {
    const color = bare[Math.floor(rng() * bare.length)];
    const width = length * (0.13 + rng() * 0.20);
    const corners = [[-length * 0.46, 0], [-length * 0.12, -width], [length * 0.51, width * (rng() - 0.5)],
      [length * 0.19, width * 0.72], [-length * 0.27, width * 0.38]];
    for (let i = 1; i + 1 < corners.length; i++) {
      for (const [u, v] of [corners[0], corners[i], corners[i + 1]]) {
        const { x, y, z } = project(u, v);
        vertices.push(x, y, z);
        colors.push(color.r, color.g, color.b);
      }
    }
  }

  for (const side of [-1, 1]) {
    for (const axle of [-model.wheelbase, model.wheelbase]) {
      for (let i = 0; i < 15; i++) {
        const center = axle + (rng() - 0.5) * 0.42;
        const edge = 0.009 + rng() * 0.033;
        chip((u, v) => {
          const dims = sectionAt(model.body, center + u);
          const height = Math.min(0.961, (archFloor(dims, model.wheelbase) + edge + v - dims[2]) / (dims[3] - dims[2]));
          return sidePoint(model.body, center + u, height, side, 0.0029, model.wheelbase);
        }, 0.004 + rng() * 0.018);
      }
    }
    const scuffs = model.body === compact ? 12 : 6;
    for (let i = 0; i < scuffs; i++) {
      const z = (rng() - 0.5) * 0.60;
      const height = 0.115 + rng() * 0.065;
      chip((u, v) => sidePoint(model.body, z + u, height + v, side, 0.0026, model.wheelbase), 0.008 + rng() * 0.035);
    }
  }

  const nose = model.body[model.body.length - 1][0];
  const tail = model.body[0][0];
  for (let i = 0; i < 19; i++) {
    const [z, width] = sectionAt(model.body, nose - 0.014 - rng() * 0.12);
    const x = (rng() - 0.5) * width * 1.40;
    if (model.stripe.some(offset => Math.abs(offset - x) < 0.042)) continue;
    chip((u, v) => new THREE.Vector3(x + u, crownHeight(sectionAt(model.body, z + v), x + u, true) + 0.0029, z + v), 0.004 + rng() * 0.019);
  }
  for (let i = 0; i < 25; i++) {
    const front = i % 2 === 0;
    const x = (rng() - 0.5) * 0.50;
    const y = (front ? bumperY(model) : 0.218) + (rng() - 0.5) * 0.028;
    chip((u, v) => new THREE.Vector3(x + u, y + v, front ? nose + 0.0535 : tail - 0.0505), 0.005 + rng() * 0.021);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.65, metalness: 0.30, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2,
  });
  parent.add(new THREE.Mesh(geometry, material));
}

function topDecal(sections: readonly Section[], offset: number, width: number, first: number, last: number, wheelbase?: number) {
  const positions: number[] = [];
  const indices: number[] = [];
  const uv: number[] = [];
  const surface = [sectionAt(sections, first), ...shellSections(sections, wheelbase).filter(([z]) => z > first && z < last), sectionAt(sections, last)];
  surface.forEach((section, row) => {
    const z = section[0];
    for (let i = 0; i <= 3; i++) {
      const x = offset + (i / 3 - 0.5) * width;
      positions.push(x, crownHeight(section, x, wheelbase !== undefined) + 0.0034, z);
      uv.push(i / 3, 1 - (z - first) / (last - first));
      if (row + 1 === surface.length || i === 3) continue;
      const a = row * 4 + i;
      indices.push(a, a + 4, a + 1, a + 1, a + 4, a + 5);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function stripe(parent: THREE.Object3D, sections: readonly Section[], offset: number, width: number, first: number,
  material: THREE.Material, wheelbase?: number) {
  const last = sections[sections.length - 1][0] - (wheelbase === undefined ? 0 : .025);
  const mesh = new THREE.Mesh(topDecal(sections, offset, width, first, last, wheelbase), material);
  mesh.receiveShadow = true;
  parent.add(mesh);
}

function numberOnRoof(parent: THREE.Object3D, number: string, roof: readonly Section[], z: number, length: number) {
  const { canvas, context } = canvas2d(192, 128);
  context.fillStyle = '#d7cbb6';
  context.fillRect(0, 0, 192, 128);
  context.strokeStyle = '#332d2a';
  context.lineWidth = 5;
  context.strokeRect(8, 8, 176, 112);
  context.fillStyle = '#211f1e';
  context.font = '900 89px system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(number, 96, 67);
  const from = z - length / 2;
  const to = z + length / 2;
  const width = 0.211;
  const roofEdge = Math.min(sectionAt(roof, from)[1], sectionAt(roof, to)[1]) * 0.77;
  const geometry = topDecal(roof, Math.min(0.148, roofEdge - width / 2 - 0.012), width, from, to);
  geometry.translate(0, 0.002, 0);
  const panel = new THREE.Mesh(geometry,
    new THREE.MeshStandardMaterial({ map: texture(canvas), roughness: 0.60, polygonOffset: true, polygonOffsetFactor: -2 }));
  parent.add(panel);
  return panel.material;
}

function wheel(parent: THREE.Object3D, side: number, z: number, tyre: THREE.Material, rim: THREE.Material,
  face: THREE.BufferGeometry, rollScale: number) {
  const pivot = new THREE.Group();
  const spin = new THREE.Group();
  pivot.position.set(side * WHEEL_SIDE, WHEEL_Y, z);
  pivot.scale.z = rollScale;
  pivot.add(spin);
  parent.add(pivot);
  const rubber = new THREE.Mesh(tyreGeometry, tyre);
  rubber.castShadow = rubber.receiveShadow = true;
  const spokes = new THREE.Mesh(face, rim);
  spokes.position.x = 0.092 * side;
  if (side < 0) spokes.rotation.y = Math.PI;
  spin.add(rubber, spokes);
  return { pivot, spin };
}

function carShadowMaterial() {
  const { canvas, context } = canvas2d(128, 64);
  for (const [x, stops] of [[32, [.53, .34, 0]], [96, [.92, .78, 0]]] as const) {
    const falloff = context.createRadialGradient(x, 32, 3, x, 32, 28);
    stops.forEach((alpha, i) => falloff.addColorStop([0, .40, 1][i], `rgba(8, 12, 16, ${alpha})`));
    context.fillStyle = falloff;
    context.fillRect(x - 32, 0, 64, 64);
  }
  return new THREE.MeshBasicMaterial({ map: texture(canvas), vertexColors: true, transparent: true, depthWrite: false });
}

function contactShadow(dimensions: CarDimensions, material: THREE.Material) {
  const patches = [new THREE.PlaneGeometry(dimensions.halfWidth * 2.73, (dimensions.front + dimensions.rear) * 1.22).rotateX(-Math.PI / 2)];
  for (const side of [-1, 1]) for (const end of [-1, 1]) {
    patches.push(new THREE.PlaneGeometry(0.32, 0.39).rotateX(-Math.PI / 2)
      .translate(WHEEL_SIDE * dimensions.renderScale[0] * side, 0.002, dimensions.axle * end));
  }
  patches.push(new THREE.PlaneGeometry(dimensions.halfWidth * 2.93, (dimensions.front + dimensions.rear) * 1.26)
    .rotateX(-Math.PI / 2).translate(0, .003, 0));
  patches.forEach((patch, i) => {
    const uv = patch.getAttribute('uv');
    const offset = i > 0 && i < 5 ? .5 : 0;
    for (let vertex = 0; vertex < uv.count; vertex++) uv.setX(vertex, uv.getX(vertex) * .5 + offset);
  });
  const geometry = mergeGeometries(patches);
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(
    patches.flatMap((_, i) => Array.from({ length: 4 }, () => [1, 1, 1, i === 0 ? 0.69 : i === 5 ? 0 : 0.94]).flat()), 4));
  const shadow = new THREE.Mesh(geometry, material);
  patches.forEach(patch => patch.dispose());
  shadow.position.y = 0.009;
  return shadow;
}

function bumperY(model: Model) {
  if (model.body === compact) return 0.213;
  if (model.body === wedge) return 0.164;
  return 0.187;
}

function frontFascia(parent: THREE.Object3D, detail: THREE.Object3D, model: Model, index: number, nose: number, trim: THREE.Material, paint: THREE.Material) {
  if (index < 2) {
    const cyan = index === 0;
    const center = cyan ? 0.324 : 0.283;
    const grilleWidth = cyan ? 0.453 : 0.425;
    const grilleHeight = cyan ? 0.118 : 0.105;
    roundedPart(parent, rubberSeal, 0, center, nose + 0.004, cyan ? 0.756 : 0.697, cyan ? 0.163 : 0.134, 0.021);
    roundedPart(parent, trim, 0, center, nose + 0.012, grilleWidth, grilleHeight, 0.013);
    roundedPart(parent, rubberSeal, 0, center, nose + 0.018, grilleWidth - 0.015, grilleHeight - 0.012, 0.012);
    for (const column of [-1, 1]) box(parent, hub, column * 0.077, center, nose + 0.025, 0.004, grilleHeight - 0.019, 0.006, false);
    for (let row = -3; row <= 3; row++) {
      box(parent, trim, 0, center + row * grilleHeight * 0.124, nose + 0.030, grilleWidth - 0.021, 0.0034, 0.006, false);
    }
    if (index === 1) {
      const y = crownHeight(sectionAt(model.body, 0.681), 0, true);
      loft(parent, [[0.516, 0.069, y - 0.012, y + 0.003], [0.682, 0.079, y - 0.012, y + 0.031]], paint);
      box(parent, rubberSeal, 0, y + 0.011, 0.683, 0.116, 0.020, 0.009, false);
    }
    for (const side of [-1, 1]) {
      const valanceY = cyan ? 0.159 : 0.153;
      fastener(detail, trim, new THREE.Vector3(side * 0.256, valanceY, nose + 0.006), new THREE.Vector3(0, 0, 1), cyan ? 0.019 : 0.012, side * 0.18);
      const x = side * 0.225;
      const z = cyan ? 0.700 : 0.776;
      const pinHeight = crownHeight(sectionAt(model.body, z), x, true);
      fastener(detail, trim, new THREE.Vector3(x, pinHeight + 0.003, z), new THREE.Vector3(0, 1, 0.18), 0.012, side * 0.4);
    }
    return;
  }

  const purple = index === 3;
  box(parent, rubberSeal, 0, purple ? 0.193 : 0.220, nose + (purple ? 0.032 : 0.018),
    purple ? 0.51 : 0.355, purple ? 0.063 : 0.054, 0.048, false);
  if (purple) {
    for (const x of [-0.18, -0.09, 0, 0.09, 0.18]) box(parent, splitter, x, 0.193, nose + 0.057, 0.01, 0.042, 0.01, false);
  }
}

function rearFascia(parent: THREE.Object3D, detail: THREE.Object3D, model: Model, index: number, tail: number,
  trim: THREE.Material, lens: THREE.Material, number: THREE.Material) {
  const x = [0.282, 0.275, 0.250, 0.346][index];
  const y = [0.327, 0.321, 0.281, 0.340][index];
  const width = [0.144, 0.154, 0.119, 0.158][index];
  const height = [0.060, 0.052, 0.042, 0.048][index];
  if (index > 0) {
    box(parent, rubberSeal, 0, y, tail - 0.007, x * 2 + width + 0.033, height + 0.017, 0.023, false);
  }
  for (const side of [-1, 1]) {
    if (index === 0) box(parent, rubberSeal, side * x, y, tail - 0.011, width + 0.021, height + 0.018, 0.026, false);
    const brake = roundedPart(parent, lens, side * (x - 0.012), y, tail - 0.025, width - 0.023, height, 0.022);
    brake.name = 'Piloto trasero estriado';
    brake.castShadow = false;
    box(detail, index < 2 ? frontMarker : reverseLens, side * (x + width * 0.392), y + (index === 0 ? 0.008 : 0),
      tail - 0.029, 0.024, index === 0 ? 0.033 : height * 0.76, 0.012, false);
    if (index === 0) box(detail, reverseLens, side * (x + 0.057), y - 0.017, tail - 0.030, 0.026, 0.012, 0.014, false);
  }

  const inset = index === 2 ? 0.220 : 0.262;
  box(parent, rubberSeal, 0, inset + (index === 2 ? 0.008 : 0), tail - 0.020,
    index === 3 ? 0.216 : 0.204, index === 2 ? 0.040 : 0.052, 0.031, false);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.128, 0.041), number);
  plate.name = 'Chapa trasera numerada';
  plate.position.set(0, inset + (index === 2 ? 0.012 : 0), tail - 0.037);
  plate.rotation.y = Math.PI;
  detail.add(plate);
  if (model.body === compact) box(detail, trim, 0, 0.342, tail - 0.009, 0.077, 0.017, 0.022, false);

  for (const tip of index < 2 ? [-0.257] : [-0.263, 0.263]) {
    const socket = new THREE.Mesh(lampCup, trim);
    socket.position.set(tip, 0.161, tail - 0.027);
    socket.scale.set(0.025, 0.021, 0.035);
    socket.receiveShadow = true;
    const bore = new THREE.Mesh(lampCup, rubberSeal);
    bore.position.set(tip, 0.161, tail - 0.044);
    bore.scale.set(0.0145, 0.012, 0.004);
    bore.receiveShadow = true;
    detail.add(socket, bore);
  }
}

function headlightPattern() {
  const { canvas, context } = canvas2d(128, 128);
  context.fillStyle = '#000';
  context.fillRect(0, 0, 128, 128);
  for (const x of [42, 86]) {
    context.save();
    context.translate(x, 64);
    context.scale(1, 1.65);
    const beam = context.createRadialGradient(0, 0, 3, 0, 0, 20);
    beam.addColorStop(0, '#fff');
    beam.addColorStop(0.34, '#ddd');
    beam.addColorStop(1, '#000');
    context.fillStyle = beam;
    context.fillRect(-20, -20, 40, 40);
    context.restore();
  }
  return texture(canvas);
}

export function buildCars(parent: THREE.Object3D) {
  const shadowMaterial = carShadowMaterial();
  const chrome = metalFinish(true);
  const satin = metalFinish(false);
  const wheelChrome = chrome.clone();
  const wheelSatin = satin.clone();
  wheelChrome.vertexColors = wheelSatin.vertexColors = true;
  const tyre = tyreMaterial();
  const lens = flutedLens();
  const tailGlow = tailLightMap();
  const enamel = enamelRelief();
  const beamMask = headlightPattern();
  return CAR_SPECS.map((car, i) => {
    const model = models[i];
    const dimensions = CAR_DIMENSIONS[i];
    const [scaleX, scaleY, scaleZ] = dimensions.renderScale;
    const trim = (i === 0 ? chrome : satin).clone();
    const root = new THREE.Group();
    const chassis = new THREE.Group();
    const axles = new THREE.Group();
    const headlights = new THREE.Group();
    const detail = new THREE.Group();
    chassis.scale.set(scaleX, scaleY, scaleZ);
    axles.scale.copy(chassis.scale);
    headlights.scale.copy(chassis.scale);
    const shadow = contactShadow(dimensions, shadowMaterial);
    const shadowVertices = shadow.geometry.getAttribute('position');
    const shadowColors = shadow.geometry.getAttribute('color');
    const projectionCorners = Array.from({ length: 4 }, (_, corner) =>
      new THREE.Vector2(shadowVertices.getX(20 + corner), shadowVertices.getZ(20 + corner)));
    chassis.add(detail);
    root.add(shadow, chassis, axles, headlights);
    parent.add(root);

    const paint = new THREE.MeshPhysicalMaterial({
      color: enamelColors[i], roughness: i === 0 ? 0.255 : 0.285, metalness: 0.22,
      clearcoat: 0.96, clearcoatRoughness: i === 3 ? 0.191 : 0.161, envMapIntensity: 1.13,
      roughnessMap: enamel, clearcoatRoughnessMap: enamel, bumpMap: enamel, bumpScale: 0.00067,
    });
    const localReflection = buildLocalReflections();
    const reflectiveGlass = closeGlass.clone();
    localReflection.attach(paint);
    localReflection.attach(reflectiveGlass, true);
    localReflection.attach(trim);
    loft(chassis, model.body, paint, model.wheelbase);
    box(chassis, splitter, 0, 0.148, 0, 0.56, 0.065, model.wheelbase * 2 + 0.44);
    const glazing = loft(chassis, model.glass, glass);
    glazing.castShadow = false;
    const [rear, front, top, width, frontTop] = model.roof;
    const roof: Section[] = [
      [rear - 0.021, width, top - 0.055, top - 0.026], [rear + 0.06, width, top - 0.048, top + 0.023],
      [front - 0.07, width * 0.96, top - 0.06, top + 0.024], [front + 0.024, width * 0.9, frontTop - 0.016, frontTop + 0.02],
    ];
    loft(chassis, roof, paint);
    windowBorders(chassis, model, trim);
    cockpit(detail, model);
    rearDefroster(detail, model);
    const number = numberOnRoof(chassis, car.number, roof, (rear + front) / 2, i === 3 ? 0.19 : 0.23);
    const stripes = stripePaint.clone();
    model.stripe.forEach(offset => {
      const width = i === 0 ? 0.072 : 0.062;
      stripe(chassis, model.body, offset, width, model.hood, stripes, model.wheelbase);
      stripe(chassis, roof, offset, width, roof[0][0], stripes);
    });

    const tail = model.body[0][0];
    const nose = model.body[model.body.length - 1][0];
    const bumper = i < 2 ? trim : splitter;
    roundedPart(chassis, bumper, 0, bumperY(model), nose + 0.019,
      i === 0 ? 0.754 : i === 2 ? 0.52 : 0.69, i === 0 ? 0.047 : i === 3 ? 0.036 : 0.056, 0.067);
    roundedPart(chassis, bumper, 0, 0.218, tail - 0.016, i === 3 ? 0.85 : 0.69, 0.066, 0.067);
    frontFascia(chassis, detail, model, i, nose, trim, paint);
    paintWear(detail, model, 114 + i * 317);
    const rearLamps = new THREE.MeshPhysicalMaterial({ color: 0xaf3022, map: tailGlow, emissive: 0xff281a, emissiveMap: tailGlow,
      emissiveIntensity: 0.24, roughness: 0.41, clearcoat: .78, clearcoatRoughness: .14 });
    rearFascia(chassis, detail, model, i, tail, trim, rearLamps, number);
    const headlamp = lens.clone();
    headlamp.emissive.setHex(0xffebc7);
    headlamp.emissiveIntensity = 0;
    // One masked spotlight projects two distinct pools and keeps the light layout stable in tunnels.
    const beam = new THREE.SpotLight(0xffe5bb, 0, 11, 0.33, 0.28, 2);
    beam.name = 'Proyección de los dos faros';
    beam.layers.set(headlightLayer(i));
    beam.map = beamMask;
    beam.position.set(0, 0.30, nose + 0.07);
    beam.target.position.set(0, -0.44, nose + 4.6);
    headlights.add(beam, beam.target);
    const blink = new THREE.MeshStandardMaterial({ color: 0xf0aa42, emissive: 0xff9b19, emissiveIntensity: 4, roughness: 0.35 });
    const hazards: THREE.Mesh[] = [];
    const wheels: ReturnType<typeof wheel>[] = [];
    for (const side of [-1, 1]) {
      const wheelTrim = i === 0 || i === 2 ? wheelChrome : wheelSatin;
      wheels.push(wheel(axles, side, -model.wheelbase, tyre, wheelTrim, wheelFace[i], scaleY / scaleZ),
        wheel(axles, side, model.wheelbase, tyre, wheelTrim, wheelFace[i], scaleY / scaleZ));
      sideDetails(chassis, detail, model, paint, trim, side);
      const headX = side * [0.285, 0.269, 0.312, 0.271][i];
      const headZ = i < 2 ? nose + 0.010 : i === 2 ? 0.816 : 0.887;
      const headY = i < 2 ? (i === 0 ? 0.323 : 0.281)
        : crownHeight(sectionAt(model.body, headZ), headX, true) - 0.007;
      const radius = [0.081, 0.074, 0.077, 0.067][i];
      roundHeadlight(chassis, i === 2 ? chrome : trim, headlamp, headX, headY, headZ, radius,
        i < 2 ? 0 : i === 2 ? -1 : -1.02);
      if (i < 2) {
        if (i === 1) roundHeadlight(chassis, chrome, lens, side * 0.115, 0.245, nose + 0.076, 0.064);
        const markX = side * (i === 0 ? 0.277 : 0.254);
        const markY = bumperY(model);
        box(chassis, rubberSeal, markX, markY, nose + 0.046, 0.096, 0.027, 0.009, false);
        box(chassis, frontMarker, markX, markY, nose + 0.051, 0.077, 0.017, 0.003, false);
      } else if (i === 3) {
        const intake = sidePoint(model.body, -0.30, 0.46, side, 0.007, model.wheelbase);
        box(chassis, rubberSeal, intake.x, intake.y, intake.z, 0.019, 0.086, 0.185, false).rotation.y = side * 0.19;
      }
      const tailX = i === 3 ? 0.342 : 0.281;
      hazards.push(box(chassis, blink, side * (tailX + 0.064), i === 2 ? 0.303 : 0.346, tail + 0.009, 0.072, 0.047, 0.068, false));
      if (model.wing) {
        const stanchion = box(chassis, splitter, side * (i === 3 ? 0.34 : 0.30), i === 3 ? 0.509 : 0.506,
          tail + 0.162, 0.038, i === 3 ? 0.13 : 0.166, 0.068);
        stanchion.rotation.x = 0.28;
      }
    }
    if (model.wing) {
      const halfSpan = i === 3 ? 0.527 : 0.46;
      const height = i === 3 ? 0.575 : 0.588;
      roundedPart(chassis, paint, 0, height, tail + 0.142, halfSpan * 2, 0.041, 0.229).rotation.x = 0.13;
      for (const side of [-1, 1]) roundedPart(chassis, paint, side * halfSpan, height, tail + 0.142, 0.024, 0.096, 0.241).rotation.x = 0.13;
    }

    // Close hardware is batched separately so it can be hidden in the race camera.
    mergeStatic(detail, new Set());
    detail.visible = false;
    mergeStatic(chassis, new Set([detail, glazing, ...hazards]));
    const casters: THREE.Object3D[] = [];
    root.traverse(object => { if (object.castShadow) casters.push(object); });
    let angle = 0;
    let settled = false;
    let night = false;
    let lit = false;
    let livery: CarView['livery'] = 'original';
    const roadBasis = new THREE.Matrix4();
    const roadYaw = new THREE.Quaternion();
    const upright = new THREE.Vector3(0, 1, 0);
    let projectedOpacity = 0;
    return {
      setNight(enabled: boolean) { night = enabled; },
      setReflections(reflectors: readonly LocalReflector[], view: CarView, cover: number, probe?: THREE.Texture, weight?: number) {
        localReflection.update(reflectors, view.x, view.y + .45, view.z, cover, night, probe, weight);
      },
      setProjectedShadow(enabled: boolean) { for (const caster of casters) caster.castShadow = enabled; },
      setDetail(close: boolean) {
        if (detail.visible === close) return;
        detail.visible = close;
        glazing.material = close ? reflectiveGlass : glass;
      },
      update(view: CarView, delta: number, slope: number, now: number, covered = false, bankRoll = 0, course: Course = TALLER) {
        const active = view.active !== false;
        chassis.visible = axles.visible = shadow.visible = active;
        const lighting = active && (night || covered);
        if (lit !== lighting) {
          lit = lighting;
          beam.intensity = lit ? 54 : 0;
          headlamp.emissiveIntensity = lit ? 2.5 : 0;
        }
        if (!active) return;
        const nextLivery = view.livery ?? 'original';
        if (nextLivery !== livery) {
          livery = nextLivery;
          paint.color.setHex(livery === 'clean' ? cleanEnamels[i] : livery === 'sector' ? sectorEnamels[i] : enamelColors[i]);
          stripes.color.setHex(livery === 'clean' ? 0xffc875 : livery === 'sector' ? sectorStripes[i] : 0xf0e2c7);
        }
        const spatial = course.frameAt && view.distance !== undefined ? course.frameAt(view.distance) : undefined;
        if (spatial) {
          roadBasis.set(spatial.rx, spatial.nx, spatial.tx, 0,
            spatial.ry, spatial.ny, spatial.ty, 0, spatial.rz, spatial.nz, spatial.tz, 0, 0, 0, 0, 1);
          const loop = course.loops?.find(loop => view.distance! >= loop.from && view.distance! <= loop.to);
          const heading = loop?.yaw ?? Math.atan2(spatial.tx, spatial.tz);
          const yaw = Math.atan2(Math.sin(view.yaw - heading), Math.cos(view.yaw - heading));
          root.quaternion.setFromRotationMatrix(roadBasis).multiply(roadYaw.setFromAxisAngle(upright, yaw));
          root.position.set(view.x + spatial.nx * GROUND_CLEARANCE,
            view.y + spatial.ny * GROUND_CLEARANCE, view.z + spatial.nz * GROUND_CLEARANCE);
        } else {
          root.position.set(view.x, view.y + GROUND_CLEARANCE, view.z);
          root.rotation.set(0, view.yaw, 0);
        }
        const pitch = spatial ? 0 : -Math.atan(slope);
        if (spatial) bankRoll = 0;
        const roll = view.suspension?.roll ?? 0;
        const heave = view.suspension?.heave ?? 0;
        shadow.position.y = 0.009 - (view.arcade?.jump ?? 0);
        shadow.rotation.x = axles.rotation.x = headlights.rotation.x = pitch;
        shadow.rotation.z = axles.rotation.z = headlights.rotation.z = bankRoll;
        chassis.rotation.x = pitch + (view.suspension?.pitch ?? 0);
        chassis.rotation.z = bankRoll + roll;
        chassis.position.y = heave;
        angle = (angle + view.speed * delta / (WHEEL_RADIUS * scaleY)) % (Math.PI * 2);
        const road = detail.visible && !spatial ? course.locate(view.x, view.z, { s: view.distance, y: view.y }) : null;
        const settle = road !== null && Math.abs(road.offset) < course.wallHalfAt(road.s, Math.sign(road.offset))
          && Math.abs(course.heightAt(road.s, road.offset) - view.y) < 0.10;
        const sinYaw = Math.sin(view.yaw);
        const cosYaw = Math.cos(view.yaw);
        // A soft, directional silhouette extends the close contact shadow on
        // level outdoor decks. The four tyre contacts keep their own positions.
        const grounded = !spatial || spatial.ny > .72;
        const projection = course.id !== 'taller' && !lit && grounded
          ? .71 * (1 - THREE.MathUtils.smoothstep(view.arcade?.jump ?? 0, .08, 1.20)) : 0;
        if (projection !== projectedOpacity || projection > 0) {
          const dx = (.53 * cosYaw + .62 * sinYaw) * projection;
          const dz = (.53 * sinYaw - .62 * cosYaw) * projection;
          for (let corner = 0; corner < 4; corner++) {
            const point = projectionCorners[corner];
            shadowVertices.setX(20 + corner, point.x + dx);
            shadowVertices.setZ(20 + corner, point.y + dz);
            shadowColors.setW(20 + corner, projection);
          }
          shadowVertices.needsUpdate = true;
          if (projection !== projectedOpacity) shadowColors.needsUpdate = true;
          projectedOpacity = projection;
        }
        const sinPitch = Math.sin(pitch);
        const cosPitch = Math.cos(pitch);
        const sinBank = Math.sin(bankRoll);
        wheels.forEach(({ spin, pivot }, index) => {
          spin.rotation.x = angle;
          pivot.rotation.y = index % 2 ? -view.steer * 0.31 : 0;
          let correction = 0;
          if (settle || settled) {
            const x = pivot.position.x * scaleX;
            const z = pivot.position.z * scaleZ;
            const tyreRoad = settle ? course.locate(view.x + cosYaw * x + sinYaw * z * cosPitch,
              view.z - sinYaw * x + cosYaw * z * cosPitch, { s: road.s, y: view.y }) : null;
            const hubFloor = root.position.y - sinPitch * z + cosPitch * sinBank * x;
            const ground = tyreRoad ? course.heightAt(tyreRoad.s, tyreRoad.offset) : hubFloor;
            correction = THREE.MathUtils.clamp(ground - hubFloor, -0.044, 0.044) / cosPitch;
            for (let corner = 0; corner < 4; corner++) shadowVertices.setY(4 + index * 4 + corner, 0.002 + correction);
          }
          const lightSide = roll < 0 ? -1 : 1;
          const unload = index % 2 === 1 && pivot.position.x * lightSide > 0 ? Math.max(0, heave - 0.009) * 0.38 : 0;
          pivot.position.y = WHEEL_Y + (correction + unload) / scaleY;
        });
        if (settle || settled) shadowVertices.needsUpdate = true;
        settled = settle;
        rearLamps.emissiveIntensity = view.braking ? 3.25 : lit ? 0.78 : 0.14;
        for (const hazard of hazards) hazard.visible = view.blink && Math.floor(now / 170) % 2 === 0;
      },
    };
  });
}
