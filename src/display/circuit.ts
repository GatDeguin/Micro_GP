import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BRIDGE_DECK_DEPTH, CURB_WIDTH, PIT_LANE, ROAD_HALF, TRACK, bankAt, pitRoadHalfAt, roadHalfAt, surfaceBandsAt, wallHalfAt } from '../shared/track';
import { buildBridgeTruss } from './circuit-bridge';
import { buildTunnel } from './circuit-tunnel';
import { BENCH_SURFACE, box, canvas2d, gritMap, horizontalShadow, random, standard, texture } from './materials';
import { alongTrack, asphaltMaps, asphaltRelief, gridMap, kerbPaintMap, runoffMap } from './track-finishes';

type Sample = (typeof TRACK.samples)[number];

function edge(sample: Sample, offset: number, height: number) {
  return new THREE.Vector3(sample.x - sample.dz * offset, height, sample.z + sample.dx * offset);
}

function surfaceEdge(sample: Sample, offset: number, lift = 0) {
  return edge(sample, offset, sample.y + bankAt(sample.s) * offset + lift);
}

function trackSection(from: number, to: number) {
  return [TRACK.sampleAt(from), ...TRACK.samples.filter(p => p.s > from && p.s < to), { ...TRACK.sampleAt(to), s: to }];
}

function stripGeometry(
  samples: readonly Sample[],
  first: (sample: Sample) => THREE.Vector3,
  second: (sample: Sample) => THREE.Vector3,
  planarUV: boolean,
  closed = true,
) {
  const positions: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  const count = samples.length + Number(closed);
  const last = samples[samples.length - 1];
  const end = samples === TRACK.samples ? TRACK.length : last.s + Math.hypot(last.x - samples[0].x, last.z - samples[0].z);
  for (let i = 0; i < count; i++) {
    const sample = samples[i % samples.length];
    const distance = i === samples.length ? end : sample.s;
    const points = [first(sample), second(sample)];
    points.forEach((p, side) => {
      positions.push(p.x, p.y, p.z);
      if (planarUV) uv.push(p.x * 0.78, p.z * 0.78);
      else uv.push(distance * 1.48, side);
    });
    if (i < count - 1) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function ribbon(parent: THREE.Object3D, side: number, from: number, to: number, lift: number, material: THREE.Material) {
  const offset = (p: Sample, margin: number) => side * (roadHalfAt(p.s) + margin);
  const first = side < 0 ? to : from;
  const second = side < 0 ? from : to;
  const surface = new THREE.Mesh(stripGeometry(
    TRACK.samples,
    p => surfaceEdge(p, offset(p, first), lift),
    p => surfaceEdge(p, offset(p, second), lift),
    true,
  ), material);
  surface.receiveShadow = true;
  parent.add(surface);
}

const DECK_TOP = -0.23;

function rampDepth(p: Sample) {
  return THREE.MathUtils.lerp(-DECK_TOP, BRIDGE_DECK_DEPTH, THREE.MathUtils.smoothstep(p.y, 0.04, 0.72));
}

function surfaceWithGrit(geometry: THREE.BufferGeometry, material: THREE.Material) {
  const vertices = geometry.getAttribute('position');
  const uv = new Float32Array(vertices.count * 2);
  for (let i = 0; i < vertices.count; i++) {
    uv[i * 2] = vertices.getX(i) * 0.78;
    uv[i * 2 + 1] = vertices.getZ(i) * 0.78;
  }
  geometry.setAttribute('uv1', new THREE.BufferAttribute(uv, 2));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

function plywoodEdge(
  parent: THREE.Object3D,
  wood: THREE.Texture,
  tones: readonly number[],
  profile: (p: Sample, level: number) => THREE.Vector3,
  outline = TRACK.samples,
) {
  const bands: THREE.BufferGeometry[] = [];
  tones.forEach((tone, index) => {
    for (const [lower, upper, shade] of [[0, 0.13, 0.48], [0.13, 1, 1]]) {
      const geometry = stripGeometry(outline, p => profile(p, index + lower), p => profile(p, index + upper), false);
      const color = new THREE.Color(tone).multiplyScalar(shade);
      const vertices = geometry.getAttribute('position');
      const tint = new Float32Array(vertices.count * 3);
      for (let i = 0; i < vertices.count; i++) color.toArray(tint, i * 3);
      geometry.setAttribute('color', new THREE.BufferAttribute(tint, 3));
      bands.push(geometry);
    }
  });
  const geometry = mergeGeometries(bands)!;
  bands.forEach(band => band.dispose());
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: wood, vertexColors: true,
    roughness: 0.69, side: THREE.DoubleSide }));
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
}

