import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { diquePlanPoint, type Course } from '../shared/courses';
import { box, noiseField, random, standard } from './materials';
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

function stoneGrain() {
  const size = 128;
  const rng = random(1413);
  const mottling = noiseField(11, 13, rng);
  const flecks = noiseField(67, 69, rng);
  const seam = noiseField(9, 23, rng);
  const data = new Uint8Array(size ** 2 * 4);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const mineral = Math.abs(mottling(u * 2, v + seam(u, v) * .13) - .48);
      const pore = flecks(u, v) < .19 ? 21 : 0;
      const streak = 9 * Math.sin((v + seam(u, v) * .037) * Math.PI * 18);
      const value = 189 + 41 * mottling(u, v) + 22 * flecks(u, v) - pore - 31 * mineral + streak;
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = Math.min(value, 255);
      data[i + 3] = 255;
    }
  }
  const map = new THREE.DataTexture(data, size, size);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.anisotropy = 4;
  map.needsUpdate = true;
  return map;
}

function bankGrass(parent: THREE.Group, clumps: readonly { position: THREE.Vector3; height: number; tint: number }[]) {
  if (!clumps.length) return;
  const blades: number[] = [];
  const faces: number[] = [];
  for (let i = 0; i < 9; i++) {
    const yaw = i * 2.39996;
    const spread = .16 + (i % 3) * .12;
    const height = .52 + (i % 4) * .16;
    const width = .026 + (i % 2) * .014;
    const dx = Math.cos(yaw);
    const dz = Math.sin(yaw);
    const a = blades.length / 3;
    blades.push(dx * .15 - dz * width, -.04, dz * .15 + dx * width,
      dx * .15 + dz * width, -.04, dz * .15 - dx * width,
      dx * spread * .78 - dz * width * .68, height * .63, dz * spread * .78 + dx * width * .68,
      dx * spread * .78 + dz * width * .68, height * .63, dz * spread * .78 - dx * width * .68,
      dx * spread * 1.8, height, dz * spread * 1.8);
    faces.push(a, a + 1, a + 2, a + 1, a + 3, a + 2, a + 2, a + 3, a + 4);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(blades, 3));
  geometry.setIndex(faces);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .94, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geometry, material, clumps.length);
  const transform = new THREE.Object3D();
  const color = new THREE.Color();
  const rng = random(653);
  for (const [i, { position, height, tint }] of clumps.entries()) {
    transform.position.copy(position);
    transform.rotation.set((rng() - .5) * .42, rng() * Math.PI * 2, (rng() - .5) * .3);
    transform.scale.set(.47 + height * .35, height, .47 + height * .35);
    transform.updateMatrix();
    mesh.setMatrixAt(i, transform.matrix);
    mesh.setColorAt(i, color.setHex(tint).multiplyScalar(.72 + rng() * .42));
  }
  mesh.name = 'Juncos y matas entre las grietas húmedas';
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  parent.add(mesh);
}

