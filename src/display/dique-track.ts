import * as THREE from 'three';
import type { Course } from '../shared/courses';
import { GRID_LANE_OFFSET } from '../shared/car-dimensions';
import type { TrackPoint } from '../shared/track';
import { box, canvas2d, noiseField, random, standard, texture } from './materials';
import { DIQUE_GROUND, diqueBeam, diqueEdge, diquePart, diqueSign, diqueSpan, diqueStrip } from './dique-geometry';

const TINT = {
  asphalt: 0x555760, escape: 0x707873, gravel: 0xb1a384, grass: 0x708658,
  curb: 0x55524b, pit: 0x87837b,
};

function mineralMap(seed: number, tint: [number, number, number], scale = 1) {
  const { canvas, context } = canvas2d(384, 384);
  const rng = random(seed);
  const wear = noiseField(11, 12, rng);
  const speck = noiseField(180, 192, rng);
  const pixels = context.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const u = x / canvas.width;
      const v = y / canvas.height;
      const grit = (rng() - 0.5) * 37 + (wear(u, v) - 0.5) * 32 + (speck(u, v) - 0.5) * 38;
      const i = (y * canvas.width + x) * 4;
      pixels.data[i] = tint[0] + grit;
      pixels.data[i + 1] = tint[1] + grit;
      pixels.data[i + 2] = tint[2] + grit;
      pixels.data[i + 3] = 255;
    }
  }
  context.putImageData(pixels, 0, 0);
  const map = texture(canvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.setScalar(scale);
  return map;
}