function bridgeContact(parent: THREE.Object3D) {
  const { canvas, context } = canvas2d(768, 64);
  const pixels = context.createImageData(canvas.width, canvas.height);
  for (let x = 0; x < canvas.width; x++) {
    const p = TRACK.sampleAt(TRACK.length * x / (canvas.width - 1));
    const lift = THREE.MathUtils.smoothstep(p.y, 0.14, 0.92);
    const density = 206 + 18 * THREE.MathUtils.smoothstep(p.y, 0.80, 1.82);
    for (let y = 0; y < canvas.height; y++) {
      const v = 1 - y / (canvas.height - 1);
      const shade = THREE.MathUtils.smoothstep(v, 0.03, 0.29) * (1 - THREE.MathUtils.smoothstep(v, 0.70, 0.98));
      const i = (y * canvas.width + x) * 4;
      pixels.data[i] = 24;
      pixels.data[i + 1] = 13;
      pixels.data[i + 2] = 9;
      pixels.data[i + 3] = Math.round(density * lift * shade);
    }
  }
  context.putImageData(pixels, 0, 0);
  const map = alongTrack(texture(canvas));
  const shadows = new THREE.Mesh(stripGeometry(
    TRACK.samples,
    p => edge(p, -wallHalfAt(p.s, -1) - 0.52, DECK_TOP + 0.008),
    p => edge(p, wallHalfAt(p.s, 1) + 0.74, DECK_TOP + 0.008),
    false,
  ), new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false }));
  parent.add(shadows);
}

function deckOutline(): Sample[] {
  // The birch base encloses both loops. Its perimeter is independent of the route's crossing.
  const points = TRACK.samples.flatMap(p => [-1, 1].map(side => edge(p, side * (wallHalfAt(p.s, side) + 1.06), 0)))
    .sort((a, b) => a.x - b.x || a.z - b.z);
  const turn = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  const half = (candidates: THREE.Vector3[]) => {
    const chain: THREE.Vector3[] = [];
    for (const p of candidates) {
      while (chain.length > 1 && turn(chain[chain.length - 2], chain[chain.length - 1], p) <= 0) chain.pop();
      chain.push(p);
    }
    return chain.slice(0, -1);
  };
  const hull = [...half(points), ...half(points.toReversed())].reverse();
  const corners = hull.flatMap((a, i) => {
    const b = hull[(i + 1) % hull.length];
    const fraction = Math.min(0.22, 0.30 / a.distanceTo(b));
    return [a.clone().lerp(b, fraction), b.clone().lerp(a, fraction)];
  });
  const distance = [0];
  for (let i = 0; i < corners.length; i++) distance.push(distance[i] + corners[i].distanceTo(corners[(i + 1) % corners.length]));
  const length = distance[distance.length - 1];
  const count = Math.ceil(length / 0.72);
  let segment = 0;
  const outline: Sample[] = Array.from({ length: count }, (_, i) => {
    const s = i * length / count;
    while (distance[segment + 1] < s) segment++;
    const t = (s - distance[segment]) / (distance[segment + 1] - distance[segment]);
    const p = corners[segment].clone().lerp(corners[(segment + 1) % corners.length], t);
    return { x: p.x, z: p.z, y: 0, s, dx: 0, dz: 0 };
  });
  outline.forEach((p, i) => {
    const a = outline[(i + count - 1) % count];
    const b = outline[(i + 1) % count];
    const magnitude = Math.hypot(b.x - a.x, b.z - a.z);
    p.dx = (b.x - a.x) / magnitude;
    p.dz = (b.z - a.z) / magnitude;
  });
  return outline;
}

