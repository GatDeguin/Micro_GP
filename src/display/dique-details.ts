import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { diquePlanPoint, type Course } from '../shared/courses';
import { diqueBuildings } from './dique-architecture-layout';
import { DIQUE_GROUND, DIQUE_WATER, diquePart, diqueRoadClear } from './dique-geometry';
import { DIQUE_FRONT } from './dique-harbor';
import { canvas2d, noiseField, random, texture } from './materials';

type Surface = 'paint' | 'steel' | 'quay' | 'timber';
type Tint = THREE.ColorRepresentation;

const concrete = 0x776f60;
const zinc = 0x969588;
const steel = 0x465353;
const iron = 0x373c39;
const oxide = 0x79533d;
const ochre = 0xb78c47;
const canvas = 0xa7987b;
const wood = 0x8e6f4d;
const rubber = 0x2a2e2b;
const blue = 0x4d6b74;

function finishMap(kind: Surface) {
  const size = 256;
  const { canvas, context } = canvas2d(size, size);
  const rng = random(4686 + kind.charCodeAt(0) * 7);
  const cloud = noiseField(13, 17, rng);
  const aggregate = noiseField(122, 137, rng);
  const runoff = noiseField(41, 8, rng);
  const scratches = noiseField(96, 27, rng);
  const pixels = context.createImageData(size, size);
  const relief = new Uint8Array(size * size * 4);
  const masonry = kind === 'quay';
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size;
    const v = y / size;
    const base = cloud(u, v);
    const grit = aggregate(u, v);
    const erosion = runoff(u + .011 * base, v);
    const drip = THREE.MathUtils.smoothstep(erosion * .64 + base * .36, .55, .88);
    const pore = THREE.MathUtils.smoothstep(grit, .69, .99) * (.47 + .53 * (1 - base));
    const salt = masonry ? THREE.MathUtils.smoothstep(v + .23 * (base - .54), .53, .90) : 0;
    const flake = THREE.MathUtils.smoothstep(scratches(u, v), .73, .96) * (.30 + .70 * drip);
    const layers = kind === 'timber' ? 19 * Math.sin(v * 151 + base * 3.15) * (.26 + erosion * .39) : 0;
    const shade = 238 + (base - .5) * 24 + (grit - .5) * 8 - (masonry ? 47 : 30) * drip - 32 * pore - 29 * salt + layers;
    const rust = (masonry ? .60 : .84) * drip * (.32 + v * .40);
    const i = (y * size + x) * 4;
    pixels.data[i] = shade + 25 * rust + 16 * flake;
    pixels.data[i + 1] = shade - 14 * rust + 11 * salt + 7 * flake;
    pixels.data[i + 2] = shade - 22 * rust - 10 * salt + 4 * flake;
    pixels.data[i + 3] = 255;
    // Linear data: pores and grain are relief; moisture, salt and worn paint
    // change the reflected highlight independently of the diffuse colour.
    relief[i] = THREE.MathUtils.clamp(143 + (grit - .5) * 35 - pore * 60 + layers * .6 - flake * 14, 0, 255);
    relief[i + 1] = THREE.MathUtils.clamp((kind === 'steel' ? 106 : kind === 'paint' ? 139 : 218)
      + drip * 69 + pore * 25 + flake * 31 - salt * 34, 0, 255);
    relief[i + 2] = 255; relief[i + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  const map = texture(canvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;
  const data = new THREE.DataTexture(relief, size, size);
  data.wrapS = data.wrapT = THREE.RepeatWrapping; data.colorSpace = THREE.NoColorSpace;
  data.minFilter = THREE.LinearMipmapLinearFilter; data.magFilter = THREE.LinearFilter;
  data.generateMipmaps = true; data.anisotropy = 8; data.needsUpdate = true;
  return { map, bumpMap: data, roughnessMap: data };
}

export function detailDiqueModels(garage?: THREE.Object3D, quay?: THREE.Object3D,
  pier?: THREE.Object3D, buildings?: THREE.Object3D) {
  const maps = new Map<Surface, ReturnType<typeof finishMap>>();
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const matrix = new THREE.Matrix4();
  const normalMatrix = new THREE.Matrix3();
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const tone = new THREE.Color();
  const mineral = new THREE.Color(0x989588);
  const metalFlake = new THREE.Color(0x9c8270);

  function finish(root: THREE.Object3D | undefined, surface: Surface, phase: number) {
    if (!root) return;
    root.updateWorldMatrix(true, true);
    const inverse = root.matrixWorld.clone().invert();
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshStandardMaterial)) return;
      const material = object.material;
      if (material.emissive.getHex() !== 0 || material.transparent || material.map || /vidrio|cristal/i.test(material.name)) return;
      const type: Surface = material.metalness >= .30 && surface !== 'quay' ? 'steel' : surface;
      const key = material.uuid + ':' + type;
      let weathered = materials.get(key);
      if (!weathered) {
        let map = maps.get(type);
        if (!map) {
          map = finishMap(type);
          maps.set(type, map);
        }
        weathered = material.clone();
        weathered.name = material.name + ' · patinado';
        Object.assign(weathered, map);
        weathered.bumpScale = type === 'quay' ? .036 : type === 'timber' ? .018 : .009;
        weathered.roughness = 1;
        materials.set(key, weathered);
      }
      const geometry = object.geometry;
      const position = geometry.getAttribute('position');
      const normal = geometry.getAttribute('normal');
      const original = geometry.getAttribute('color');
      const uv = new Float32Array(position.count * 2);
      const color = original ? new Float32Array(position.count * 3) : undefined;
      matrix.multiplyMatrices(inverse, object.matrixWorld);
      normalMatrix.getNormalMatrix(matrix);
      for (let i = 0; i < position.count; i++) {
        p.fromBufferAttribute(position, i).applyMatrix4(matrix);
        n.fromBufferAttribute(normal, i).applyNormalMatrix(normalMatrix);
        const horizontal = Math.abs(n.y) > Math.max(Math.abs(n.x), Math.abs(n.z));
        const along = Math.abs(n.x) > Math.abs(n.z) ? p.z : p.x;
        uv[i * 2] = (horizontal ? p.x : along) / (type === 'quay' ? 4.15 : 6.1) + phase;
        uv[i * 2 + 1] = horizontal ? p.z * (type === 'timber' ? .32 : .185) + phase * .29
          : type === 'quay' ? THREE.MathUtils.clamp((p.y + 1.405) / 1.92, .018, .995) : p.y * .213 + .029;
        if (!color || !original) continue;
        const ground = surface === 'quay' ? 1 - THREE.MathUtils.smoothstep(p.y, -1.10, -.23)
          : 1 - THREE.MathUtils.smoothstep(p.y, .15, 1.12);
        tone.fromBufferAttribute(original, i).lerp(type === 'steel' ? metalFlake : mineral,
          (horizontal && p.y > 2.2 ? .057 : 0) + (type === 'quay' ? .11 : .062) * ground);
        tone.multiplyScalar(1 - (type === 'quay' ? .19 : .13) * ground).toArray(color, i * 3);
      }
      geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      if (color) geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
      object.material = weathered;
    });
  }

  finish(garage, 'paint', .18);
  finish(quay, 'quay', .29);
  finish(pier, 'timber', .69);
  Object.values(diqueBuildings).forEach((building, i) => finish(buildings?.getObjectByName(building.model), 'paint', i * .197));
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitTube = new THREE.CylinderGeometry(1, 1, 1, 10);
const unitRing = new THREE.TorusGeometry(1, .115, 5, 16);
const up = new THREE.Vector3(0, 1, 0);
const sideways = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
const horizontal = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
const point = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function detailBatch(parent: THREE.Object3D, material: THREE.MeshStandardMaterial, name: string) {
  const pieces: THREE.BufferGeometry[] = [];
  const matrix = new THREE.Matrix4();
  const tint = new THREE.Color();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const direction = new THREE.Vector3();
  const identity = new THREE.Quaternion();
  function piece(template: THREE.BufferGeometry, x: number, y: number, z: number,
    sx: number, sy: number, sz: number, tone: Tint, orientation = identity) {
    const copy = template.clone();
    copy.deleteAttribute('uv');
    copy.clearGroups();
    copy.applyMatrix4(matrix.compose(position.set(x, y, z), orientation, scale.set(sx, sy, sz)));
    const colors = new Float32Array(copy.getAttribute('position').count * 3);
    const vertices = copy.getAttribute('position');
    const normals = copy.getAttribute('normal');
    const uv = new Float32Array(vertices.count * 2);
    for (let i = 0; i < vertices.count; i++) {
      const x = Math.abs(normals.getX(i)), y = Math.abs(normals.getY(i)), z = Math.abs(normals.getZ(i));
      uv[i * 2] = (x > z ? vertices.getZ(i) : vertices.getX(i)) * .37;
      uv[i * 2 + 1] = (y > Math.max(x, z) ? vertices.getZ(i) : vertices.getY(i)) * .37;
    }
    copy.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    tint.set(tone);
    for (let i = 0; i < colors.length; i += 3) tint.toArray(colors, i);
    copy.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    pieces.push(copy);
  }
  return {
    box: (x: number, y: number, z: number, w: number, h: number, d: number, tone: Tint, yaw = 0) =>
      piece(unitBox, x, y, z, w, h, d, tone, rotation.setFromAxisAngle(up, yaw)),
    disk: (x: number, y: number, z: number, radius: number, width: number, tone: Tint, orientation = sideways) =>
      piece(unitTube, x, y, z, radius, width, radius, tone, orientation),
    ring: (x: number, y: number, z: number, radius: number, tone: Tint, flat = false) =>
      piece(unitRing, x, y, z, radius, radius, radius, tone, flat ? horizontal : identity),
    pipe(a: THREE.Vector3, b: THREE.Vector3, radius: number, tone: Tint) {
      direction.subVectors(b, a);
      const length = direction.length();
      rotation.setFromUnitVectors(up, direction.normalize());
      position.lerpVectors(a, b, .5);
      piece(unitTube, position.x, position.y, position.z, radius, length, radius, tone, rotation);
    },
    finish() {
      const mesh = mergeGeometries(pieces);
      for (const part of pieces) part.dispose();
      if (mesh) diquePart(parent, mesh, material, true, name);
    },
  };
}

