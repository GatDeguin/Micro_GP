import * as THREE from 'three';
import type { Course } from '../shared/courses';
import type { TrackPoint } from '../shared/track';
import { mergeStatic } from './batches';
import { DIQUE_GROUND, diqueBeam, diquePart, diqueRoadClear, diqueSign } from './dique-geometry';
import { box, canvas2d, noiseField, random, standard, texture } from './materials';

const oldHalf = 3.10;
const edgeSegments = 22;
const pavementY = -.045;
const trenchFloor = DIQUE_GROUND + .054;

type RoadworksCourse = Course & { detour?: { from: number; closedSamples: readonly TrackPoint[] } };
type Sample = (distance: number) => TrackPoint;

const inactive = { setNight(_night: boolean) {}, update(_now: number) {} };

function oldRoad(samples: readonly TrackPoint[]) {
  const from = samples[0].s;
  const length = samples[samples.length - 1].s - from;
  const at: Sample = distance => {
    const s = from + THREE.MathUtils.clamp(distance, 0, length);
    let low = 0;
    let high = samples.length - 1;
    while (high - low > 1) {
      const middle = (high + low) >> 1;
      if (samples[middle].s > s) high = middle;
      else low = middle;
    }
    const a = samples[low];
    const b = samples[high];
    const t = (s - a.s) / (b.s - a.s);
    const mix = THREE.MathUtils.lerp;
    const dx = mix(a.dx, b.dx, t);
    const dz = mix(a.dz, b.dz, t);
    const unit = Math.hypot(dx, dz);
    return { x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), z: mix(a.z, b.z, t), s, dx: dx / unit, dz: dz / unit };
  };
  return { at, length };
}

function edge(p: TrackPoint, lateral = 0, lift = 0) {
  return new THREE.Vector3(p.x - p.dz * lateral, p.y + lift, p.z + p.dx * lateral);
}

function cleared(course: Course, at: Sample, from: number, to: number, half: number, margin = .34) {
  const rows = Math.max(1, Math.ceil((to - from) / .49));
  const columns = Math.max(1, Math.ceil(2 * half / .56));
  for (let row = 0; row <= rows; row++) {
    const p = at(THREE.MathUtils.lerp(from, to, row / rows));
    for (let i = 0; i <= columns; i++) {
      const q = edge(p, THREE.MathUtils.lerp(-half, half, i / columns));
      if (!diqueRoadClear(course, q.x, q.z, margin)) return false;
    }
  }
  return true;
}