function gorgeWalls(parent: THREE.Group, boundary: readonly THREE.Vector2[], course: Course) {
  const rng = random(2421);
  const rockStrata = [
    [0, DIQUE_GROUND + 0.003, 0x817764], [.30, -1.34, 0x646657], [.52, -2.10, 0x656c70],
    [1.14, -2.19, 0x8d7d66], [1.36, -3.11, 0x4c5453], [1.70, -3.23, 0x666756],
    [1.83, waterLevel + .37, 0x4a5142], [1.89, waterLevel + .055, 0x363e31],
    [1.94, waterLevel - .50, 0x2b3936],
  ] as const;
  const positions: number[] = [];
  const colors: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  const chunks: { position: THREE.Vector3; width: number; height: number; tint: number }[] = [];
  const clumps: { position: THREE.Vector3; height: number; tint: number }[] = [];
  const bank: { point: THREE.Vector2; inward: THREE.Vector2 }[] = [];
  const pigment = new THREE.Color();
  const algae = new THREE.Color(0x526039);
  const moist = new THREE.Color(0x333c38);
  for (const [index, point] of boundary.entries()) {
    const prior = boundary[(index + boundary.length - 1) % boundary.length];
    const next = boundary[(index + 1) % boundary.length];
    const normal = new THREE.Vector2(prior.y - next.y, next.x - prior.x).normalize();
    const slope = 1 + .27 * Math.sin(index * 0.64) + .29 * (rng() - .5);
    const fracture = .77 + rng() * .39;
    const patch = Math.max(0, .48 + .46 * Math.sin(index * .74) + .27 * Math.sin(index * 1.8 + .55));
    let previousHeight = Infinity;
    for (const [layer, [inset, height, shade]] of rockStrata.entries()) {
      const ledge = point.clone().addScaledVector(normal, inset * slope);
      const heightVariance = layer < 6 ? .29 : .09;
      const y = Math.min(previousHeight - .026, height + (layer ? (rng() - .5) * heightVariance : 0));
      previousHeight = y;
      positions.push(ledge.x, y, ledge.y);
      uv.push((ledge.x * .74 + ledge.y) * .37, y * .72);
      pigment.setHex(shade);
      if (layer === 6 || layer === 7) pigment.lerp(algae, patch * (layer === 7 ? .58 : .32));
      if (layer === 4 || layer === 5) pigment.lerp(moist, patch * .24);
      pigment.multiplyScalar(fracture * (.86 + rng() * .22)).toArray(colors, colors.length);

      if (layer === 7) bank.push({ point: ledge, inward: normal });
      if ((layer === 3 || layer === 5 || layer === 6) && patch > .45 && index % 3 !== layer % 3 &&
          diqueRoadClear(course, ledge.x, ledge.y, .64)) {
        const height = layer === 6 ? .30 + rng() * .4 : .34 + rng() * .51;
        for (let tuft = 0; tuft < (patch > .78 ? 2 : 1); tuft++) {
          const inset = .026 + tuft * .04;
          const spread = tuft * .16;
          clumps.push({ position: new THREE.Vector3(ledge.x - normal.x * inset + normal.y * spread, y - .054,
            ledge.y - normal.y * inset - normal.x * spread), height: height * (1 - tuft * .29),
            tint: tuft ? 0x626e3d : (layer === 6 ? 0x50663a : 0x777b46) });
        }
      }
      if (layer === rockStrata.length - 1) {
        continue;
      }
      const a = index * rockStrata.length + layer;
      const b = ((index + 1) % boundary.length) * rockStrata.length + layer;
      // The front faces look into the cut and up onto each ledge.
      indices.push(a, a + 1, b, b, a + 1, b + 1);
      if (layer === 0 || layer === 6 || (index + layer) % 4 !== 0) continue;
      const width = .25 + rng() ** 1.55 * .91;
      const exposed = .15 + rng() * .47;
      const buried = Math.min(.24, width * .32);
      const x = ledge.x - normal.x * buried;
      const z = ledge.y - normal.y * buried;
      if (layer === 1 && !diqueRoadClear(course, x, z, width)) continue;
      chunks.push({ position: new THREE.Vector3(x, y - exposed * .25, z),
        width, height: exposed, tint: pigment.getHex() });
    }
  }
  const walls = new THREE.BufferGeometry();
  walls.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  walls.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  walls.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  walls.setIndex(indices);
  walls.computeVertexNormals();
  const map = stoneGrain();
  const strata = new THREE.MeshStandardMaterial({ map, vertexColors: true, flatShading: true, roughness: .92 });
  strata.onBeforeCompile = shader => {
    shader.vertexShader = 'varying float rockHeight;\n' + shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n rockHeight = position.y;');
    shader.fragmentShader = 'varying float rockHeight;\n' + shader.fragmentShader.replace('#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\n roughnessFactor *= mix(.65, 1., smoothstep(-4.31, -3.58, rockHeight));');
  };
  strata.customProgramCacheKey = () => 'dique-rock-waterline-v2';
  diquePart(parent, walls, strata, true, 'Estratos de pizarra y caliza con nivel húmedo');

  const rubble = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ map, roughness: .84 }), chunks.length);
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
  bankGrass(parent, clumps);
  return bank;
}