type Details = ReturnType<typeof detailBatch>;

function spool(d: Details, x: number, y: number, z: number, size: number, painted = false) {
  d.disk(x, y, z, size * .74, size * 1.27, painted ? blue : rubber);
  for (const side of [-1, 1]) {
    const face = side * size * .68;
    d.disk(x + face, y, z, size, size * .13, painted ? oxide : wood);
    d.disk(x + face * 1.13, y, z, size * .23, size * .09, iron);
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      d.disk(x + face * 1.10, y + Math.sin(angle) * size * .62, z + Math.cos(angle) * size * .62,
        size * .077, size * .045, zinc);
    }
  }
  for (let i = -2; i <= 2; i++) d.disk(x + size * i * .21, y, z, size * .758, size * .045, painted ? zinc : steel);
}

function grate(d: Details, x: number, y: number, z: number, width: number, depth: number, count: number) {
  d.box(x, y, z, width, .024, depth, rubber);
  for (let i = 0; i < count; i++) {
    d.box(x + width * ((i + .5) / count - .5), y + .016, z, .039, .017, depth - .026, i % 3 ? steel : zinc);
  }
  for (const side of [-1, 1]) d.box(x, y + .015, z + side * (depth / 2 - .033), width, .021, .043, steel);
}

function garageDetails(parent: THREE.Group, material: THREE.MeshStandardMaterial) {
  for (const [i, lower] of [3.51, 3.28, 3.46, 3.34].entries()) {
    const bay = parent.getObjectByName('Box ' + (i + 1));
    if (!bay) continue;
    const d = detailBatch(bay, material, 'Umbral y herramientas de Box ' + (i + 1));
    for (const side of [-1, 1]) {
      const x = side * 5.11;
      d.box(x, 2.26, 2.965, .156, 2.658, .209, iron);
      d.box(x - side * .063, 2.29, 3.067, .048, 2.603, .051, zinc);
      for (const y of [1.68, 2.37, 3.36]) d.box(x, y, 3.086, .053, .053, .033, steel, .19);
    }
    d.box(0, 3.577, 2.839, 10.03, .133, .195, iron);
    for (let y = lower; y < 3.72; y += .106) d.box(0, y, 2.795, 10.1, .101, .061, steel);
    d.box(0, lower - .043, 2.861, 10.08, .061, .173, blue);
    grate(d, 0, .921, 3.116, 9.81, .262, 30);
    const x = i % 2 ? -2.75 : .94;
    const z = 1.37;
    d.box(x, 1.028, z, 1.14, .196, .48, i % 2 ? blue : oxide, .08);
    for (const shift of [-.36, .38]) d.disk(x + shift, 1.016, z, .101, .56, rubber);
    d.box(x + .19, 1.18, z, .39, .102, .34, zinc);
    d.pipe(point(x - .43, 1.105, z), point(x - .82, 1.847, z + .10), .036, steel);
    d.pipe(point(x - .90, 1.853, z + .10), point(x - .76, 1.853, z + .10), .058, rubber);
    d.box(-4.71, 2.384, -2.72, .17, .26, .15, steel);
    d.ring(-4.71, 2.383, -2.62, .268, oxide);
    d.ring(-4.71, 2.383, -2.593, .242, rubber);
    d.box(-4.71, 2.384, -2.57, .113, .098, .043, zinc);
    d.pipe(point(-4.50, 2.255, -2.584), point(-4.42, 1.49, -2.568), .025, rubber);
    d.finish();
  }
}

