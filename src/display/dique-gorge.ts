import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { diquePlanPoint, type Course } from '../shared/courses';
import { box, random, standard } from './materials';
import { DIQUE_GROUND, diqueBeam, diquePart, diquePlane, diqueRoadClear } from './dique-geometry';

const waterLevel = -4.37;
const outline = [
  [67.8, 58.2], [72.6, 57.9], [77.1, 59.4], [80.2, 63.3], [86.6, 69.8],
  [89.8, 79.3], [93.5, 88.5], [94.3, 96.2], [91.8, 105.1], [92.9, 114.6],
  [95.0, 124.1], [93.7, 133.0], [89.4, 139.2], [83.3, 140.0], [78.0, 135.1],
  [75.6, 126.2], [76.8, 116.0], [75.2, 105.5], [74.1, 95.8], [75.1, 86.9],
  [73.0, 77.5], [69.9, 69.6], [67.0, 62.5],
] as const;

export function diqueGorgeOutline() {
  const curve = new THREE.SplineCurve([...outline, outline[0]].map(([x, z]) => {
    const point = diquePlanPoint(x, z);
    return new THREE.Vector2(point.x, point.z);
  }));
  return curve.getSpacedPoints(96).slice(0, -1);
}

function gorgeWalls(parent: THREE.Group, boundary: readonly THREE.Vector2[], course: Course) {
  const rng = random(2421);
  const rockStrata = [
    [0, DIQUE_GROUND + 0.003, 0x827b66], [.30, -1.34, 0x686b58], [.52, -2.10, 0x5e635e],
    [1.14, -2.19, 0x857a65], [1.36, -3.11, 0x534f44], [1.70, -3.23, 0x676654],
    [1.94, waterLevel - .50, 0x3c4542],
  ] as const;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const chunks: { position: THREE.Vector3; width: number; height: number; tint: number }[] = [];
  const inner: THREE.Vector2[] = [];
  for (const [index, point] of boundary.entries()) {
    const prior = boundary[(index + boundary.length - 1) % boundary.length];
    const next = boundary[(index + 1) % boundary.length];
    const normal = new THREE.Vector2(prior.y - next.y, next.x - prior.x).normalize();
    const slope = 1 + .27 * Math.sin(index * 0.64) + .29 * (rng() - .5);
    const fracture = .67 + rng() * .46;
    for (const [layer, [inset, height, shade]] of rockStrata.entries()) {
      const ledge = point.clone().addScaledVector(normal, inset * slope);
      const y = height + (layer ? (rng() - .5) * .23 : 0);
      positions.push(ledge.x, y, ledge.y);
      new THREE.Color(shade).multiplyScalar(fracture * (.83 + rng() * .26)).toArray(colors, colors.length);
      if (layer === rockStrata.length - 1) {
        inner.push(ledge);
        continue;
      }
      const a = index * rockStrata.length + layer;
      const b = ((index + 1) % boundary.length) * rockStrata.length + layer;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
      if (layer === 0 || (index + layer) % 3 !== 0) continue;
      const width = .35 + rng() ** 1.2 * .79;
      if (layer === 1 && !diqueRoadClear(course, ledge.x, ledge.y, width)) continue;
      chunks.push({ position: new THREE.Vector3(ledge.x, y + .068, ledge.y),
        width, height: .16 + rng() * .54, tint: shade });
    }
  }
  const walls = new THREE.BufferGeometry();
  walls.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  walls.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  walls.setIndex(indices);
  walls.computeVertexNormals();
  diquePart(parent, walls, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .91 }),
    true, 'Estratos de roca de la garganta');

  const rubble = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), standard(0xffffff, .91), chunks.length);
  const transform = new THREE.Object3D();
  const color = new THREE.Color();
  chunks.forEach(({ position, width, height, tint }, i) => {
    transform.position.copy(position);
    transform.rotation.set(.39 * rng(), rng() * 6.28, .49 * (rng() - .5));
    transform.scale.set(width, height, width * (.56 + .56 * rng()));
    transform.updateMatrix();
    rubble.setMatrixAt(i, transform.matrix);
    rubble.setColorAt(i, color.setHex(tint).multiplyScalar(.76 + rng() * .95));
  });
  rubble.receiveShadow = true;
  rubble.computeBoundingSphere();
  rubble.name = 'Desprendimientos al pie del tallado';
  parent.add(rubble);
  return inner;
}