function currentMaterial(time: { value: number }, night: { value: number }) {
  return new THREE.ShaderMaterial({
    uniforms: { time, night }, transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
    vertexShader: `
      varying vec2 flow;
      varying vec3 whitewater;
      attribute vec3 hydraulics;
      void main() {
        flow = uv;
        whitewater = hydraulics;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float time;
      uniform float night;
      varying vec2 flow;
      varying vec3 whitewater;
      void main() {
        float churn = whitewater.y;
        float rush = flow.y - time * 1.86;
        float droplets = flow.y - time * 2.74;
        float meander = sin(rush * 1.66 + flow.x * 10.1) + 0.37 * sin(rush * 4.8 - flow.x * 14.0);
        float furrows = sin(flow.x * 53.0 + meander * 1.2 + rush * 2.12);
        float bubbles = sin(droplets * 7.8 + flow.x * 43.7 + sin(rush * 3.2 - flow.x * 19.0))
          * sin(droplets * 11.6 - flow.x * 27.0);
        float streaks = furrows * 0.26 + bubbles * 0.35 + meander * 0.24
          + sin(rush * 2.7 + meander * 1.6) * 0.15;
        float froth = smoothstep(0.18 - churn * 0.28, 0.74, streaks);
        float lip = abs(flow.x - 0.5) * 2.0;
        float splash = 0.0;
        if (whitewater.z > 0.015) {
          float wake = flow.y - time * 1.44 - lip * 0.42;
          float breaking = 0.54 * sin(20.5 * wake + meander * 1.8);
          float aeration = sin(26.1 * droplets + flow.x * 82.0) * sin(18.1 * rush - flow.x * 103.0);
          splash = whitewater.z * smoothstep(0.14, 0.68, breaking + aeration * 0.46);
        }
        float edge = 1.0 - smoothstep(0.56 + churn * 0.18, 1.0, lip + 0.06 * meander);
        float alpha = whitewater.x * edge * clamp(churn * 0.16 + froth * (0.52 + 0.36 * churn) + splash * 0.52, 0.0, 1.0);
        vec3 deep = mix(vec3(0.021, 0.17, 0.20), vec3(0.012, 0.094, 0.124), night);
        vec3 foamColor = mix(vec3(0.66, 0.82, 0.86), vec3(0.43, 0.63, 0.71), night);
        gl_FragColor = vec4(mix(deep, foamColor, smoothstep(0.10, 0.88, max(froth, splash))), alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

type RiverSection = readonly [x: number, y: number, z: number, halfWidth: number, strength: number, churn: number, impact?: number];

function waterRibbon(rows: readonly RiverSection[], followBend = false, phase = 0, rollIntoPool = false) {
  const g = new THREE.BufferGeometry();
  const positions: number[] = [];
  const hydraulics: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  const subdivisions = 12;
  let travel = phase;
  rows.forEach(([x, y, z, halfWidth, strength, churn, impact = 0], row) => {
    const prior = rows[Math.max(0, row - 1)];
    const next = rows[Math.min(rows.length - 1, row + 1)];
    if (row > 0) travel += Math.hypot(x - prior[0], y - prior[1], z - prior[2]);
    const dx = next[0] - prior[0];
    const dz = next[2] - prior[2];
    const horizontal = Math.hypot(dx, dz);
    const normalX = followBend ? dz / horizontal : 1;
    const normalZ = followBend ? -dx / horizontal : 0;
    const roll = rollIntoPool ? .12 * THREE.MathUtils.smoothstep(z, 3.95, 4.6) : 0;
    for (let i = 0; i < subdivisions; i++) {
      const u = i / (subdivisions - 1);
      const span = u * 2 - 1;
      const side = span * halfWidth;
      positions.push(x + side * normalX, y - roll * Math.abs(span) ** 3, z + side * normalZ);
      hydraulics.push(strength, churn, impact);
      uv.push(u, travel * .51);
      if (row >= rows.length - 1 || i === subdivisions - 1) continue;
      const a = row * subdivisions + i;
      const b = a + subdivisions;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  });
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('hydraulics', new THREE.Float32BufferAttribute(hydraulics, 3));
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
  box(gate, iron, -2.46, -3.03, 3.19, .23, 1.93, .13, false);
  box(gate, ochre, -2.46, -3.03, 3.271, .129, 1.76, .056, false);
  for (let h = -3.84; h <= -2.22; h += .142) {
    box(gate, iron, -2.46, h, 3.305, Math.round(h * 10) % 3 === 0 ? .119 : .069, .012, .014, false);
  }

  // The sheet spills from the sill, folds over each apron and fans out where it meets the pool.
  const sill: readonly RiverSection[] = [
    [0, -1.95, .68, 1.87, .46, .13], [0, -1.954, 1.13, 1.91, .50, .16],
    [.01, -1.974, 1.39, 1.93, .62, .28], [.035, -2.08, 1.51, 1.91, .84, .60],
    [.06, -2.24, 1.65, 1.90, .99, .84], [.085, -2.49, 1.84, 1.95, 1, .96],
    [.10, -2.54, 2.08, 1.98, 1, .81], [.08, -2.58, 2.44, 1.95, .93, .42],
    [.045, -2.70, 2.68, 1.98, 1, .60], [.095, -3.04, 2.89, 2.06, .97, .92],
    [.16, -3.24, 3.19, 2.09, 1, .83], [.20, -3.35, 3.49, 2.17, .96, .67],
    [.16, -3.66, 3.72, 2.19, .95, .89], [.13, -4.08, 4.05, 2.23, 1, .94, .22],
    [.19, waterLevel + .068, 4.49, 2.51, 1, 1, .91],
  ];
  const overlap: readonly RiverSection[] = [
    [.22, waterLevel - .019, 4.87, 2.68, 0, 0],
    [.25, waterLevel - .053, 5.33, 2.73, 0, 0],
  ];
  const pool: readonly RiverSection[] = [
    [.22, waterLevel + .049, 4.86, 2.89, .96, 1, 1], [.29, waterLevel + .039, 5.58, 3.28, .86, .91, .71],
    [.42, waterLevel + .032, 6.37, 3.16, .62, .72, .34], [.63, waterLevel + .025, 7.49, 2.96, .42, .54, .07],
    [.75, waterLevel + .021, 8.62, 2.68, .26, .49], [.92, waterLevel + .019, 10.15, 2.37, .15, .37],
    [1.36, waterLevel + .017, 12.37, 2.05, .12, .23], [1.53, waterLevel + .017, 13.05, 1.67, 0, .20],
  ];
  const sheet: RiverSection[] = sill.map(([x, y, z, half, strength, churn]) => [x, y - .037, z, half + .035, strength, churn]);
  const apron = waterRibbon([...sheet, ...overlap], false, 0, true);
  diquePart(gate, apron, riverWater, false, 'Lámina continua sobre el labio y los saltos');
  diquePart(gate, waterRibbon([...sill, ...pool]), foam, false, 'Espuma que nace en los saltos y se abre en la poza');
}

function channelFlow(parent: THREE.Group, bank: readonly { point: THREE.Vector2; inward: THREE.Vector2 }[], foam: THREE.Material) {
  const route = [
    [76.7, 72.9, 1.27, 0, .19], [78.3, 75.7, 1.56, .22, .30], [81.2, 80.0, 1.83, .26, .37],
    [82.2, 86.35, 2.02, .13, .25], [84.4, 92.3, 2.38, .16, .28], [85.1, 97.4, 2.26, .17, .32],
    [83.6, 103.2, 1.64, .09, .24], [84.4, 110.3, 1.65, .13, .29], [86.7, 115.8, 2.04, .14, .33],
    [86.1, 124.4, 2.03, .12, .22], [86.5, 130.6, 1.56, .08, .20], [86.0, 135.3, .73, 0, .2],
  ] as const;
  const geometry: THREE.BufferGeometry[] = [
    waterRibbon(route.map(([rawX, rawZ, width, amount, churn]) => {
      const { x, z } = diquePlanPoint(rawX, rawZ);
      return [x, waterLevel + .018, z, width, amount, churn];
    }), true, 13),
  ];
  for (let i = 16; i < bank.length - 6; i += 7) {
    const { point, inward } = bank[i];
    const yaw = outwardRipples(point, inward, i);
    geometry.push(waterRibbon(yaw, true, i * 1.2));
  }
  const ribbons = mergeGeometries(geometry);
  for (const strip of geometry) strip.dispose();
  if (ribbons) diquePart(parent, ribbons, foam, false, 'Corriente y estelas pegadas a la roca');
}

function outwardRipples(point: THREE.Vector2, inward: THREE.Vector2, seed: number): RiverSection[] {
  const tangent = new THREE.Vector2(-inward.y, inward.x);
  if (tangent.y < 0) tangent.negate();
  const span = .88 + (seed % 4) * .24;
  return [[-1.12, .31, .31, 0], [-.43, .47, .69, .29], [.46, .63, .63, .24], [1.24, .79, .31, 0]]
    .map(([distance, setback, width, strength]) => [
      point.x + distance * span * tangent.x + inward.x * setback, waterLevel + .021,
      point.y + distance * span * tangent.y + inward.y * setback, width, strength, strength * 1.99,
    ]);
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
  const contour = [...boundary];
  if (THREE.ShapeUtils.area(contour) < 0) contour.reverse();
  const bank = gorgeWalls(gorge, contour, course);
  diquePart(gorge, diquePlane(boundary), standard(0x354341, .99), false, 'Fondo rocoso del canal').position.y = waterLevel - .56;
  diquePart(gorge, diquePlane(boundary), water, false, 'Cauce encajado entre terrazas').position.y = waterLevel;
  const foam = currentMaterial(time, night);
  channelFlow(gorge, bank, foam);
  const cutoff = diquePlanPoint(86.0, 136.2);
  const drain = box(gorge, concrete, cutoff.x, waterLevel + .73, cutoff.z, 4.92, 1.55, .49);
  drain.rotation.y = -.09;
  box(gorge, standard(0x282f2c, .94), cutoff.x, waterLevel + .46, cutoff.z - .26, 3.52, .82, .062, false);
  spillway(gorge, concrete, water, foam);
  serviceWalk(gorge, course, concrete);
}