function quayDetails(parent: THREE.Group, course: Course, material: THREE.MeshStandardMaterial) {
  const mouth = diquePlanPoint(87.5, 0).x;
  const z = DIQUE_FRONT;
  for (const [index, x] of [-20.87, mouth, 75.8, 139.2].entries()) {
    if (!diqueRoadClear(course, x, z + .58, .32)) continue;
    const d = detailBatch(parent, material, index === 1 ? 'Marco de descarga y reja del muelle' : 'Escalera de servicio del muelle');
    if (index === 1) {
      const level = DIQUE_WATER + .49;
      d.box(x, level + .43, z + .153, 3.77, .244, .55, concrete);
      d.box(x, level + .29, z + .351, 3.54, .099, .089, zinc);
      for (const side of [-1, 1]) {
        d.box(x + 1.651 * side, level, z + .211, .32, .88, .41, concrete);
        d.box(x + 1.619 * side, level - .087, z + .432, .176, .64, .060, oxide);
      }
      for (let i = -4; i <= 4; i++) d.box(x + i * .293, level - .18, z + .172, .048, .57, .068, iron);
      d.box(x, level + .104, z + .213, 2.55, .049, .078, steel);
      d.box(x, level - .335, z + .213, 2.56, .043, .073, oxide);
    } else {
      for (const side of [-1, 1]) {
        const offset = x + .29 * side;
        d.pipe(point(offset, DIQUE_WATER - .08, z + .61), point(offset, DIQUE_GROUND + .19, z + .61), .043, zinc);
        d.pipe(point(offset, DIQUE_GROUND + .19, z + .61), point(offset, DIQUE_GROUND + .32, z + .36), .042, ochre);
        for (const y of [DIQUE_WATER + .28, DIQUE_GROUND - .17]) d.box(offset, y, z + .49, .144, .173, .305, steel);
      }
      for (let k = 0; k < 6; k++) {
        const y = DIQUE_WATER + .065 + k * .236;
        d.pipe(point(x - .30, y, z + .63), point(x + .30, y, z + .63), .037, k === 5 ? ochre : steel);
      }
      d.ring(x - .77, DIQUE_GROUND + .132, z - .19, .28, 0xa38a5d, true);
      d.ring(x - .77, DIQUE_GROUND + .108, z - .185, .235, wood, true);
    }
    d.finish();
  }
}