function buildDeck(parent: THREE.Object3D, wood: THREE.Texture) {
  const outline = deckOutline();
  const shape = new THREE.Shape(outline.map(p => new THREE.Vector2(p.x, -p.z)));
  shape.closePath();

  const surface = new THREE.ShapeGeometry(shape);
  const uv = surface.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 57, uv.getY(i) / 27);
  const birch = new THREE.MeshPhysicalMaterial({ color: 0xf6d5af, map: wood, roughness: 0.61,
    bumpMap: wood, bumpScale: 0.032, clearcoat: 0.25, clearcoatRoughness: 0.56 });
  const top = new THREE.Mesh(surface, birch);
  top.rotation.x = -Math.PI / 2;
  top.position.y = DECK_TOP;
  top.receiveShadow = true;
  parent.add(top);
  bridgeContact(parent);

  const strata = [0x87532d, 0xc68d51, 0x794927, 0xd5a266, 0x8f562c, 0xc9955c,
    0x865330, 0xdeab70, 0x95603a, 0xdaa063, 0x9f663e, 0xe5ad71, 0xbb7f44, 0xf4c18b];
  const layerHeight = (DECK_TOP - BENCH_SURFACE) / strata.length;
  const endGrain = wood.clone();
  endGrain.repeat.set(0.26, 0.072);
  plywoodEdge(parent, endGrain, strata, (p, level) => {
    const lowerRounding = 0.27 * Math.max(0, 1 - level / 3.6) ** 2;
    const upperRounding = 0.081 * Math.max(0, 1 - (strata.length - level) / 2.5) ** 2;
    return edge(p, 0.081 - lowerRounding - upperRounding, BENCH_SURFACE + layerHeight * level);
  }, outline);

  const shadow = canvas2d(8, 128);
  const gradient = shadow.context.createLinearGradient(0, 128, 0, 0);
  gradient.addColorStop(0, 'rgba(15,9,6,.72)');
  gradient.addColorStop(0.36, 'rgba(17,11,8,.37)');
  gradient.addColorStop(1, 'rgba(20,13,10,0)');
  shadow.context.fillStyle = gradient;
  shadow.context.fillRect(0, 0, 8, 128);
  const shadowMap = texture(shadow.canvas);
  shadowMap.wrapS = THREE.RepeatWrapping;
  const baseShadow = new THREE.Mesh(stripGeometry(
    outline,
    p => edge(p, -0.18, BENCH_SURFACE + 0.008),
    p => edge(p, 0.64, BENCH_SURFACE + 0.008),
    false,
  ), new THREE.MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false, toneMapped: false }));
  parent.add(baseShadow);

  const screw = new THREE.CylinderGeometry(0.115, 0.12, 0.026, 12);
  const hardware = standard(0x514b42, 0.42, 0.58);
  const slot = standard(0x29251f);
  let screwAt = 3.8;
  for (const p of outline) {
    if (p.s < screwAt) continue;
    screwAt += 6.7;
    const at = edge(p, -0.37, DECK_TOP + 0.006);
    const head = new THREE.Mesh(screw, hardware);
    head.position.copy(at);
    parent.add(head);
    box(parent, slot, at.x, at.y + 0.013, at.z, 0.128, 0.006, 0.025, false).rotation.y = p.s;
  }

  const timber = new THREE.MeshStandardMaterial({ color: 0xd79f65, map: wood, roughness: 0.82 });
  const shoe = standard(0x827264, 0.84, 0.11);
  const gasket = standard(0x493628, 0.90);
  const iron = standard(0x78716b, 0.54, 0.52);
  const braceGeometry = new THREE.BoxGeometry(0.135, 1, 0.18);
  const footLocations: { x: number; z: number; rotation: number }[] = [];
  const spans = [3.79, 4.12, 3.61];
  const { upperFrom, upperTo } = TRACK.crossing;
  const supportStations = [TRACK.bridge.crest - 3.05, TRACK.bridge.crest + 3.05, upperFrom - 0.44, upperTo + 0.44];
  for (let s = 0, span = 0; s < TRACK.length; s += spans[span++ % spans.length]) {
    if (Math.abs(s - TRACK.bridge.crest) > 5.1 && (s < upperFrom - 2.2 || s > upperTo + 2.2)) supportStations.push(s);
  }
  supportStations.sort((a, b) => a - b).forEach((s, span) => {
    const p = TRACK.sampleAt(s);
    const bank = bankAt(p.s);
    if (p.y + Math.abs(bank) * wallHalfAt(p.s, Math.sign(bank)) < 0.27) return;
    const timberTop = p.y - rampDepth(p) + 0.037;
    const rotation = Math.atan2(p.dx, p.dz);
    const crossingPier = s >= upperFrom - 0.45 && s <= upperTo + 0.45;
    for (const side of [-1, 1]) {
      const offset = side * (wallHalfAt(p.s, side) - (span % 2 === 0 ? 0.49 : 0.36));
      const legTop = timberTop + bank * offset;
      if (legTop < DECK_TOP + 0.11) continue;
      const at = edge(p, offset, (DECK_TOP + legTop) / 2);
      footLocations.push({ x: at.x, z: at.z, rotation });
      box(parent, crossingPier ? iron : timber, at.x, at.y, at.z, crossingPier ? 0.54 : span % 2 ? 0.44 : 0.40,
        legTop - DECK_TOP, crossingPier ? 0.55 : 0.39).rotation.y = rotation;
      box(parent, gasket, at.x, DECK_TOP + 0.028, at.z, 0.73, 0.056, 0.64, false).rotation.y = rotation;
      box(parent, shoe, at.x, DECK_TOP + 0.100, at.z, 0.66, 0.144, 0.59, false).rotation.y = rotation;
      if (p.y > 0.64) {
        box(parent, iron, at.x, legTop - 0.09, at.z, 0.49, 0.14, 0.46, false).rotation.y = rotation;
      }
      if (!crossingPier && p.y > 0.71 && (side < 0 || span % 2 === 0)) {
        const brace = new THREE.Mesh(braceGeometry, timber);
        const base = edge(p, offset, DECK_TOP + 0.12);
        const bridgeBrace = Math.abs(s - TRACK.bridge.crest) < 3.1;
        const jointSample = TRACK.sampleAt(bridgeBrace ? TRACK.bridge.crest : s + (span % 2 === 0 ? 1.37 : -1.33));
        const joint = surfaceEdge(jointSample, offset, -rampDepth(jointSample) + 0.013);
        const direction = joint.clone().sub(base);
        brace.position.copy(base).lerp(joint, 0.5);
        brace.scale.y = direction.length();
        brace.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
        brace.castShadow = brace.receiveShadow = true;
        parent.add(brace);
      }
    }
    const width = wallHalfAt(p.s, -1) + wallHalfAt(p.s, 1) - 0.09;
    const beam = box(parent, crossingPier ? iron : timber, p.x, timberTop + 0.023, p.z, width, 0.18, crossingPier ? 0.48 : 0.35);
    beam.rotation.set(0, rotation, -Math.atan(bank), 'YXZ');
  });
  const footprintGeometry = new THREE.PlaneGeometry(1.12, 0.97).rotateX(-Math.PI / 2);
  const footprints = new THREE.InstancedMesh(footprintGeometry, horizontalShadow(), footLocations.length);
  const placement = new THREE.Object3D();
  footLocations.forEach(({ x, z, rotation }, i) => {
    placement.position.set(x, DECK_TOP + 0.013, z);
    placement.rotation.y = rotation;
    placement.updateMatrix();
    footprints.setMatrixAt(i, placement.matrix);
  });
  footprints.renderOrder = 1;
  parent.add(footprints);
}

