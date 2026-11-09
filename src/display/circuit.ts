import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CURB_WIDTH, ROAD_HALF, TRACK, WALL_HALF } from '../shared/track';
import { BENCH_SURFACE, box, canvas2d, gritMap, horizontalShadow, random, standard, texture } from './materials';
import { alongTrack, asphaltMaps, asphaltRelief, gridMap, kerbPaintMap, runoffMap } from './track-finishes';

type Sample = (typeof TRACK.samples)[number];

function edge(sample: Sample, offset: number, height: number) {
  return new THREE.Vector3(sample.x - sample.dz * offset, height, sample.z + sample.dx * offset);
}

function stripGeometry(
  samples: readonly Sample[],
  first: (sample: Sample) => THREE.Vector3,
  second: (sample: Sample) => THREE.Vector3,
  planarUV: boolean,
) {
  const positions: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= samples.length; i++) {
    const sample = samples[i % samples.length];
    const distance = i === samples.length ? TRACK.length : sample.s;
    const points = [first(sample), second(sample)];
    points.forEach((p, side) => {
      positions.push(p.x, p.y, p.z);
      if (planarUV) uv.push(p.x * 0.78, p.z * 0.78);
      else uv.push(distance * 1.48, side);
    });
    if (i < samples.length) {
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

function ribbon(parent: THREE.Object3D, from: number, to: number, lift: number, material: THREE.Material) {
  const surface = new THREE.Mesh(stripGeometry(
    TRACK.samples,
    p => edge(p, from, p.y + lift),
    p => edge(p, to, p.y + lift),
    true,
  ), material);
  surface.receiveShadow = true;
  parent.add(surface);
}

const DECK_TOP = -0.23;
const RAMP_DEPTH = 0.34;

function rampDepth(p: Sample) {
  return THREE.MathUtils.lerp(-DECK_TOP, RAMP_DEPTH, THREE.MathUtils.smoothstep(p.y, 0.04, 0.72));
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
) {
  const bands: THREE.BufferGeometry[] = [];
  tones.forEach((tone, index) => {
    for (const [lower, upper, shade] of [[0, 0.13, 0.48], [0.13, 1, 1]]) {
      const geometry = stripGeometry(TRACK.samples, p => profile(p, index + lower), p => profile(p, index + upper), false);
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
    p => edge(p, -WALL_HALF - 1.13, DECK_TOP + 0.008),
    p => edge(p, WALL_HALF + 0.74, DECK_TOP + 0.008),
    false,
  ), new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false }));
  parent.add(shadows);
}

function buildDeck(parent: THREE.Object3D, wood: THREE.Texture) {
  const shape = new THREE.Shape();
  const perimeter = (p: Sample) => {
    const angle = p.s / TRACK.length * Math.PI * 2;
    return WALL_HALF + 1.02 + 0.14 * Math.sin(2 * angle) + 0.11 * Math.sin(5 * angle)
      + 0.21 * THREE.MathUtils.smoothstep(p.z, 6.0, 8.7);
  };
  TRACK.samples.forEach((p, i) => {
    const point = edge(p, perimeter(p), 0);
    if (i === 0) shape.moveTo(point.x, -point.z);
    else shape.lineTo(point.x, -point.z);
  });
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
    return edge(p, perimeter(p) + 0.081 - lowerRounding - upperRounding, BENCH_SURFACE + layerHeight * level);
  });

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
    TRACK.samples,
    p => edge(p, perimeter(p) - 0.18, BENCH_SURFACE + 0.008),
    p => edge(p, perimeter(p) + 0.64, BENCH_SURFACE + 0.008),
    false,
  ), new THREE.MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false, toneMapped: false }));
  parent.add(baseShadow);

  const screw = new THREE.CylinderGeometry(0.115, 0.12, 0.026, 12);
  const hardware = standard(0x514b42, 0.42, 0.58);
  const slot = standard(0x29251f);
  for (let s = 4; s < TRACK.length; s += 6.7) {
    const p = TRACK.sampleAt(s);
    const at = edge(p, perimeter(p) - 0.37, DECK_TOP + 0.006);
    const head = new THREE.Mesh(screw, hardware);
    head.position.copy(at);
    parent.add(head);
    box(parent, slot, at.x, at.y + 0.013, at.z, 0.128, 0.006, 0.025, false).rotation.y = s;
  }

  const timber = new THREE.MeshStandardMaterial({ color: 0xd79f65, map: wood, roughness: 0.82 });
  const shoe = standard(0x827264, 0.84, 0.11);
  const gasket = standard(0x493628, 0.90);
  const iron = standard(0x78716b, 0.54, 0.52);
  const braceGeometry = new THREE.BoxGeometry(0.135, 1, 0.18);
  const footLocations: { x: number; z: number; rotation: number }[] = [];
  const spans = [3.79, 4.12, 3.61];
  for (let s = 0, span = 0; s < TRACK.length; s += spans[span++ % spans.length]) {
    const p = TRACK.sampleAt(s);
    if (p.y < 0.27) continue;
    const legTop = p.y - rampDepth(p) + 0.037;
    const rotation = Math.atan2(p.dx, p.dz);
    for (const side of [-1, 1]) {
      const offset = side * (span % 2 === 0 ? 2.85 : 2.98);
      const at = edge(p, offset, (DECK_TOP + legTop) / 2);
      footLocations.push({ x: at.x, z: at.z, rotation });
      box(parent, timber, at.x, at.y, at.z, span % 2 ? 0.44 : 0.40, legTop - DECK_TOP, 0.39).rotation.y = rotation;
      box(parent, gasket, at.x, DECK_TOP + 0.028, at.z, 0.73, 0.056, 0.64, false).rotation.y = rotation;
      box(parent, shoe, at.x, DECK_TOP + 0.100, at.z, 0.66, 0.144, 0.59, false).rotation.y = rotation;
      if (p.y > 0.64) {
        box(parent, iron, at.x, legTop - 0.09, at.z, 0.49, 0.14, 0.46, false).rotation.y = rotation;
      }
      if (p.y > 0.71 && (side < 0 || span % 2 === 0)) {
        const brace = new THREE.Mesh(braceGeometry, timber);
        const base = edge(p, offset, DECK_TOP + 0.12);
        const jointSample = TRACK.sampleAt(s + (span % 2 === 0 ? 1.37 : -1.33));
        const joint = edge(jointSample, offset, jointSample.y - rampDepth(jointSample) + 0.013);
        const direction = joint.clone().sub(base);
        brace.position.copy(base).lerp(joint, 0.5);
        brace.scale.y = direction.length();
        brace.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
        brace.castShadow = brace.receiveShadow = true;
        parent.add(brace);
      }
    }
    box(parent, timber, p.x, legTop + 0.023, p.z, 6.59, 0.18, 0.35).rotation.y = rotation;
  }
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
  const offset = side * (ROAD_HALF + CURB_WIDTH * 0.50);
  const rim = samples.map(p => edge(p, offset, p.y));
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
    for (let i = 0; i < stations.length - 1; i++) {
      const begin = stations[i];
      const step = stations[i + 1] - begin;
      const base = positions.length / 3;
      const midpoint = begin + step * 0.5;
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
          const offset = side * (ROAD_HALF + widths[index] * CURB_WIDTH);
          const point = edge(p, offset, p.y + heights[index] * (end ? 0.58 : 1) * (1 - 0.68 * straight));
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
        const { x, y, z } = edge(sample, side * (ROAD_HALF + CURB_WIDTH * 0.53), sample.y + 0.056 * (1 - 0.68 * straight));
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
  const count = Math.round(TRACK.length / 1.26);
  const postGeometry = new THREE.BoxGeometry(1, 1, 1);
  const railGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 6).rotateX(Math.PI / 2);
  const uprights = new THREE.InstancedMesh(postGeometry, rails, count * 4);
  const plates = new THREE.InstancedMesh(postGeometry, bases, count * 2);
  const horizontal = new THREE.InstancedMesh(railGeometry, rails, count * 6);
  const bolts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.023, 0.027, 0.018, 6), rails, count * 4);
  const transform = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  const forward = new THREE.Vector3(0, 0, 1);
  const railLevels = [[0.143, 0, 0.041], [0.642, 0, 0.025], [0.866, 0.178, 0.035]] as const;
  for (const [sideIndex, side] of [-1, 1].entries()) {
    const offset = side * (WALL_HALF - 0.02);
    const lineAt = (p: Sample, level: number) => {
      const [height, bend] = railLevels[level];
      return edge(p, offset - side * bend, p.y + height);
    };
    const panels = [0, 1].map(level => {
      const panel = stripGeometry(TRACK.samples, p => lineAt(p, level), p => lineAt(p, level + 1), false);
      const uv = panel.getAttribute('uv');
      const from = level === 0 ? 0 : 0.65;
      const span = level === 0 ? 0.65 : 0.35;
      for (let i = 0; i < uv.count; i++) uv.setY(i, from + span * uv.getY(i));
      return panel;
    });
    const net = new THREE.Mesh(mergeGeometries(panels)!, mesh);
    panels.forEach(panel => panel.dispose());
    net.receiveShadow = true;
    parent.add(net);
    for (let i = 0; i < count; i++) {
      const slot = sideIndex * count + i;
      const p = TRACK.sampleAt(i * TRACK.length / count);
      const next = TRACK.sampleAt((i + 1) * TRACK.length / count);
      transform.rotation.set(0, Math.atan2(p.dx, p.dz), 0);
      transform.position.copy(edge(p, offset, p.y + 0.322));
      transform.scale.set(0.076, 0.683, 0.079);
      transform.updateMatrix();
      uprights.setMatrixAt(slot * 2, transform.matrix);
      transform.position.copy(edge(p, offset, p.y + 0.030));
      transform.scale.set(0.209, 0.095, 0.185);
      transform.updateMatrix();
      plates.setMatrixAt(slot, transform.matrix);
      for (const [bolt, shift] of [-0.064, 0.064].entries()) {
        transform.position.copy(edge(p, offset + shift, p.y + 0.080));
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

      for (const [level, [, , diameter]] of railLevels.entries()) {
        const a = lineAt(p, level);
        const b = lineAt(next, level);
        const length = a.distanceTo(b);
        transform.position.copy(a).lerp(b, 0.5);
        transform.quaternion.setFromUnitVectors(forward, b.sub(a).normalize());
        transform.scale.set(diameter, diameter, length + 0.037);
        transform.updateMatrix();
        horizontal.setMatrixAt(slot * railLevels.length + level, transform.matrix);
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
  const apices = side < 0
    ? [[20.7, 5.6, 0.49], [32.4, 6.5, 0.33], [51.5, 5.9, 0.21], [94.8, 8.8, 0.34]]
    : [[26.6, 6.2, 0.27], [38.7, 6.9, 0.25], [64.4, 5.3, 0.21], [99.3, 8.5, 0.26]];
  const expansion = apices.reduce((width, [s, radius, amount]) => {
    const distance = (p.s - s) / radius;
    return width + amount * Math.max(0, 1 - distance * distance) ** 2;
  }, 0);
  return WALL_HALF - 0.055 + expansion;
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
      const at = edge(p, outer, p.y - 0.175);
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
    const offset = -WALL_HALF - 0.107;
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

export function buildCircuit(parent: THREE.Object3D, wood: THREE.Texture) {
  buildDeck(parent, wood);
  const grit = gritMap();
  const micro = grit.clone();
  micro.channel = 1;
  micro.colorSpace = THREE.NoColorSpace;
  const road = asphaltMaps();
  const asphalt = new THREE.MeshPhysicalMaterial({ color: 0x474850, map: road.color, roughnessMap: road.rough, bumpMap: asphaltRelief(),
    bumpScale: 0.049, roughness: 0.97, clearcoat: 0.10, clearcoatRoughness: 0.63 });
  const runoff = new THREE.MeshPhysicalMaterial({ map: runoffMap(), roughness: 0.64,
    bumpMap: micro, bumpScale: 0.040, clearcoat: 0.27, clearcoatRoughness: 0.49 });
  const shoulderGrain = wood.clone();
  shoulderGrain.repeat.set(0.07, 0.23);
  const shoulder = new THREE.MeshStandardMaterial({ color: 0xc69c68, map: shoulderGrain, roughness: 0.76 });
  const endGrain = wood.clone();
  endGrain.repeat.set(0.37, 0.079);
  const rampPly = [0x825332, 0xcb8b4d, 0xe1a86d, 0xaf7042, 0xefb87e];
  const paint = standard(0xc8c2a5, 0.9);
  const joint = standard(0x37312c, 0.89);

  parent.add(surfaceWithGrit(stripGeometry(TRACK.samples,
    p => edge(p, -ROAD_HALF, p.y), p => edge(p, ROAD_HALF, p.y), false), asphalt));
  const underside = new THREE.Mesh(stripGeometry(TRACK.samples,
    p => edge(p, apronExtent(p, 1) + 0.15, p.y - rampDepth(p) + 0.003),
    p => edge(p, -apronExtent(p, -1) - 0.15, p.y - rampDepth(p) + 0.003), false), standard(0x65442d, 0.89));
  underside.receiveShadow = true;
  parent.add(underside);
  for (const side of [-1, 1]) {
    const inner = (p: Sample) => edge(p, side * ROAD_HALF, p.y - 0.014);
    const outer = (p: Sample) => edge(p, side * apronExtent(p, side), p.y - 0.014);
    parent.add(surfaceWithGrit(stripGeometry(TRACK.samples, side < 0 ? outer : inner, side < 0 ? inner : outer, false), runoff));
    const shoulderInside = (p: Sample) => edge(p, side * (apronExtent(p, side) - 0.013), p.y - 0.009);
    const shoulderOutside = (p: Sample) => edge(p, side * (apronExtent(p, side) + 0.156), p.y - 0.009);
    const border = new THREE.Mesh(stripGeometry(TRACK.samples,
      side < 0 ? shoulderOutside : shoulderInside, side < 0 ? shoulderInside : shoulderOutside, true), shoulder);
    border.receiveShadow = true;
    parent.add(border);

    const bedding = [side * ROAD_HALF, side * (ROAD_HALF + CURB_WIDTH)].sort((a, b) => a - b);
    ribbon(parent, bedding[0], bedding[1], -0.007, joint);
    const line = [side * (ROAD_HALF - 0.05), side * ROAD_HALF].sort((a, b) => a - b);
    ribbon(parent, line[0], line[1], 0.008, paint);

    plywoodEdge(parent, endGrain, rampPly, (p, level) => {
      const bulge = 0.047 * Math.sin(Math.PI * level / rampPly.length);
      const depth = rampDepth(p);
      const height = p.y - depth + (depth - 0.009) * level / rampPly.length;
      return edge(p, side * (apronExtent(p, side) + 0.156 + bulge), height);
    });
  }
  buildKerbs(parent);
  buildFences(parent);
  fenceKickboard(parent, wood);
  buildMarkings(parent);
  fitRampJoints(parent);
}