function serviceGround(parent: THREE.Group, course: Course, material: THREE.MeshStandardMaterial) {
  for (const [name, x, z, width, depth] of [
    ['Almacén de repuestos del pórtico oeste', 51.25, 30.5, 13.9, 10.3],
    ['Patio de bobinas y herramientas de mantenimiento', 146.8, 88.7, 17.3, 11.8],
  ] as const) {
    const at = diquePlanPoint(x, z);
    const fractions = [-.50, -.25, 0, .25, .50];
    if (!fractions.every(i => fractions.every(j => diqueRoadClear(course, at.x + i * width, at.z + j * depth, .49)))) continue;
    const yard = new THREE.Group();
    yard.name = name;
    yard.position.set(at.x, DIQUE_GROUND, at.z);
    parent.add(yard);
    const d = detailBatch(yard, material, name);
    const half = width / 2;
    const reach = depth / 2;
    for (const x of [-width / 3, 0, width / 3]) for (const side of [-1, 1]) {
      d.box(x, .046, side * reach / 2, width / 3 - .042, .089, reach - .036,
        x === 0 ? 0x837d6e : side < 0 ? 0x787567 : 0x8b8271);
    }
    d.box(0, .109, reach - 1.43, width - .32, .031, .081, canvas);
    for (let dash = 0; dash < 11; dash++) d.box(-half + .65 + dash * .30, .103, reach - .71, .054, .023, 1.04, ochre, .57);
    grate(d, half - 1.06, .111, reach - .72, 1.57, .51, 10);
    for (const x of [-half + .26, half - .26]) {
      for (const z of [-reach + .32, -.11, reach - 1.54]) {
        d.box(x, .165, z, .37, .122, .39, concrete);
        d.box(x, .564, z, .108, .83, .108, ochre);
      }
      for (const y of [.506, .85]) d.pipe(point(x, y, -reach + .28), point(x, y, reach - 1.52), .034, ochre);
    }
    if (x < 100) {
      for (const x of [-4.92, 2.14]) {
        for (const z of [-2.98, -.74]) d.box(x, .311, z, .30, .462, .285, steel);
        d.box(x, .558, -1.86, .19, .148, 2.69, zinc);
      }
      for (const [i, z] of [-2.76, -2.16, -1.55, -.97].entries()) {
        d.pipe(point(-5.76, .83, z), point(i === 1 ? 3.47 : 2.85, .83, z), .224, i % 3 ? steel : oxide);
        d.pipe(point(-5.83, .83, z), point(-5.70, .83, z), .272, zinc);
        d.pipe(point(-5.87, .83, z), point(-5.827, .83, z), .172, iron);
      }
      spool(d, 4.84, .881, -.78, .76, true);
    } else {
      spool(d, -4.45, 1.074, -2.85, .984);
      spool(d, -1.52, .831, -2.94, .741, true);
      spool(d, -3.14, .631, -.47, .541);
      d.box(3.96, .258, -2.28, 4.20, .273, 1.87, steel);
      d.box(3.75, 1.033, -2.28, 2.82, 1.225, 1.58, 0x8d835c);
      d.box(3.75, 1.689, -2.28, 2.93, .126, 1.648, 0x9c8c60);
      d.box(5.59, .558, -2.28, .83, .59, 1.66, iron);
      for (let i = 0; i < 8; i++) d.box(2.72 + i * .265, 1.186, -1.466, .113, .271, .045, steel);
      d.box(3.77, .819, -1.462, 1.73, .091, .039, ochre);
      for (const side of [-1, 1]) {
        d.disk(3.96, .421, -2.28 + side * .99, .326, .211, rubber, horizontal);
        d.disk(3.96, .421, -2.28 + side * 1.11, .13, .025, zinc, horizontal);
      }
      d.pipe(point(5.70, .373, -2.28), point(6.87, .402, -2.28), .079, oxide);
      d.pipe(point(6.38, .385, -2.28), point(6.38, .15, -2.28), .042, zinc);
      d.box(6.38, .13, -2.28, .27, .075, .22, iron);
    }
    d.finish();
  }
}

export function buildDiqueDetails(dock: THREE.Group, props: THREE.Group, course: Course, authoredGarage: boolean) {
  const finish = finishMap('steel');
  const enamel = new THREE.MeshStandardMaterial({ ...finish, bumpScale: .018,
    vertexColors: true, roughness: 1, metalness: .24 });
  enamel.name = 'Herrajes, umbrales y equipo portuario';
  if (authoredGarage) garageDetails(props, enamel);
  quayDetails(dock, course, enamel);
  serviceGround(props, course, enamel);
}