function kerbStations(side: number) {
  const samples = TRACK.samples;
  const rim = samples.map(p => surfaceEdge(p, side * (roadHalfAt(p.s) + CURB_WIDTH * 0.50)));
  const cumulative = [0];
  for (let i = 0; i < rim.length; i++) {
    cumulative.push(cumulative[i] + rim[i].distanceTo(rim[(i + 1) % rim.length]));
  }
  const distance = cumulative.at(-1)!;
  const count = Math.round(distance / 1.29) * 2;
  const stations = [0];
  let segment = 0;
  for (let i = 1; i < count; i++) {
    const at = i * distance / count;
    while (cumulative[segment + 1] < at) segment++;
    const t = (at - cumulative[segment]) / (cumulative[segment + 1] - cumulative[segment]);
    stations.push(THREE.MathUtils.lerp(samples[segment].s, samples[segment + 1]?.s ?? TRACK.length, t));
  }
  stations.push(TRACK.length);
  return stations;
}

function buildKerbs(parent: THREE.Object3D) {
  const positions: number[] = [];
  const colors: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  const red = new THREE.Color(0xe94132);
  const cream = new THREE.Color(0xf5e2be);
  const straightVerge = new THREE.Color(0x4f723e);
  const widths = [0, 0.13, 0.24, 0.77, 0.91, 1];
  const heights = [0.009, 0.028, 0.056, 0.059, 0.031, 0.010];
  const sections = [0.010, 0.047, 0.50, 0.953, 0.990];
  const wear = random(611);
  const screwCenters: { x: number; y: number; z: number; angle: number }[] = [];
  for (const side of [-1, 1]) {
    const stations = kerbStations(side);
    if (side === PIT_LANE.side) {
      stations.push(PIT_LANE.entry, PIT_LANE.exit);
      stations.sort((a, b) => a - b);
    }
    for (let i = 0; i < stations.length - 1; i++) {
      const begin = stations[i];
      const step = stations[i + 1] - begin;
      const base = positions.length / 3;
      const midpoint = begin + step * 0.5;
      if (side === PIT_LANE.side && midpoint > PIT_LANE.entry && midpoint < PIT_LANE.exit) continue;
      const signed = midpoint > TRACK.length / 2 ? midpoint - TRACK.length : midpoint;
      const straight = side < 0
        ? THREE.MathUtils.smoothstep(signed, -13.0, -9.9) * (1 - THREE.MathUtils.smoothstep(signed, 10.9, 13.8))
        : 0;
      const color = (i % 2 === 0 ? red : cream).clone().multiplyScalar(0.89 + wear() * 0.11).lerp(straightVerge, straight);
      for (const [row, section] of sections.entries()) {
        const p = TRACK.sampleAt(begin + section * step);
        const end = row === 0 || row === sections.length - 1;
        for (let k = 0; k < widths.length; k++) {
          const index = side < 0 ? widths.length - 1 - k : k;
          const offset = side * (roadHalfAt(p.s) + widths[index] * CURB_WIDTH);
          const point = surfaceEdge(p, offset, heights[index] * (end ? 0.58 : 1) * (1 - 0.68 * straight));
          positions.push(point.x, point.y, point.z);
          const shade = (end ? 0.85 : 1) * (0.963 + 0.037 * wear());
          colors.push(color.r * shade, color.g * shade, color.b * shade);
          uv.push(point.x * 1.09, point.z * 1.09);
        }
      }
      for (let sub = 0; sub < sections.length - 1; sub++) {
        for (let k = 0; k < widths.length - 1; k++) {
          const a = base + sub * widths.length + k;
          indices.push(a, a + 1, a + widths.length, a + widths.length, a + 1, a + widths.length + 1);
        }
      }
      if ((i + (side < 0 ? 2 : 0)) % 5 === 0 && straight < 0.14) {
        const sample = TRACK.sampleAt(midpoint);
        const { x, y, z } = surfaceEdge(sample, side * (roadHalfAt(sample.s) + CURB_WIDTH * 0.53), 0.056 * (1 - 0.68 * straight));
        screwCenters.push({ x, y, z, angle: wear() * Math.PI });
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const paint = kerbPaintMap();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshPhysicalMaterial({ vertexColors: true, map: paint,
    bumpMap: paint, bumpScale: 0.009, roughness: 0.58, clearcoat: 0.27, clearcoatRoughness: 0.52 }));
  mesh.receiveShadow = true;
  parent.add(mesh);

  const recess = standard(0x49382e, 0.74, 0.20);
  const steel = standard(0xa9a296, 0.43, 0.66);
  const washers = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.051, 0.053, 0.008, 12), recess, screwCenters.length);
  const heads = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.039, 0.042, 0.008, 12), steel, screwCenters.length);
  const slots = new THREE.InstancedMesh(new THREE.BoxGeometry(0.058, 0.003, 0.010), recess, screwCenters.length * 2);
  const transform = new THREE.Object3D();
  screwCenters.forEach(({ x, y, z, angle }, i) => {
    transform.rotation.y = angle;
    transform.position.set(x, y, z);
    transform.updateMatrix();
    washers.setMatrixAt(i, transform.matrix);
    transform.position.y += 0.003;
    transform.updateMatrix();
    heads.setMatrixAt(i, transform.matrix);
    transform.position.y += 0.004;
    transform.updateMatrix();
    slots.setMatrixAt(i * 2, transform.matrix);
    transform.rotation.y += Math.PI / 2;
    transform.updateMatrix();
    slots.setMatrixAt(i * 2 + 1, transform.matrix);
  });
  washers.receiveShadow = heads.receiveShadow = true;
  parent.add(washers, heads, slots);
}