function roughMap() {
  const size = 256;
  const { canvas, context } = canvas2d(size, size);
  const rng = random(46118);
  const marbled = noiseField(12, 15, rng);
  const gravel = noiseField(131, 149, rng);
  const pixels = context.createImageData(size, size);
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const grain = 177 + 52 * (gravel(x / size, z / size) - .5) + 31 * (marbled(x / size, z / size) - .5) + 19 * (rng() - .5);
    const i = (z * size + x) * 4;
    pixels.data[i] = grain + 2;
    pixels.data[i + 1] = grain;
    pixels.data[i + 2] = grain - 6;
    pixels.data[i + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  const map = texture(canvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  return map;
}

function geometry(positions: number[], indices: number[], uv: number[], colors?: number[]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (colors) g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function fracture(at: Sample, s: number, which: number, column: number) {
  const width = THREE.MathUtils.lerp(-oldHalf, oldHalf, column / edgeSegments);
  const chipped = .18 * Math.sin(column * 1.67 + which * 2.87) + .126 * Math.cos(column * 2.93 + which * 1.12);
  return edge(at(s + chipped), width, pavementY);
}

function oldPaving(parent: THREE.Group, at: Sample, from: number, to: number, end: 'start' | 'finish',
  asphalt: THREE.MeshStandardMaterial, aggregate: THREE.MeshStandardMaterial) {
  const positions: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  const rows = Math.ceil((to - from) / .63);
  for (let row = 0; row <= rows; row++) {
    const distance = THREE.MathUtils.lerp(from, to, row / rows);
    const p = at(distance);
    for (let i = 0; i <= edgeSegments; i++) {
      const q = end === 'finish' && row === rows ? fracture(at, to, 0, i)
        : end === 'start' && row === 0 ? fracture(at, from, 1, i)
        : edge(p, THREE.MathUtils.lerp(-oldHalf, oldHalf, i / edgeSegments), pavementY);
      positions.push(q.x, q.y, q.z);
      uv.push(q.x * .27, q.z * .27);
      if (i >= edgeSegments || row >= rows) continue;
      const a = row * (edgeSegments + 1) + i;
      const b = a + edgeSegments + 1;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  diquePart(parent, geometry(positions, indices, uv), asphalt, false, 'Asfalto antiguo con borde fracturado');

  for (const side of [-1, 1]) {
    const vertices: number[] = [];
    const indices: number[] = [];
    const uv: number[] = [];
    for (let i = 0; i <= rows; i++) {
      const s = THREE.MathUtils.lerp(from, to, i / rows);
      const p = at(s);
      const lane = side < 0 ? 0 : edgeSegments;
      const top = end === 'finish' && i === rows ? fracture(at, to, 0, lane)
        : end === 'start' && i === 0 ? fracture(at, from, 1, lane) : edge(p, side * oldHalf, pavementY);
      vertices.push(top.x, top.y, top.z, top.x, DIQUE_GROUND + .009, top.z);
      uv.push(s * .41, 0, s * .41, .48);
      if (i === rows) continue;
      const a = i * 2;
      if (side > 0) indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      else indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    diquePart(parent, geometry(vertices, indices, uv), aggregate, false);
  }
}

function trench(parent: THREE.Group, at: Sample, from: number, to: number, soil: THREE.MeshStandardMaterial,
  iron: THREE.MeshStandardMaterial) {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const uv: number[] = [];
  const rng = random(88113);
  const color = new THREE.Color();
  for (let i = 0; i <= edgeSegments; i++) {
    const rim = [fracture(at, from, 0, i), fracture(at, to, 1, i)];
    const lateral = THREE.MathUtils.lerp(-oldHalf, oldHalf, i / edgeSegments);
    const floor = [.16, .39, .61, .84].map(t => edge(at(THREE.MathUtils.lerp(from, to, t)), lateral));
    const lead = floor[0];
    const back = floor[floor.length - 1];
    const [a, b] = rim;
    const layer: [THREE.Vector3, number, number][] = [
      [a, a.y, 0x373837], [a.clone().lerp(lead, .24), -.211, 0x574e44],
      ...floor.map((point, j): [THREE.Vector3, number, number] => [point, trenchFloor, j % 2 ? 0x746251 : 0x6f5e4b]),
      [b.clone().lerp(back, .25), -.219, 0x584d43], [b, b.y, 0x383735],
    ];
    for (const [j, [point, level, tint]] of layer.entries()) {
      positions.push(point.x, level + (j >= 2 && j < layer.length - 2 ? .008 * rng() : 0), point.z);
      uv.push(point.x * .32, point.z * .34 + level * .41);
      color.setHex(tint).multiplyScalar(.73 + rng() * .38).toArray(colors, colors.length);
      if (i === edgeSegments || j + 1 === layer.length) continue;
      const p = i * layer.length + j;
      indices.push(p, p + layer.length, p + 1, p + 1, p + layer.length, p + 1 + layer.length);
    }
    if (i > 1 && i < edgeSegments - 1 && i % 4 === 0) {
      const start = a.clone().add(new THREE.Vector3(0, -.225, 0)).lerp(lead, .09);
      const end = start.clone().lerp(back, .22 + .13 * rng());
      end.y -= .18 + .17 * rng();
      diqueBeam(parent, iron, start, end, .035, .038, false);
    }
  }
  diquePart(parent, geometry(positions, indices, uv, colors), soil, false, 'Zanja de reparación a todo el ancho');
  const stone = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), standard(0xffffff, .93), 39);
  stone.name = 'Cascotes y árido del corte';
  const transform = new THREE.Object3D();
  const tints = [0x72706a, 0x8a7560, 0x595752, 0x514743, 0x948475];
  for (let i = 0; i < stone.count; i++) {
    const section = at(THREE.MathUtils.lerp(from + .39, to - .45, rng() ** .75));
    const p = edge(section, (rng() - .5) * 5.62);
    const size = .072 + rng() ** 2 * .36;
    transform.position.set(p.x, trenchFloor + size * .34, p.z);
    transform.rotation.set(rng() * 1.75, rng() * 6.283, rng() * .53);
    transform.scale.set(size * (1 + rng() * .31), size * .41, size * (.70 + rng() * .62));
    transform.updateMatrix();
    stone.setMatrixAt(i, transform.matrix);
    stone.setColorAt(i, color.setHex(tints[i % tints.length]));
  }
  stone.receiveShadow = true;
  stone.computeBoundingSphere();
  parent.add(stone);
}

function frame(parent: THREE.Group, p: TrackPoint, name: string, forward = false, lateral = 0) {
  const root = new THREE.Group();
  root.name = name;
  root.position.copy(edge(p, lateral, pavementY));
  root.rotation.y = Math.atan2(p.dx, p.dz) + (forward ? 0 : Math.PI);
  parent.add(root);
  return root;
}

function reflectors() {
  const { canvas, context } = canvas2d(768, 68);
  context.fillStyle = '#e4d6ac';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#cf6026';
  for (let i = -68; i < canvas.width; i += 126) {
    context.beginPath();
    context.moveTo(i + 58, 0);
    context.lineTo(i + 121, 0);
    context.lineTo(i + 62, 68);
    context.lineTo(i, 68);
    context.closePath();
    context.fill();
  }
  const rng = random(32841);
  for (let i = 0; i < 279; i++) {
    context.fillStyle = i % 5 ? 'rgba(117,81,52,.23)' : 'rgba(231,222,187,.36)';
    context.fillRect(rng() * 768, rng() * 68, .5 + rng() * 9.0, .5 + rng() * 2.3);
  }
  const map = texture(canvas);
  return new THREE.MeshStandardMaterial({ map, roughness: .71, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: .09 });
}

function detourFace(right: boolean) {
  const { canvas, context } = canvas2d(384, 122);
  context.fillStyle = '#d88c38';
  context.fillRect(0, 0, 384, 122);
  context.strokeStyle = '#393831';
  context.lineWidth = 4;
  context.strokeRect(6, 6, 372, 110);
  context.fillStyle = '#322f27';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '900 55px Arial, sans-serif';
  context.fillText('DESVÍO', 168, 62, 255);
  context.save();
  context.translate(313, 61);
  if (!right) context.scale(-1, 1);
  context.beginPath();
  context.moveTo(-28, -8);
  context.lineTo(6, -8);
  context.lineTo(6, -22);
  context.lineTo(30, 0);
  context.lineTo(6, 22);
  context.lineTo(6, 8);
  context.lineTo(-28, 8);
  context.closePath();
  context.fill();
  context.restore();
  return new THREE.MeshStandardMaterial({ map: texture(canvas), roughness: .67 });
}

function barrier(parent: THREE.Group, p: TrackPoint, forward: boolean, primary: boolean, right: boolean,
  concrete: THREE.Material, iron: THREE.Material, orange: THREE.Material, striping: THREE.MeshStandardMaterial,
  lamp: THREE.MeshStandardMaterial) {
  const gate = frame(parent, p, primary ? 'Barrera principal de calzada en obra' : 'Barrera posterior de la obra', forward);
  const profile = new THREE.Shape([
    new THREE.Vector2(-.38, 0), new THREE.Vector2(.38, 0), new THREE.Vector2(.38, .19),
    new THREE.Vector2(.20, .66), new THREE.Vector2(-.20, .66), new THREE.Vector2(-.38, .19),
  ]);
  const block = new THREE.ExtrudeGeometry(profile, {
    depth: 3.29, bevelEnabled: true, bevelSegments: 1, bevelSize: .035, bevelThickness: .027,
  }).rotateY(Math.PI / 2).translate(-1.645, .018, 0);
  for (const side of [-1, 1]) {
    const base = diquePart(gate, block, concrete, true);
    base.position.x = side * 1.693;
    box(gate, orange, side * 1.69, .137, .398, 3.29, .116, .041, false);
    const pole = side * 2.83;
    box(gate, iron, pole, .785, -.093, .091, 1.57, .106, false);
    box(gate, orange, pole, .956, .215, .192, .471, .082, false);
    if (!primary) continue;
    box(gate, iron, pole, 1.63, .044, .33, .136, .262, false);
    box(gate, lamp, pole, 1.755, .055, .247, .124, .197, false);
  }
  box(gate, orange, 0, .983, .284, 6.72, .352, .112);
  const reflective = diquePart(gate, new THREE.PlaneGeometry(6.62, .304), striping);
  reflective.position.set(0, .983, .343);
  if (primary) {
    box(gate, iron, 0, 1.372, .268, 4.87, .578, .085, false);
    const material = new THREE.MeshStandardMaterial({
      map: diqueSign(['CALZADA EN OBRA'], '#31342f', '#ffefce', '#d89c49'), roughness: .71,
    });
    const face = diquePart(gate, new THREE.PlaneGeometry(4.79, .515), material);
    face.position.set(0, 1.372, .318);
    const arrow = diquePart(gate, new THREE.PlaneGeometry(2.37, .615), detourFace(right));
    arrow.position.set(0, 1.971, .335);
    for (const x of [-.96, .96]) box(gate, iron, x, 1.816, .238, .072, .57, .057, false);
  } else {
    const material = new THREE.MeshStandardMaterial({
      map: diqueSign(['TRAMO CERRADO'], '#694633', '#f3dfaf'), roughness: .79,
    });
    const face = diquePart(gate, new THREE.PlaneGeometry(3.70, .430), material);
    face.position.set(0, 1.29, .320);
  }
}

function cone(parent: THREE.Group, p: TrackPoint, lateral: number, orange: THREE.Material, white: THREE.Material,
  dark: THREE.Material) {
  const q = edge(p, lateral, pavementY);
  box(parent, dark, q.x, q.y + .04, q.z, .40, .084, .39, false);
  for (const [bottom, top, lower, upper, material] of [
    [.062, .236, .168, .106, orange], [.236, .354, .108, .068, white], [.354, .507, .070, .032, orange],
  ] as const) {
    diquePart(parent, new THREE.CylinderGeometry(upper, lower, top - bottom, 8), material)
      .position.set(q.x, q.y + (top + bottom) / 2, q.z);
  }
}

function excavator(parent: THREE.Group, p: TrackPoint, orange: THREE.Material, iron: THREE.Material,
  steel: THREE.Material, glass: THREE.Material) {
  const excav = frame(parent, p, 'Miniexcavadora sobre el tramo antiguo', false, -.49);
  for (const side of [-1, 1]) {
    const x = side * .652;
    box(excav, iron, x, .247, -.26, .41, .44, 2.29);
    for (const z of [-1.18, -.62, -.04, .59]) {
      const wheel = diquePart(excav, new THREE.CylinderGeometry(.192, .192, .055, 10), steel);
      wheel.position.set(x + .219 * side, .258, z);
      wheel.rotation.z = Math.PI / 2;
    }
    for (let i = 0; i < 12; i++) {
      box(excav, iron, x, .465, -1.32 + .194 * i, .44, .035, .087, false);
    }
  }
  box(excav, iron, 0, .50, -.29, 1.36, .21, 1.37);
  box(excav, orange, .02, .808, -.56, 1.45, .54, 1.67);
  box(excav, orange, -.36, 1.404, -.42, .666, .749, .95);
  box(excav, iron, -.36, 1.825, -.416, .778, .10, 1.064);
  box(excav, glass, -.36, 1.461, .071, .526, .484, .036, false);
  box(excav, glass, -.711, 1.454, -.411, .031, .456, .745, false);
  box(excav, iron, -.709, 1.449, -.417, .034, .491, .067, false);
  for (const z of [-.943, -.845, -.744, -.643]) {
    box(excav, iron, .768, .891, z, .038, .173, .036, false);
  }
  const lower = new THREE.Vector3(.35, 1.078, -.010);
  const pivot = new THREE.Vector3(.35, 2.335, 1.31);
  const upper = new THREE.Vector3(.35, 1.582, 2.321);
  const bucket = new THREE.Vector3(.35, .643, 2.72);
  diqueBeam(excav, orange, lower, pivot, .236, .294);
  diqueBeam(excav, orange, pivot, upper, .190, .212);
  diqueBeam(excav, orange, upper, bucket, .142, .177);
  diqueBeam(excav, steel, new THREE.Vector3(.498, 1.055, .18), new THREE.Vector3(.498, 1.919, .891), .074);
  diqueBeam(excav, iron, new THREE.Vector3(.498, 1.055, .18), new THREE.Vector3(.498, 1.599, .633), .132);
  diqueBeam(excav, steel, new THREE.Vector3(.454, 2.219, 1.39), new THREE.Vector3(.454, 1.713, 2.13), .046, .057);
  box(excav, iron, .343, .521, 2.784, .675, .292, .357).rotation.x = -.30;
  box(excav, steel, .344, .408, 2.904, .695, .082, .121).rotation.x = -.30;
  for (const x of [.079, .252, .43, .61]) box(excav, steel, x, .388, 2.972, .089, .063, .131, false).rotation.x = -.22;
}

function worker(parent: THREE.Group, p: TrackPoint, lateral: number, bright: THREE.Material, steel: THREE.Material,
  navy: THREE.Material) {
  const person = frame(parent, p, 'Operario de la reparación', false, lateral);
  person.rotation.y += .65;
  const skin = standard(0xbb8764, .92);
  const head = diquePart(person, new THREE.SphereGeometry(.122, 9, 6), skin, false);
  head.position.set(0, 1.181, 0);
  const cap = diquePart(person, new THREE.SphereGeometry(.148, 10, 5, 0, Math.PI * 2, 0, Math.PI * .52), bright);
  cap.position.set(0, 1.251, .006);
  box(person, bright, 0, 1.25, .026, .31, .032, .24, false);
  box(person, navy, 0, .826, 0, .265, .445, .196, false);
  box(person, bright, 0, .877, .059, .244, .279, .136, false);
  for (const x of [-.078, .08]) {
    box(person, steel, x, .878, .132, .029, .252, .017, false);
    box(person, navy, x, .347, 0, .101, .641, .099, false);
    box(person, navy, x, .065, .041, .108, .13, .198, false);
  }
  diqueBeam(person, navy, new THREE.Vector3(-.134, .983, .01), new THREE.Vector3(-.247, .652, .106), .091, .090, false);
  diqueBeam(person, navy, new THREE.Vector3(.133, .985, .01), new THREE.Vector3(.242, .744, .165), .091, .090, false);
  box(person, steel, .182, .739, .194, .261, .086, .050, false).rotation.z = -.18;
}

export function buildDiqueRoadworks(parent: THREE.Group, course: RoadworksCourse) {
  const detour = course.detour;
  if (!detour || detour.closedSamples.length < 2) return inactive;
  const { at, length } = oldRoad(detour.closedSamples);
  const closure = [18.20, 17.42, 19.14, 16.90, 20.09, 21.04, 15.94, 21.98, 14.98].find(s =>
    s + 6 < length && cleared(course, at, s - .54, s + .54, 3.40)
    && cleared(course, at, s + 1.29, s + 5.56, oldHalf + .11));
  if (closure === undefined) return inactive;
  const root = new THREE.Group();
  root.name = 'Desvío y reparación de la calzada anterior';
  parent.add(root);
  const patchMap = roughMap();
  const concrete = standard(0x9b9481, .94);
  const rusty = standard(0x745a48, .82, .33);
  const steel = standard(0x9b9a83, .58, .51);
  const iron = standard(0x383b37, .81, .42);
  const orange = standard(0xc57d34, .72, .24);
  const cream = standard(0xe6d8ae, .81);
  const glass = standard(0x4d6b70, .48, .40);
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x62615d, map: patchMap, bumpMap: patchMap, bumpScale: .043, roughness: .94 });
  const aggregate = new THREE.MeshStandardMaterial({ color: 0x746b59, map: patchMap, roughness: .99, side: THREE.DoubleSide });
  const soil = new THREE.MeshStandardMaterial({ map: patchMap, vertexColors: true, bumpMap: patchMap, bumpScale: .11, roughness: .96, side: THREE.DoubleSide });
  const stripes = reflectors();
  const lamps = new THREE.MeshStandardMaterial({ color: 0xffbc61, roughness: .47,
    emissive: 0xf49328, emissiveIntensity: .34 });
  const cutFrom = closure + 1.66;
  const cutTo = closure + 5.14;
  oldPaving(root, at, .33, cutFrom, 'finish', asphalt, aggregate);
  oldPaving(root, at, cutTo, length - .33, 'start', asphalt, aggregate);
  trench(root, at, cutFrom, cutTo, soil, rusty);

  const main = at(closure);
  const bypass = course.sampleAt(detour.from + 14.0);
  const right = (bypass.z - main.z) * main.dx - (bypass.x - main.x) * main.dz > 0;
  barrier(root, main, false, true, right, concrete, iron, orange, stripes, lamps);
  const far = [length - 7.85, length - 8.6, length - 9.38, length - 10.02].find(s =>
    s > cutTo + 2.5 && cleared(course, at, s - .66, s + .66, 3.36));
  if (far !== undefined) barrier(root, at(far), true, false, right, concrete, iron, orange, stripes, lamps);

  const operator = at(cutTo + 2.46);
  const station = edge(operator, 1.45);
  if (diqueRoadClear(course, station.x, station.z, .62)) worker(root, operator, 1.45, orange, steel, iron);
  if (cleared(course, at, cutTo - .49, cutTo + 4.48, 1.51, .44)) {
    excavator(root, at(cutTo + 2.62), orange, iron, steel, glass);
  }
  for (const [distance, lanes] of [[closure - 4.4, [-2.66, 2.66]], [closure - 2.53, [-2.42, 2.42]], [cutTo + 1.47, [-2.80, 2.79]]] as const) {
    for (const lane of lanes) {
      const p = at(distance);
      const q = edge(p, lane);
      if (diqueRoadClear(course, q.x, q.z, .54)) cone(root, p, lane, orange, cream, iron);
    }
  }
  const marking = standard(0xc2b898, .95);
  for (let s = 5; s < length - 4; s += 1.72) {
    if (s > closure - .6 && s < cutTo + .8) continue;
    for (const side of [-1, 1]) {
      const p = at(s);
      const q = edge(p, side * 2.89, pavementY + .008);
      if (!diqueRoadClear(course, q.x, q.z, .63)) continue;
      const stripe = box(root, marking, q.x, q.y, q.z, .061, .009, 1.15, false);
      stripe.rotation.y = Math.atan2(p.dx, p.dz);
    }
  }
  mergeStatic(root, undefined, 24);
  let night = false;
  return {
    setNight(enabled: boolean) {
      night = enabled;
      stripes.emissiveIntensity = enabled ? .24 : .09;
    },
    update(now: number) {
      const wave = .5 + .5 * Math.sin(now * .00384);
      lamps.emissiveIntensity = (night ? .65 : .21) + (night ? 1.81 : .67) * wave ** 2;
    },
  };
}