export function diqueConcrete() {
  const { canvas, context } = canvas2d(512, 512);
  const rng = random(66412);
  const pocks = noiseField(39, 42, rng);
  const stain = noiseField(16, 22, rng);
  const pixels = context.createImageData(512, 512);
  for (let y = 0; y < 512; y++) {
    for (let x = 0; x < 512; x++) {
      const row = Math.floor(y / 128);
      const seam = Math.min(y % 128, (x + (row % 2) * 128) % 256);
      const u = x / 512;
      const v = y / 512;
      const drip = stain(u, v * 0.61) ** 2;
      const shade = 192 - 48 * drip - 17 * pocks(u, v) + 23 * (rng() - 0.5) - (seam < 3 ? 32 - seam * 7 : 0);
      const i = (y * 512 + x) * 4;
      pixels.data[i] = shade + 3;
      pixels.data[i + 1] = shade + 1;
      pixels.data[i + 2] = shade - 5 - drip * 8;
      pixels.data[i + 3] = 255;
    }
  }
  context.putImageData(pixels, 0, 0);
  const map = texture(canvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshStandardMaterial({ color: 0xb4ada1, map, bumpMap: map, bumpScale: 0.061, roughness: 0.85 });
}

function asphalt() {
  const map = mineralMap(929, [193, 196, 201], 1.25);
  return new THREE.MeshPhysicalMaterial({ color: TINT.asphalt, map, bumpMap: map, bumpScale: 0.035,
    vertexColors: true, roughness: 0.83, clearcoat: 0.17, clearcoatRoughness: 0.57 });
}

function asphaltDeck(course: Course, samples: readonly TrackPoint[]) {
  const bands = [-1, -0.70, -0.39, -0.14, 0.14, 0.39, 0.70, 1];
  const positions = [];
  const colors = [];
  const uv = [];
  const indices = [];
  for (const [i, p] of samples.entries()) {
    const half = course.roadHalfAt(p.s);
    for (const [line, fraction] of bands.entries()) {
      const offset = fraction * half;
      const q = diqueEdge(course, p, offset);
      const wear = (0.94 + 0.067 * Math.cos(p.s * 0.092)) * (0.78 + 0.22 * Math.min(1, Math.abs(fraction) * 2.28));
      const wet = course.wetAt(p.s, offset);
      positions.push(q.x, q.y, q.z);
      uv.push(q.x * 0.23, q.z * 0.23);
      colors.push(wear * (1 - 0.43 * wet), wear * (1 - 0.35 * wet), wear * (1 - 0.25 * wet));
      if (line === bands.length - 1 || i === samples.length - 1) continue;
      const k = i * bands.length + line;
      indices.push(k, k + 1, k + bands.length, k + bands.length, k + 1, k + bands.length + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function wetShoulder(parent: THREE.Group, course: Course) {
  const samples = diqueSpan(course, 145, 219);
  const inner = [-1, -0.81, -0.61, -0.42, -0.19, 0.04];
  const positions = [];
  const colors = [];
  const indices = [];
  for (const [i, p] of samples.entries()) {
    for (const [j, side] of inner.entries()) {
      const lateral = side * course.roadHalfAt(p.s);
      const q = diqueEdge(course, p, lateral, 0.006);
      const wet = course.wetAt(p.s, lateral);
      const patch = 0.62 + 0.38 * Math.cos(p.s * 0.26 + lateral * 1.4) ** 2;
      positions.push(q.x, q.y, q.z);
      colors.push(0.65, 0.77, 0.92, 0.58 * patch * wet);
      if (i < samples.length - 1 && j < inner.length - 1) {
        const k = i * inner.length + j;
        indices.push(k, k + 1, k + inner.length, k + inner.length, k + 1, k + inner.length + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  diquePart(parent, geometry, new THREE.MeshPhysicalMaterial({ color: 0x494d53, roughness: 0.26, vertexColors: true,
    clearcoat: 1, clearcoatRoughness: 0.16, transparent: true, depthWrite: false }), false, 'Huella húmeda de la grúa');
}

function surfaceRuns(parent: THREE.Group, course: Course, concrete: THREE.Material) {
  const racing = asphalt();
  const common = mineralMap(58, [201, 198, 189]);
  const gravelMap = mineralMap(457, [197, 188, 170], 1.78);
  const verge: Record<'curb' | 'escape' | 'gravel' | 'wall', THREE.Material> = {
    curb: new THREE.MeshStandardMaterial({ color: TINT.curb, map: common }),
    escape: new THREE.MeshStandardMaterial({ color: TINT.escape, map: common, bumpMap: common, bumpScale: 0.046, roughness: 0.86 }),
    gravel: new THREE.MeshStandardMaterial({ color: TINT.gravel, map: gravelMap, bumpMap: gravelMap, bumpScale: 0.10, roughness: 0.98 }),
    wall: new THREE.MeshStandardMaterial({ color: TINT.grass, map: mineralMap(914, [169, 185, 143]), roughness: 0.92 }),
  };
  const stripe = standard(0xd5ceaf, 0.90);
  const runs = 12;
  for (let i = 0; i < runs; i++) {
    const samples = diqueSpan(course, i * course.length / runs, (i + 1) * course.length / runs);
    diquePart(parent, asphaltDeck(course, samples), racing, false, 'Calzada del Dique');
    for (const side of [-1, 1]) {
      const limits = new Map(samples.map(p => [p, course.surfaceBandsAt(p.s, side)]));
      const boundaries = ['asphalt', 'curb', 'escape', 'gravel', 'wall'] as const;
      for (let band = 1; band < boundaries.length; band++) {
        const start = boundaries[band - 1];
        const end = boundaries[band] as keyof typeof verge;
        if (!samples.some(p => limits.get(p)![end] - limits.get(p)![start] > 0.002)) continue;
        const a = side < 0 ? end : start;
        const b = side < 0 ? start : end;
        const geometry = diqueStrip(samples,
          p => diqueEdge(course, p, side * limits.get(p)![a], -0.012),
          p => diqueEdge(course, p, side * limits.get(p)![b], -0.012));
        diquePart(parent, geometry, verge[end]);
      }
      const shoulder = (p: TrackPoint, amount: number) => diqueEdge(course, p, side * (course.wallHalfAt(p.s, side) + amount), -0.008);
      diquePart(parent, diqueStrip(samples, p => shoulder(p, side < 0 ? 0.29 : -0.015), p => shoulder(p, side < 0 ? -0.015 : 0.29)), concrete);
      const line = (p: TrackPoint, amount: number) => diqueEdge(course, p, side * (course.roadHalfAt(p.s) - amount), 0.010);
      diquePart(parent, diqueStrip(samples, p => line(p, side < 0 ? 0.007 : 0.069), p => line(p, side < 0 ? 0.069 : 0.007)), stripe);
    }
  }
  wetShoulder(parent, course);
  // Keep texture coordinates consistent with the road but make the service pavement slightly paler.
  const pit = course.pit;
  const lane = diqueSpan(course, pit.entry, pit.exit);
  const pitMaterial = new THREE.MeshStandardMaterial({ color: TINT.pit, map: common, bumpMap: common, bumpScale: 0.033, roughness: 0.88 });
  diquePart(parent, diqueStrip(lane, p => diqueEdge(course, p, -course.pitRoadHalfAt(p.s), 0.003),
    p => diqueEdge(course, p, -course.roadHalfAt(p.s), 0.003)), pitMaterial, false, 'Carril de boxes');
}

function curbs(parent: THREE.Group, course: Course) {
  const red = standard(0xb23b2e, 0.68);
  const ivory = standard(0xe6d9bb, 0.70);
  const colors = [red.color, ivory.color];
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.74, map: mineralMap(645, [212, 212, 209], 2.5) });
  const rng = random(5532);
  const count = Math.round(course.length / 1.4);
  const step = course.length / count;
  for (const side of [-1, 1]) {
    const vertices = [];
    const vertexColors: number[] = [];
    const uv = [];
    const indices = [];
    for (let i = 0; i < count; i++) {
      const from = i * step;
      const to = from + step;
      if (side < 0 && to > course.pit.entry && from < course.pit.exit) continue;
      const color = colors[i % 2].clone().multiplyScalar(0.78 + rng() * 0.26);
      const start = vertices.length / 3;
      for (const [row, along] of [0.035, 0.19, 0.81, 0.965].entries()) {
        const p = course.sampleAt(from + along * step);
        const band = course.surfaceBandsAt(p.s, side);
        for (const index of side > 0 ? [0, 1, 2, 3] : [3, 2, 1, 0]) {
          const margin = [0, 0.23, 0.70, 1][index];
          const height = [0.014, 0.066, 0.056, 0.010][index] * (row === 0 || row === 3 ? 0.61 : 1);
          const q = diqueEdge(course, p, side * THREE.MathUtils.lerp(band.asphalt, band.curb, margin), height);
          vertices.push(q.x, q.y, q.z);
          color.toArray(vertexColors, vertexColors.length);
          uv.push(q.x * 0.36, q.z * 0.36);
        }
      }
      for (let row = 0; row < 3; row++) {
        for (let strip = 0; strip < 3; strip++) {
          const k = start + row * 4 + strip;
          indices.push(k, k + 1, k + 4, k + 4, k + 1, k + 5);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(vertexColors, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    diquePart(parent, geometry, material, false, 'Pianos del circuito');
  }
}

function trackPaint(parent: THREE.Group, course: Course) {
  const ivory = standard(0xe6d9bb, 0.76);
  const graphite = standard(0x272b2b, 0.88);
  const ochre = standard(0xe6b751, 0.81);
  const pit = course.pit;
  const plate = (s: number, offset: number, width: number, length: number, material: THREE.Material) => {
    const p = course.sampleAt(s);
    const q = diqueEdge(course, p, offset, 0.015);
    const mark = box(parent, material, q.x, q.y, q.z, width, 0.006, length, false);
    mark.rotation.set(0, Math.atan2(p.dx, p.dz), -Math.atan(course.bankAt(p.s)), 'YXZ');
    return mark;
  };
  const width = course.roadHalfAt(0) * 2;
  const cells = 14;
  for (let x = 0; x < cells; x++) {
    for (let i = 0; i < 2; i++) {
      plate((i - 0.5) * 0.37, ((x + 0.5) / cells - 0.5) * width, width / cells + 0.002, 0.373,
        (x + i) % 2 ? graphite : ivory);
    }
  }
  for (const s of course.gridRows) {
    for (const offset of [-GRID_LANE_OFFSET, GRID_LANE_OFFSET]) {
      for (const side of [-1, 1]) plate(s - 0.98, offset + side * 0.79, 0.045, 1.03, ivory);
      plate(s - 1.49, offset, 1.62, 0.055, ivory);
    }
  }
  for (const [index, stall] of pit.stalls.entries()) {
    for (const side of [-1, 1]) {
      plate(stall, pit.offset + side * 1.06, 0.055, 4.46, ivory);
      plate(stall + side * 2.23, pit.offset, 2.12, 0.055, ivory);
    }
    plate(stall + 1.80, pit.offset, 0.36, 0.055, ochre);
    const number = new THREE.MeshBasicMaterial({ map: diqueSign([String(index + 1).padStart(2, '0')], '#555046', '#f2d79f') });
    const stamp = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.29).rotateX(-Math.PI / 2), number);
    stamp.position.copy(diqueEdge(course, course.sampleAt(stall - 1.76), pit.offset, 0.016));
    parent.add(stamp);
  }
  for (let s = pit.entry + 4.0; s < pit.exit - 4.0; s += 1.7) {
    const outer = course.pitRoadHalfAt(s);
    if (outer > course.roadHalfAt(s) + 0.26) plate(s, -outer + 0.18, 0.060, 0.82, ochre);
  }
  for (const s of [25, 108]) {
    const center = plate(s - 0.36, pit.offset + 0.30, 0.13, 0.73, ochre);
    const left = plate(s + 0.034, pit.offset + 0.54, 0.072, 0.56, ochre);
    const right = plate(s + 0.034, pit.offset + 0.06, 0.072, 0.56, ochre);
    left.rotation.y = center.rotation.y + 0.62;
    right.rotation.y = center.rotation.y - 0.62;
  }
}

function rails(parent: THREE.Group, course: Course) {
  const post = standard(0x6c6d63, 0.52, 0.54);
  const rail = standard(0xa4a59a, 0.49, 0.58);
  const base = standard(0x615d50, 0.72, 0.32);
  const count = Math.round(course.length / 2.30);
  const spacing = course.length / count;
  const skip = (s: number, side: number) => (s > course.tunnel.from + 0.03 && s < course.tunnel.to - 0.03)
    || (side < 0 && s > course.pit.stalls[0] - 5.0 && s < course.pit.stalls[course.pit.stalls.length - 1] + 5.0);
  for (const side of [-1, 1]) {
    const stations = Array.from({ length: count }, (_, i) => i * spacing);
    stations.push(course.tunnel.from, course.tunnel.to);
    stations.sort((a, b) => a - b);
    for (const [i, s] of stations.entries()) {
      const next = stations[i + 1] ?? course.length;
      const p = course.sampleAt(s);
      const q = course.sampleAt(next);
      const lateral = side * course.wallHalfAt(p.s, side);
      const nextLateral = side * course.wallHalfAt(q.s, side);
      const foot = diqueEdge(course, p, lateral);
      const yaw = Math.atan2(p.dx, p.dz);
      if (!skip(s, side)) {
        box(parent, base, foot.x, foot.y + 0.018, foot.z, 0.185, 0.067, 0.264, false).rotation.y = yaw;
        box(parent, post, foot.x, foot.y + 0.391, foot.z, 0.077, 0.795, 0.091, false).rotation.y = yaw;
      }
      if (skip((s + next) / 2, side)) continue;
      for (const [height, gauge] of [[0.18, 0.056], [0.43, 0.063], [0.76, 0.068]]) {
        diqueBeam(parent, rail, diqueEdge(course, p, lateral, height), diqueEdge(course, q, nextLateral, height), gauge, gauge * 0.72, false);
      }
    }
  }
}

function retainingWalls(parent: THREE.Group, course: Course, concrete: THREE.Material) {
  const beams = standard(0x716c60, 0.87, 0.16);
  const topFace = standard(0x69675d, 0.89);
  const bridgeFrom = 349.5;
  const bridgeTo = 391.5;
  const makeRetaining = (from: number, to: number) => {
    const samples = diqueSpan(course, from, to);
    for (const side of [-1, 1]) {
      const margin = (p: TrackPoint) => side * (course.wallHalfAt(p.s, side) + 0.22);
      const cap = (p: TrackPoint) => diqueEdge(course, p, margin(p), -0.055);
      const bottom = (p: TrackPoint) => { const q = cap(p); q.y = DIQUE_GROUND - 0.025; return q; };
      const panel = diqueStrip(samples, side > 0 ? cap : bottom, side > 0 ? bottom : cap, 'longitudinal');
      const normalUV = panel.getAttribute('uv');
      const coordinates = panel.getAttribute('position');
      for (let i = 0; i < normalUV.count; i++) normalUV.setY(i, coordinates.getY(i) * 0.37);
      diquePart(parent, panel, concrete, true, 'Muro de contención de hormigón');
      for (let s = from + 1.35; s < to - 1.0; s += 4.8) {
        const p = course.sampleAt(s);
        const q = cap(p);
        const height = q.y - DIQUE_GROUND;
        if (height < 0.42) continue;
        box(parent, beams, q.x, DIQUE_GROUND + height / 2, q.z, 0.33, height, 0.44).rotation.y = Math.atan2(p.dx, p.dz);
      }
    }
  };
  // At the crossing the track is an open girder and its support is set outside the lower deck.
  makeRetaining(292, bridgeFrom);
  makeRetaining(bridgeTo, 566);
  const span = diqueSpan(course, bridgeFrom - 0.22, bridgeTo + 0.22);
  const deckEdge = (p: TrackPoint, side: number) => diqueEdge(course, p, side * (course.wallHalfAt(p.s, side) + 0.27), -0.60);
  diquePart(parent, diqueStrip(span, p => deckEdge(p, 1), p => deckEdge(p, -1)), topFace, true, 'Cara inferior del puente');
  for (const side of [-1, 1]) {
    const top = (p: TrackPoint) => diqueEdge(course, p, side * (course.wallHalfAt(p.s, side) + 0.27), -0.006);
    diquePart(parent, diqueStrip(span, side > 0 ? top : p => deckEdge(p, side), side > 0 ? p => deckEdge(p, side) : top), beams, true);
  }
  for (const s of [bridgeFrom, bridgeTo]) {
    const p = course.sampleAt(s);
    const rise = p.y - 0.60 - DIQUE_GROUND;
    const width = course.wallHalfAt(s, -1) + course.wallHalfAt(s, 1) + 0.71;
    const yaw = Math.atan2(p.dx, p.dz);
    box(parent, concrete, p.x, DIQUE_GROUND + rise / 2, p.z, width, rise, 0.79).rotation.y = yaw;
    box(parent, beams, p.x, p.y - 0.58, p.z, width + 0.16, 0.24, 1.17).rotation.y = yaw;
  }
}

function steelBridge(parent: THREE.Group, course: Course) {
  const web = standard(0x516269, 0.48, 0.67);
  const channel = standard(0x3b484b, 0.43, 0.73);
  const plate = standard(0x818c88, 0.48, 0.56);
  const rust = standard(0x776348, 0.78, 0.43);
  const seam = standard(0x34322e, 0.96);
  const stations = Array.from({ length: 13 }, (_, i) => course.sampleAt(351 + i * (39 / 12)));
  for (const side of [-1, 1]) {
    const edge = (p: TrackPoint, y: number) => diqueEdge(course, p, side * (course.wallHalfAt(p.s, side) + 0.46), y);
    for (const [i, p] of stations.entries()) {
      const low = edge(p, -0.18);
      const high = edge(p, i === 0 || i === stations.length - 1 ? 1.76 : 2.30);
      const next = stations[i + 1];
      diqueBeam(parent, web, low, high, i % 3 === 0 ? 0.235 : 0.169, 0.19);
      for (const at of [low, high]) {
        box(parent, rust, at.x, at.y, at.z, 0.29, 0.34, 0.35, false).rotation.y = Math.atan2(p.dx, p.dz);
      }
      if (!next) continue;
      const nextLow = edge(next, -0.18);
      const nextHigh = edge(next, i + 1 === stations.length - 1 ? 1.76 : 2.30);
      diqueBeam(parent, channel, low, nextLow, 0.27, 0.23);
      diqueBeam(parent, web, high, nextHigh, 0.23, 0.19);
      const diagonal = i % 2 === 0 ? [low, nextHigh] : [high, nextLow];
      diqueBeam(parent, plate, diagonal[0], diagonal[1], 0.15, 0.135);
    }
  }
  for (const s of [361.01, 384.82]) {
    const p = course.sampleAt(s);
    const yaw = Math.atan2(p.dx, p.dz);
    const half = course.roadHalfAt(s) - 0.085;
    box(parent, seam, p.x, p.y + 0.010, p.z, half * 2, 0.006, 0.20, false).rotation.y = yaw;
    for (const direction of [-1, 1]) {
      box(parent, plate, p.x + direction * p.dx * 0.074, p.y + 0.019, p.z + direction * p.dz * 0.074,
        half * 2, 0.008, 0.045, false).rotation.y = yaw;
    }
    for (let offset = -half + 0.11, i = 0; offset < half - 0.1; offset += 0.23, i++) {
      const p = course.sampleAt(s + (i % 2 ? 1 : -1) * 0.039);
      const q = diqueEdge(course, p, offset, 0.019);
      box(parent, plate, q.x, q.y, q.z, 0.138, 0.009, 0.085, false).rotation.y = yaw;
    }
  }
}

export function buildDiqueTrack(parent: THREE.Group, course: Course, concrete: THREE.Material) {
  surfaceRuns(parent, course, concrete);
  curbs(parent, course);
  rails(parent, course);
  trackPaint(parent, course);
  retainingWalls(parent, course, concrete);
  steelBridge(parent, course);
}