function buildFences(parent: THREE.Object3D) {
  const { canvas, context } = canvas2d(208, 128);
  for (const [color, width, offset] of [['#8e8375', 1.72, 0], ['#d0bda4', 0.66, 0.27]] as const) {
    context.strokeStyle = color;
    context.lineWidth = width;
    context.beginPath();
    for (let x = 0; x <= canvas.width; x += 16) {
      context.moveTo(x + offset, 0);
      context.lineTo(x + offset, canvas.height);
    }
    for (let y = 0; y <= canvas.height; y += 16) {
      context.moveTo(0, y + offset);
      context.lineTo(canvas.width, y + offset);
    }
    context.stroke();
  }
  const map = texture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.anisotropy = 8;
  const mesh = new THREE.MeshStandardMaterial({ map, color: 0xd0c6b8, side: THREE.DoubleSide,
    transparent: true, opacity: 0.94, depthWrite: false, forceSinglePass: true, roughness: 0.64, metalness: 0.32 });
  const rails = standard(0x8f8577, 0.43, 0.65);
  const bases = standard(0x776b5f, 0.65, 0.39);
  const { from, to } = TRACK.tunnel;
  const divisions = Math.round(TRACK.length / 1.26);
  const stations = Array.from({ length: divisions }, (_, i) => i * TRACK.length / divisions)
    .filter(s => s < from - 0.13 || s > to + 0.13);
  stations.push(from, to);
  stations.sort((a, b) => a - b);
  const count = stations.length;
  const netSections = [trackSection(0, from), trackSection(to, TRACK.length)];
  const postGeometry = new THREE.BoxGeometry(1, 1, 1);
  const railGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 6).rotateX(Math.PI / 2);
  const uprights = new THREE.InstancedMesh(postGeometry, rails, count * 4);
  const plates = new THREE.InstancedMesh(postGeometry, bases, count * 2);
  const horizontal = new THREE.InstancedMesh(railGeometry, rails, (count - 1) * 6);
  const bolts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.023, 0.027, 0.018, 6), rails, count * 4);
  const transform = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  const forward = new THREE.Vector3(0, 0, 1);
  const railLevels = [[0.143, 0, 0.041], [0.642, 0, 0.025], [0.866, 0.178, 0.035]] as const;
  let rail = 0;
  for (const [sideIndex, side] of [-1, 1].entries()) {
    const offsetAt = (p: Sample) => side * (wallHalfAt(p.s, side) - 0.02);
    const lineAt = (p: Sample, level: number) => {
      const [height, bend] = railLevels[level];
      const ground = offsetAt(p);
      return edge(p, ground - side * bend, p.y + bankAt(p.s) * ground + height);
    };
    const panels = netSections.flatMap(section => [0, 1].map(level => {
      const panel = stripGeometry(section, p => lineAt(p, level), p => lineAt(p, level + 1), false, false);
      const uv = panel.getAttribute('uv');
      const from = level === 0 ? 0 : 0.65;
      const span = level === 0 ? 0.65 : 0.35;
      for (let i = 0; i < uv.count; i++) uv.setY(i, from + span * uv.getY(i));
      return panel;
    }));
    const net = new THREE.Mesh(mergeGeometries(panels)!, mesh);
    panels.forEach(panel => panel.dispose());
    net.receiveShadow = true;
    parent.add(net);
    for (let i = 0; i < count; i++) {
      const slot = sideIndex * count + i;
      const s = stations[i];
      const p = TRACK.sampleAt(s);
      const next = TRACK.sampleAt(stations[i + 1] ?? TRACK.length);
      const offset = offsetAt(p);
      transform.rotation.set(0, Math.atan2(p.dx, p.dz), 0);
      transform.position.copy(surfaceEdge(p, offset, 0.322));
      transform.scale.set(0.076, 0.683, 0.079);
      transform.updateMatrix();
      uprights.setMatrixAt(slot * 2, transform.matrix);
      transform.position.copy(surfaceEdge(p, offset, 0.030));
      transform.rotation.z = -Math.atan(bankAt(p.s));
      transform.scale.set(0.209, 0.095, 0.185);
      transform.updateMatrix();
      plates.setMatrixAt(slot, transform.matrix);
      for (const [bolt, shift] of [-0.064, 0.064].entries()) {
        transform.position.copy(surfaceEdge(p, offset + shift, 0.080));
        transform.scale.setScalar(1);
        transform.updateMatrix();
        bolts.setMatrixAt(slot * 2 + bolt, transform.matrix);
      }
      const knee = lineAt(p, 1);
      const cap = lineAt(p, 2);
      const diagonal = cap.clone().sub(knee);
      transform.position.copy(knee).lerp(cap, 0.5);
      transform.scale.set(0.072, diagonal.length() + 0.044, 0.074);
      transform.quaternion.setFromUnitVectors(up, diagonal.normalize());
      transform.updateMatrix();
      uprights.setMatrixAt(slot * 2 + 1, transform.matrix);

      if (s === from) continue;
      for (const [level, [, , diameter]] of railLevels.entries()) {
        const a = lineAt(p, level);
        const b = lineAt(next, level);
        const length = a.distanceTo(b);
        transform.position.copy(a).lerp(b, 0.5);
        transform.quaternion.setFromUnitVectors(forward, b.sub(a).normalize());
        transform.scale.set(diameter, diameter, length + 0.037);
        transform.updateMatrix();
        horizontal.setMatrixAt(rail++, transform.matrix);
      }
    }
  }
  uprights.castShadow = true;
  horizontal.castShadow = true;
  uprights.receiveShadow = plates.receiveShadow = horizontal.receiveShadow = bolts.receiveShadow = true;
  parent.add(uprights, plates, horizontal, bolts);
}