function currentMaterial(time: { value: number }, night: { value: number }) {
  return new THREE.ShaderMaterial({
    uniforms: { time, night }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `
      varying vec2 flow;
      varying float strength;
      attribute float foam;
      void main() {
        flow = uv;
        strength = foam;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float time;
      uniform float night;
      varying vec2 flow;
      varying float strength;
      void main() {
        float t = time;
        float eddies = sin(flow.x * 18.2 + 3.7 * flow.y - 2.5 * t)
          + 0.45 * sin(flow.x * 49.0 - 5.7 * flow.y + 1.6 * t);
        float furrows = sin(flow.x * 96.0 + 2.4 * eddies + 4.3 * flow.y - 2.9 * t);
        float swells = sin(flow.y * 9.0 - 9.2 * t + 1.45 * eddies);
        float froth = smoothstep(-0.26, 0.96, furrows * 0.55 + swells * 0.45 + eddies * 0.23);
        float edge = smoothstep(0.0, 0.16, flow.x) * (1.0 - smoothstep(0.84, 1.0, flow.x));
        float alpha = strength * edge * (0.42 + 0.54 * froth);
        vec3 water = vec3(0.065, 0.26, 0.30);
        vec3 foamColor = mix(vec3(0.71, 0.87, 0.91), vec3(0.54, 0.73, 0.78), night);
        gl_FragColor = vec4(mix(water, foamColor, 0.28 + 0.72 * froth), alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

function waterRibbon(rows: readonly (readonly [number, number, number, number, number])[]) {
  const g = new THREE.BufferGeometry();
  const positions: number[] = [];
  const strengths: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  const subdivisions = 12;
  rows.forEach(([center, y, z, halfWidth, opacity], row) => {
    for (let i = 0; i < subdivisions; i++) {
      const u = i / (subdivisions - 1);
      const ripple = Math.sin(u * 31.1 + row * 2.4);
      positions.push(center + (u * 2 - 1) * halfWidth, y + ripple * .026, z + ripple * .14);
      strengths.push(opacity);
      uv.push(u, z * .55);
      if (row >= rows.length - 1 || i === subdivisions - 1) continue;
      const a = row * subdivisions + i;
      const b = a + subdivisions;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  });
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('foam', new THREE.Float32BufferAttribute(strengths, 1));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function archShape() {
  const face = new THREE.Shape();
  face.moveTo(-4.12, -4.64);
  face.lineTo(-4.12, -.54);
  face.lineTo(-3.25, -.36);
  face.lineTo(3.25, -.36);
  face.lineTo(4.12, -.54);
  face.lineTo(4.12, -4.64);
  face.lineTo(2.23, -4.64);
  face.lineTo(2.23, -2.28);
  face.absellipse(0, -2.28, 2.23, 1.43, 0, Math.PI, false);
  face.lineTo(-2.23, -4.64);
  face.closePath();
  return face;
}

function spillway(parent: THREE.Group, wall: THREE.MeshStandardMaterial, riverWater: THREE.Material, foam: THREE.Material) {
  const origin = diquePlanPoint(72.65, 60.55);
  const gate = new THREE.Group();
  gate.name = 'Boca arqueada del aliviadero';
  gate.position.set(origin.x, 0, origin.z);
  gate.rotation.y = .24;
  parent.add(gate);
  const stone = standard(0x686258, .88);
  const iron = standard(0x373f38, .79, .43);
  const rust = standard(0x776747, .87, .19);
  const ochre = standard(0xb58442, .79, .24);
  box(gate, standard(0x172624, .92), 0, -2.45, -.14, 5.18, 4.10, .46, false);
  diquePart(gate, new THREE.ExtrudeGeometry(archShape(), { depth: .72, bevelEnabled: false, curveSegments: 8 }), wall, true);
  box(gate, stone, 0, -.29, .47, 7.19, .28, 1.10);

  for (let i = 0; i < 13; i++) {
    const angle = Math.PI * (i + .5) / 13;
    const trim = box(gate, i % 4 === 0 ? rust : stone, Math.cos(angle) * 2.31,
      -2.28 + Math.sin(angle) * 1.53, .75, .58, .38, .22);
    trim.rotation.z = Math.atan2(1.53 * Math.cos(angle), -2.31 * Math.sin(angle));
  }
  for (const side of [-1, 1]) {
    box(gate, rust, side * 2.33, -3.42, .78, .37, 2.21, .22);
    for (const [i, y] of [-1.61, -2.31, -3.12].entries()) {
      const block = box(gate, wall, side * (3.21 + i * .33), y - .66, 1.35 + i * 1.46,
        .61 + i * .09, 1.46, 1.73);
      block.rotation.y = side * .15;
      box(gate, stone, block.position.x, y + .11, block.position.z, .75, .14, 1.72).rotation.y = block.rotation.y;
    }
    box(gate, ochre, side * 3.14, -.06, .49, .09, .64, .10, false);
    box(gate, ochre, side * 1.75, -.06, .49, .09, .64, .10, false);
    box(gate, ochre, side * 2.44, .24, .49, 1.54, .074, .078, false);
  }
  box(gate, iron, 0, -2.12, 1.04, 4.27, .24, .76);
  for (const x of [-1.69, -.84, 0, .84, 1.69]) box(gate, iron, x, -1.95, .56, .056, .99, .086, false);

  // The short crest and two drops follow the concrete apron into the lower pool.
  const fall = [
    [0, -1.96, .68, 1.95, .96], [0, -1.98, 1.34, 1.95, 1], [0, -2.51, 1.83, 2.05, 1],
    [.08, -2.60, 2.45, 2.09, .96], [.12, -3.22, 2.97, 2.27, 1], [.15, -3.33, 3.43, 2.37, 1],
    [.17, waterLevel + .092, 4.28, 2.65, 1], [.16, waterLevel + .076, 5.34, 3.01, .92],
    [.07, waterLevel + .055, 6.46, 3.30, .66], [-.45, waterLevel + .049, 8.1, 3.67, .33],
    [-.92, waterLevel + .041, 10.50, 3.41, .12], [-1.34, waterLevel + .045, 13.0, 2.76, 0],
  ] as const;
  const curtain = waterRibbon(fall);
  const apron = waterRibbon(fall.slice(0, 7).map(([x, y, z, half, strength]) => [x, y - .053, z, half + .078, strength]));
  diquePart(gate, apron, riverWater, false, 'Lámina de agua en tres saltos');
  diquePart(gate, curtain, foam, false, 'Espuma de la caída y remolino');
}

function serviceWalk(parent: THREE.Group, course: Course, concrete: THREE.Material) {
  const metal = standard(0x534b37, .84, .38);
  const warning = standard(0xb88b47, .69, .27);
  const plank = standard(0x777b6b, .88, .12);
  function platform(px: number, pz: number, yaw: number, length: number, stairs: boolean) {
    const at = diquePlanPoint(px, pz);
    if (!diqueRoadClear(course, at.x, at.z, length * .5 + 1.42)) return;
    const gantry = new THREE.Group();
    gantry.position.set(at.x, DIQUE_GROUND, at.z);
    gantry.rotation.y = yaw;
    gantry.name = stairs ? 'Pasarela y escalera del canal' : 'Balcón del aliviadero';
    parent.add(gantry);
    box(gantry, concrete, 0, -.15, 0, 1.64, .38, length + .30);
    box(gantry, metal, 0, .095, 0, 1.67, .15, length);
    for (let j = .21; j < length; j += .43) {
      box(gantry, plank, 0, .181, j - length * .5, 1.54, .03, .37, false);
    }
    for (const side of [-1, 1]) {
      for (const z of [-length * .5 + .16, 0, length * .5 - .16]) {
        box(gantry, warning, side * .77, .57, z, .083, .77, .093, false);
      }
      for (const y of [.59, .94]) box(gantry, warning, side * .77, y, 0, .059, .061, length, false);
    }
    for (const z of [-length * .37, length * .37]) {
      box(gantry, concrete, 0, -1.10, z, 1.27, 2.00, .35);
      diqueBeam(gantry, metal, new THREE.Vector3(.64, -.26, z), new THREE.Vector3(-.62, -1.35, z), .13, .12);
    }
    if (!stairs) return;
    const end = length / 2;
    for (let i = 0; i < 10; i++) {
      box(gantry, i % 4 === 0 ? plank : metal, .03, .163 - i * .223, end + .265 * i, 1.28, .096, .238);
    }
    box(gantry, plank, .05, -2.03, end + 3.04, 1.45, .12, 1.20);
    for (const side of [-1, 1]) {
      const x = side * .68;
      diqueBeam(gantry, metal, new THREE.Vector3(x, .078, end - .15), new THREE.Vector3(x, -2.08, end + 2.65), .11);
      diqueBeam(gantry, warning, new THREE.Vector3(x, .94, end - .17), new THREE.Vector3(x, -1.17, end + 2.78), .067);
      box(gantry, warning, x, -1.51, end + 2.70, .081, .76, .091, false);
    }
  }
  platform(73.1, 81.4, .39, 6.0, true);
  platform(92.45, 103.0, -.29, 4.25, false);
}

export function buildDiqueGorge(parent: THREE.Group, course: Course, boundary: readonly THREE.Vector2[],
  concrete: THREE.MeshStandardMaterial, water: THREE.Material, time: { value: number }, night: { value: number }) {
  const gorge = new THREE.Group();
  gorge.name = 'Garganta del Gran Premio del Dique';
  parent.add(gorge);
  const inner = gorgeWalls(gorge, boundary, course);
  diquePart(gorge, diquePlane(boundary), standard(0x354341, .99), false, 'Fondo rocoso del canal').position.y = waterLevel - .56;
  diquePart(gorge, diquePlane(boundary), water, false, 'Cauce encajado entre terrazas').position.y = waterLevel;
  // Flow breaks gather along the wall and at the small terminal pool.
  const foam = currentMaterial(time, night);
  const shimmer = inner.filter((_, i) => i % 4 === 0);
  const eddies: THREE.BufferGeometry[] = [];
  for (const [i, point] of shimmer.entries()) {
    if (i < 4 || i % 3 !== 0) continue;
    eddies.push(waterRibbon([
      [point.x + .32, waterLevel + .017, point.y - 1.72, .62, 0],
      [point.x + .21, waterLevel + .021, point.y - .34, .94, .45],
      [point.x + .14, waterLevel + .019, point.y + 1.23, .58, .28],
      [point.x, waterLevel + .022, point.y + 2.38, .37, 0],
    ]));
  }
  const surfaceFoam = mergeGeometries(eddies);
  if (surfaceFoam) diquePart(gorge, surfaceFoam, foam, false, 'Corriente a lo largo del canal');
  for (const geometry of eddies) geometry.dispose();
  const cutoff = diquePlanPoint(86.0, 136.2);
  const drain = box(gorge, concrete, cutoff.x, waterLevel + .73, cutoff.z, 4.92, 1.55, .49);
  drain.rotation.y = -.09;
  box(gorge, standard(0x282f2c, .94), cutoff.x, waterLevel + .46, cutoff.z - .26, 3.52, .82, .062, false);
  spillway(gorge, concrete, water, foam);
  serviceWalk(gorge, course, concrete);
}