function buildMarkings(parent: THREE.Object3D) {
  const start = TRACK.sampleAt(0);
  const { map, depth, center } = gridMap();
  const geometry = new THREE.PlaneGeometry(ROAD_HALF * 2, depth).rotateX(-Math.PI / 2);
  const stencil = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map, roughness: 0.91,
    alphaTest: 0.38, alphaToCoverage: true, polygonOffset: true, polygonOffsetFactor: -1 }));
  stencil.position.set(start.x + center * start.dx, start.y + 0.013, start.z + center * start.dz);
  stencil.rotation.y = Math.atan2(start.dx, start.dz);
  stencil.receiveShadow = true;
  parent.add(stencil);
}

function apronExtent(p: Sample, side: number) {
  return wallHalfAt(p.s, side) - 0.02;
}

function fitRampJoints(parent: THREE.Object3D) {
  const ramp = TRACK.samples.filter(p => p.y > 0.29);
  const bracket = standard(0x605448, 0.68, 0.33);
  const pins = standard(0x9a8f80, 0.49, 0.56);
  const boltGeometry = new THREE.CylinderGeometry(0.039, 0.042, 0.017, 8).rotateZ(Math.PI / 2);
  for (const p of [ramp[0], ramp.at(-1)!]) {
    const rotation = Math.atan2(p.dx, p.dz);
    for (const side of [-1, 1]) {
      const outer = side * (apronExtent(p, side) + 0.202);
      const at = surfaceEdge(p, outer, -0.175);
      box(parent, bracket, at.x, at.y, at.z, 0.043, 0.191, 0.53, false).rotation.y = rotation;
      for (const along of [-0.166, 0.166]) {
        const bolt = new THREE.Mesh(boltGeometry, pins);
        const offset = edge(p, outer + side * 0.027, at.y + 0.015);
        bolt.position.set(offset.x + p.dx * along, offset.y, offset.z + p.dz * along);
        bolt.rotation.y = rotation;
        parent.add(bolt);
      }
    }
  }
}

function fenceKickboard(parent: THREE.Object3D, wood: THREE.Texture) {
  const grain = wood.clone();
  grain.repeat.set(0.86, 0.11);
  const oak = new THREE.MeshStandardMaterial({ color: 0xd19b63, map: grain, roughness: 0.76 });
  const lower = new THREE.MeshStandardMaterial({ color: 0xb78251, map: grain, roughness: 0.83 });
  const hardware = standard(0x6b6257, 0.43, 0.64);
  const stud = new THREE.CylinderGeometry(0.038, 0.041, 0.018, 10).rotateZ(Math.PI / 2);
  for (let s = -13.4; s < -0.5; s += 1.6) {
    const a = TRACK.sampleAt(s - 0.79);
    const b = TRACK.sampleAt(s + 0.79);
    const p = TRACK.sampleAt(s);
    const offset = -wallHalfAt(p.s, -1) - 0.107;
    const start = edge(a, offset, a.y);
    const end = edge(b, offset, b.y);
    const span = end.clone().sub(start);
    const mid = start.lerp(end, 0.5);
    const length = span.length();
    const direction = span.normalize();
    for (const [lift, height, material] of [[0.068, 0.132, lower], [0.211, 0.144, oak]] as const) {
      const board = box(parent, material, mid.x, mid.y + lift, mid.z, 0.179, height, length);
      board.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
    }
    const bracket = edge(p, offset + 0.091, p.y + 0.145);
    box(parent, hardware, bracket.x, bracket.y, bracket.z, 0.024, 0.258, 0.117, false).rotation.y = Math.atan2(p.dx, p.dz);
    for (const height of [0.067, 0.216]) {
      const screw = new THREE.Mesh(stud, hardware);
      screw.position.copy(edge(p, offset + 0.110, p.y + height));
      screw.rotation.y = Math.atan2(p.dx, p.dz);
      parent.add(screw);
    }
  }
}

function trackBoard(parent: THREE.Object3D, s: number, side: number, title: string, caption: string,
  color: string, width: number, yaw?: number, lift = 0) {
  const p = TRACK.sampleAt(s);
  const at = surfaceEdge(p, side * (wallHalfAt(s, side) + 0.038));
  const board = new THREE.Group();
  board.position.copy(at);
  board.rotation.y = yaw ?? Math.atan2(-p.dx, -p.dz);
  parent.add(board);
  const steel = standard(0x5d5b52, 0.51, 0.40);
  const { canvas, context } = canvas2d(256, 128);
  context.fillStyle = color;
  context.fillRect(0, 0, 256, 128);
  context.strokeStyle = '#332b21';
  context.lineWidth = 6;
  context.strokeRect(8, 8, 240, 112);
  context.fillStyle = '#26231d';
  context.textAlign = 'center';
  context.font = '900 47px Arial, sans-serif';
  context.fillText(title, 128, 64, 217);
  context.font = '700 25px Arial, sans-serif';
  context.fillText(caption, 128, 98, 213);
  const plate = standard(0xffffff, 0.72);
  plate.map = texture(canvas);
  box(board, steel, 0, 0.45 + lift / 2, 0, 0.064, 0.92 + lift, 0.062);
  box(board, steel, 0, 1.16 + lift, 0, width + 0.035, 0.54, 0.047);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.505), plate);
  face.position.set(0, 1.16 + lift, 0.026);
  face.receiveShadow = true;
  board.add(face);
}

function buildPitLane(parent: THREE.Object3D, mainAsphalt: THREE.MeshPhysicalMaterial) {
  const pit = new THREE.Group();
  pit.name = 'Calle de boxes y puestos de servicio';
  parent.add(pit);
  const { entry, exit, offset, stalls, side } = PIT_LANE;
  const samples = trackSection(entry, exit);
  const concrete = mainAsphalt.clone();
  concrete.color.setHex(0x686760);
  concrete.roughness = 0.85;
  concrete.bumpScale = 0.034;
  pit.add(surfaceWithGrit(stripGeometry(samples,
    p => edge(p, -pitRoadHalfAt(p.s), p.y + 0.001),
    p => edge(p, -roadHalfAt(p.s), p.y + 0.001), false, false), concrete));

  const yellow = standard(0xd1b058, 0.82);
  const cream = standard(0xcfc9ab, 0.90);
  const paint = (s: number, shift: number, width: number, depth: number, material: THREE.Material) => {
    const p = TRACK.sampleAt(s);
    const at = edge(p, shift, p.y + 0.010);
    return box(pit, material, at.x, at.y, at.z, width, 0.004, depth, false);
  };
  for (let s = entry + 1.1; s < exit - 0.9; s += 1.18) {
    const outer = pitRoadHalfAt(s);
    if (outer < ROAD_HALF + 0.23) continue;
    const slope = (pitRoadHalfAt(s + 0.28) - pitRoadHalfAt(s - 0.28)) / 0.56;
    paint(s, -outer + 0.127, 0.63, 0.052, yellow).rotation.y = Math.atan(slope);
  }

  const arrow = new THREE.Shape([
    new THREE.Vector2(-0.70, -0.075), new THREE.Vector2(0.16, -0.075), new THREE.Vector2(0.16, -0.25),
    new THREE.Vector2(0.69, 0), new THREE.Vector2(0.16, 0.25), new THREE.Vector2(0.16, 0.075), new THREE.Vector2(-0.70, 0.075),
  ]);
  const arrows = new THREE.ShapeGeometry(arrow).rotateX(-Math.PI / 2);
  for (const s of [8.7, 23.8]) {
    const p = TRACK.sampleAt(s);
    const mark = new THREE.Mesh(arrows, yellow);
    mark.position.copy(edge(p, offset + 0.12, p.y + 0.012));
    mark.receiveShadow = true;
    pit.add(mark);
  }

  stalls.forEach((s, i) => {
    for (const shift of [-1.16, 1.16]) paint(s, offset + shift, 3.96, 0.065, cream);
    for (const ds of [-1.99, 1.99]) paint(s + ds, offset, 0.070, 2.32, cream);
    paint(s, offset, 0.37, 0.048, yellow);
    trackBoard(pit, s, side, `0${i + 1}`, 'BOX', '#d7bd80', 0.76, 0);
  });
  trackBoard(pit, 8.3, side, 'BOXES', 'LENTO', '#e7ba54', 1.52);
}

function underpassShade(parent: THREE.Object3D) {
  const crossing = TRACK.crossing;
  const upper = TRACK.sampleAt(crossing.upper);
  const geometry = stripGeometry(trackSection(crossing.lowerFrom, crossing.lowerTo),
    p => edge(p, -roadHalfAt(p.s), p.y + 0.017), p => edge(p, roadHalfAt(p.s), p.y + 0.017), false, false);
  const positions = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i) - upper.x;
    const z = positions.getZ(i) - upper.z;
    uv.setXY(i, 0.5 + (z * upper.dx - x * upper.dz) / 8.25, 0.5);
  }
  const { canvas, context } = canvas2d(128, 4);
  const shade = context.createLinearGradient(0, 0, 128, 0);
  shade.addColorStop(0, 'rgba(23,17,15,0)');
  shade.addColorStop(0.14, 'rgba(23,17,15,.37)');
  shade.addColorStop(0.34, 'rgba(20,17,17,.50)');
  shade.addColorStop(0.70, 'rgba(20,17,17,.48)');
  shade.addColorStop(0.90, 'rgba(23,17,15,.25)');
  shade.addColorStop(1, 'rgba(23,17,15,0)');
  context.fillStyle = shade;
  context.fillRect(0, 0, 128, 4);
  const shadow = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture(canvas), transparent: true,
    depthWrite: false, toneMapped: false }));
  shadow.renderOrder = 1;
  parent.add(shadow);
}

export function buildCircuit(parent: THREE.Object3D, wood: THREE.Texture) {
  buildDeck(parent, wood);
  const grit = gritMap();
  const micro = grit.clone();
  micro.channel = 1;
  micro.colorSpace = THREE.NoColorSpace;
  const road = asphaltMaps();
  const asphalt = new THREE.MeshPhysicalMaterial({ color: 0x474850, map: road.color, roughnessMap: road.rough, bumpMap: asphaltRelief(),
    bumpScale: 0.049, roughness: 0.97, clearcoat: 0.10, clearcoatRoughness: 0.63 });
  const grass = new THREE.MeshPhysicalMaterial({ map: runoffMap(), roughness: 0.76,
    bumpMap: micro, bumpScale: 0.040, clearcoat: 0.27, clearcoatRoughness: 0.49 });
  const gravel = new THREE.MeshStandardMaterial({ map: runoffMap('gravel'), roughness: 0.94, bumpMap: micro, bumpScale: 0.082 });
  const escape = new THREE.MeshStandardMaterial({ map: runoffMap('escape'), roughness: 0.84, bumpMap: micro, bumpScale: 0.030 });
  const shoulderGrain = wood.clone();
  shoulderGrain.repeat.set(0.07, 0.23);
  const shoulder = new THREE.MeshStandardMaterial({ color: 0xc69c68, map: shoulderGrain, roughness: 0.76 });
  const endGrain = wood.clone();
  endGrain.repeat.set(0.37, 0.079);
  const rampPly = [0x825332, 0xcb8b4d, 0xe1a86d, 0xaf7042, 0xefb87e];
  const paint = standard(0xc8c2a5, 0.9);
  const joint = standard(0x37312c, 0.89);

  parent.add(surfaceWithGrit(stripGeometry(TRACK.samples,
    p => surfaceEdge(p, -roadHalfAt(p.s)), p => surfaceEdge(p, roadHalfAt(p.s)), false), asphalt));
  const underside = new THREE.Mesh(stripGeometry(TRACK.samples,
    p => surfaceEdge(p, apronExtent(p, 1) + 0.15, -rampDepth(p) + 0.003),
    p => surfaceEdge(p, -apronExtent(p, -1) - 0.15, -rampDepth(p) + 0.003), false), standard(0x65442d, 0.89));
  underside.castShadow = underside.receiveShadow = true;
  parent.add(underside);
  for (const side of [-1, 1]) {
    const limits = new Map(TRACK.samples.map(p => [p, surfaceBandsAt(p.s, side)]));
    for (const [from, to, material] of [['asphalt', 'curb', joint], ['curb', 'escape', escape],
      ['escape', 'gravel', gravel], ['gravel', 'wall', grass]] as const) {
      const first = side < 0 ? to : from;
      const second = side < 0 ? from : to;
      parent.add(surfaceWithGrit(stripGeometry(TRACK.samples,
        p => surfaceEdge(p, side * limits.get(p)![first], -0.011),
        p => surfaceEdge(p, side * limits.get(p)![second], -0.011), false), material));
    }
    const shoulderInside = (p: Sample) => surfaceEdge(p, side * (apronExtent(p, side) - 0.013), -0.009);
    const shoulderOutside = (p: Sample) => surfaceEdge(p, side * (apronExtent(p, side) + 0.156), -0.009);
    const border = new THREE.Mesh(stripGeometry(TRACK.samples,
      side < 0 ? shoulderOutside : shoulderInside, side < 0 ? shoulderInside : shoulderOutside, true), shoulder);
    border.receiveShadow = true;
    parent.add(border);

    ribbon(parent, side, -0.05, 0, 0.008, paint);

    plywoodEdge(parent, endGrain, rampPly, (p, level) => {
      const bulge = 0.047 * Math.sin(Math.PI * level / rampPly.length);
      const depth = rampDepth(p);
      const lift = -depth + (depth - 0.009) * level / rampPly.length;
      return surfaceEdge(p, side * (apronExtent(p, side) + 0.156 + bulge), lift);
    });
  }
  buildKerbs(parent);
  buildFences(parent);
  fenceKickboard(parent, wood);
  buildMarkings(parent);
  fitRampJoints(parent);
  buildPitLane(parent, asphalt);
  underpassShade(parent);
  buildTunnel(parent);
  buildBridgeTruss(parent);
  trackBoard(parent, TRACK.bridge.crest - 8.6, 1, 'FRENÁ', 'CRESTA', '#e8bb55', 1.48);
  trackBoard(parent, TRACK.bridge.crest - 4.3, -1, 'FRENO', 'PUENTE', '#e7c278', 1.08);
  trackBoard(parent, TRACK.crossing.upper - 6.9, 1, 'PUENTE', 'NIVEL ALTO', '#e1bb67', 1.33);
  trackBoard(parent, TRACK.chicane.from - 1.1, -1, 'CHICANA', 'DOS GIROS', '#e7c278', 1.38, undefined, 0.26);
}
