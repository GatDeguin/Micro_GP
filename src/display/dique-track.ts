import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { diqueRoadDistance, type Course } from '../shared/courses';
import { GRID_LANE_OFFSET } from '../shared/car-dimensions';
import type { TrackPoint } from '../shared/track';
import { box, canvas2d, noiseField, random, standard, texture } from './materials';
import { DIQUE_GROUND, diqueBeam, diqueEdge, diquePart, diqueSign, diqueSpan, diqueStrip } from './dique-geometry';

const TINT = {
  asphalt: 0x5b5958, escape: 0x777672, gravel: 0xa29580, grass: 0x777e63,
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
      const grit = (rng() - 0.5) * 19 + (wear(u, v) - 0.5) * 23 + (speck(u, v) - 0.5) * 21;
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

function castConcrete(retaining: boolean) {
  const size = 512;
  const { canvas, context } = canvas2d(size, size);
  const relief = canvas2d(size, size);
  const rng = random(retaining ? 42189 : 66412);
  const wear = noiseField(13, 16, rng);
  const pocks = noiseField(103, 111, rng);
  const stains = noiseField(48, retaining ? 5 : 25, rng);
  const edge = noiseField(55, 49, rng);
  const aggregate = noiseField(223, 237, rng);
  const moisture = noiseField(13, retaining ? 5 : 17, rng);
  const rows = retaining ? 4 : 6;
  const columns = retaining ? 5 : 6;
  const panels = Float64Array.from({ length: rows * columns }, rng);
  const diffuse = context.createImageData(size, size);
  const channels = relief.context.createImageData(size, size);
  const fracture = (v: number) => v - Math.floor(v);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    const row = Math.floor(v * rows);
    const vEdge = Math.min(fracture(v * rows), 1 - fracture(v * rows)) / rows;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const shifted = u * columns + (row % 2 ? 0.34 : 0);
      const uEdge = Math.min(fracture(shifted), 1 - fracture(shifted)) / columns;
      const center = panels[row * columns + Math.floor(shifted) % columns];
      const noise = wear(u, v);
      const grit = pocks(u, v);
      const edgeChip = edge(u, v);
      const gap = Math.min(uEdge, vEdge) * size;
      const seam = 1 - THREE.MathUtils.smoothstep(gap, 0.30, 1.15 + edgeChip * 1.25);
      const bevel = THREE.MathUtils.smoothstep(gap, 1.1, 1.9) * (1 - THREE.MathUtils.smoothstep(gap, 1.9, 3.1));
      const splash = retaining
        ? THREE.MathUtils.smoothstep(v + 0.22 * moisture(u, v), 0.78, 1.10)
        : THREE.MathUtils.smoothstep(moisture(u, v) + 0.24 * edgeChip, 0.63, 0.95) * (0.48 + seam * 0.43);
      const drip = Math.max(0, stains(u, v) - 0.50) * (retaining ? 1.68 : 0.54);
      const algae = splash * THREE.MathUtils.smoothstep(noise + 0.44 * edgeChip, 0.63, 0.96);
      const along = fracture(v * rows);
      const split = 0.09 + along * (0.79 - center * 0.54) + 0.056 * (edgeChip - 0.5);
      const crack = center > 0.77 && along < 0.61
        ? (1 - THREE.MathUtils.smoothstep(Math.abs(fracture(shifted) - split), 0.005, 0.019)) * (1 - along / 0.61)
        : 0;
      const stone = aggregate(u, v);
      const shade = (retaining ? 177 : 167) + (center - 0.5) * (retaining ? 32 : 19) + (noise - 0.5) * 19
        + (grit - 0.5) * 11 + (stone - 0.5) * 15 - drip * 39 - seam * (retaining ? 43 : 30)
        - splash * 24 - algae * 15 + bevel * 7 - crack * 25;
      const i = (y * size + x) * 4;
      diffuse.data[i] = shade + 4 + drip * 12 - algae * 10;
      diffuse.data[i + 1] = shade + 1 + algae * 9;
      diffuse.data[i + 2] = shade - 5 - algae * 13 - drip * 7;
      diffuse.data[i + 3] = 255;
      channels.data[i] = 144 + grit * 12 + stone * 23 - seam * 81 + bevel * 12 - crack * 25;
      channels.data[i + 1] = 247 - splash * 76 - drip * 36 - seam * 7;
      channels.data[i + 3] = 255;
    }
  }
  context.putImageData(diffuse, 0, 0);
  relief.context.putImageData(channels, 0, 0);
  const map = texture(canvas);
  const details = new THREE.CanvasTexture(relief.canvas);
  map.wrapS = details.wrapS = THREE.RepeatWrapping;
  map.wrapT = details.wrapT = retaining ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  details.anisotropy = map.anisotropy;
  if (!retaining) {
    map.repeat.set(0.81, 0.68);
    details.repeat.copy(map.repeat);
  }
  return new THREE.MeshStandardMaterial({
    color: retaining ? 0xc6bbac : 0xbfb8ad, map, bumpMap: details,
    bumpScale: 0.042, roughnessMap: details, roughness: 0.96,
  });
}

export function diqueConcrete() {
  return castConcrete(false);
}

function asphalt() {
  const size = 512;
  const { canvas, context } = canvas2d(size, size);
  const surface = canvas2d(size, size);
  const randomAsphalt = random(929);
  const tone = noiseField(9, 7, randomAsphalt);
  const chips = noiseField(133, 139, randomAsphalt);
  const dust = noiseField(232, 227, randomAsphalt);
  const pigment = context.createImageData(size, size);
  const response = surface.context.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const wear = tone(u, v);
      const grit = chips(u, v);
      const fines = dust(u, v);
      const facets = THREE.MathUtils.smoothstep(grit, 0.55, 0.91);
      const i = (y * size + x) * 4;
      const shade = 182 + (wear - 0.5) * 26 + (fines - 0.5) * 32 + 24 * facets;
      pigment.data[i] = shade + 5 * facets;
      pigment.data[i + 1] = shade + 1;
      pigment.data[i + 2] = shade - 4 * facets;
      pigment.data[i + 3] = 255;
      response.data[i] = 104 + 82 * grit + 32 * fines;
      response.data[i + 1] = 231 + 17 * fines - 42 * facets;
      response.data[i + 3] = 255;
    }
  }
  context.putImageData(pigment, 0, 0);
  surface.context.putImageData(response, 0, 0);
  const map = texture(canvas);
  const aggregate = new THREE.CanvasTexture(surface.canvas);
  map.wrapS = map.wrapT = aggregate.wrapS = aggregate.wrapT = THREE.RepeatWrapping;
  // Texture data is linear. Red carries surface relief, green controls the gloss of the exposed aggregate.
  aggregate.anisotropy = map.anisotropy;
  return new THREE.MeshStandardMaterial({ color: TINT.asphalt, map, bumpMap: aggregate, bumpScale: 0.021,
    name: 'Asfalto de árido expuesto', vertexColors: true, roughnessMap: aggregate, roughness: 0.95 });
}

function insideDetour(detour: Course['detour'], distance: number, transition: number) {
  return detour
    ? THREE.MathUtils.smoothstep(Math.min(distance - detour.from, detour.to - distance), 0, transition)
    : 0;
}

function asphaltDeck(course: Course, samples: readonly TrackPoint[]) {
  const bands = [-1, -0.70, -0.39, -0.14, 0.14, 0.39, 0.70, 1];
  const positions = [];
  const colors = [];
  const uv = [];
  const indices = [];
  const repeats = Math.round(course.length * 0.24) / course.length;
  for (const [i, p] of samples.entries()) {
    const half = course.roadHalfAt(p.s);
    const port = insideDetour(course.detour, p.s, 6);
    const plant = insideDetour(course.treatmentDetour, p.s, 6);
    for (const [line, fraction] of bands.entries()) {
      const offset = fraction * half;
      const q = diqueEdge(course, p, offset);
      const streak = 0.94 + 0.040 * Math.cos(p.s * 0.092) + 0.025 * Math.sin(p.s * 0.29 + fraction * 1.6);
      const wheelLine = 1 - Math.min(1, Math.abs(Math.abs(fraction) - 0.43 + 0.05 * Math.sin(p.s * 0.23)) * 6.8);
      const wear = streak * (1 - 0.16 * wheelLine - 0.17 * Math.abs(fraction) ** 5);
      const wet = course.wetAt(p.s, offset);
      positions.push(q.x, q.y, q.z);
      uv.push(p.s * repeats, offset * 0.24);
      colors.push(wear * (1 - 0.49 * wet + 0.21 * port + 0.06 * plant),
        wear * (1 - 0.43 * wet + 0.28 * port + 0.13 * plant),
        wear * (1 - 0.37 * wet + 0.30 * port + 0.17 * plant));
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
  const samples = diqueSpan(course, 145, diqueRoadDistance(219));
  const inner = [-1, -0.85, -0.72, -0.60, -0.48, -0.34, -0.20, 0.04];
  const positions = [];
  const colors = [];
  const uv = [];
  const indices = [];
  for (const [i, p] of samples.entries()) {
    for (const [j, side] of inner.entries()) {
      const lateral = side * course.roadHalfAt(p.s);
      const q = diqueEdge(course, p, lateral, 0.006);
      const wet = course.wetAt(p.s, lateral);
      const rim = THREE.MathUtils.smoothstep(-side + 0.15 * Math.sin(p.s * 0.41) + 0.07 * Math.cos(p.s * 0.98), 0.31, 0.74);
      const patch = 0.49 + 0.33 * Math.cos(p.s * 0.23 + lateral * 1.4) ** 2 + 0.18 * Math.sin(p.s * 0.77 - lateral) ** 2;
      positions.push(q.x, q.y, q.z);
      colors.push(0.81, 0.90, 0.98, 0.87 * rim * patch * wet);
      uv.push(p.s * 0.20, lateral * 0.21);
      if (i < samples.length - 1 && j < inner.length - 1) {
        const k = i * inner.length + j;
        indices.push(k, k + 1, k + inner.length, k + inner.length, k + 1, k + inner.length + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  diquePart(parent, geometry, new THREE.MeshPhysicalMaterial({
    color: 0x303941, roughness: 0.21, vertexColors: true,
    bumpMap: mineralMap(2957, [192, 195, 199]), bumpScale: 0.008,
    clearcoat: 1.0, clearcoatRoughness: 0.105, envMapIntensity: 1.18, transparent: true, depthWrite: false,
  }), false, 'Huella húmeda de la grúa');
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
  const stripe = standard(0xe2d7ba, 0.90);
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
  const colors = [new THREE.Color(0xc64d3f), new THREE.Color(0xf0e4c9)];
  const hazard = [new THREE.Color(0x777467), new THREE.Color(0xe4b45d)];
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
      const midpoint = (from + to) / 2;
      const paint = Math.max(insideDetour(course.detour, midpoint, 6), insideDetour(course.treatmentDetour, midpoint, 6)) > 0.5
        ? hazard : colors;
      const color = paint[i % 2].clone().multiplyScalar(0.72 + rng() * 0.33);
      const start = vertices.length / 3;
      for (const [row, along] of [0.035, 0.19, 0.81, 0.965].entries()) {
        const p = course.sampleAt(from + along * step);
        const band = course.surfaceBandsAt(p.s, side);
        for (const index of side > 0 ? [0, 1, 2, 3] : [3, 2, 1, 0]) {
          const margin = [0, 0.23, 0.70, 1][index];
          const height = [0.014, 0.066, 0.056, 0.010][index] * (row === 0 || row === 3 ? 0.61 : 1);
          const q = diqueEdge(course, p, side * THREE.MathUtils.lerp(band.asphalt, band.curb, margin), height);
          vertices.push(q.x, q.y, q.z);
          const exposed = index === 1 ? 0.96 : index === 2 ? 0.87 : 0.76;
          const paint = exposed + 0.06 * rng();
          vertexColors.push(color.r * paint, color.g * paint, color.b * paint);
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
  const post = standard(0x818b8e, 0.46, 0.58);
  const rail = standard(0xa8b3b0, 0.39, 0.59);
  const base = standard(0x66615a, 0.72, 0.30);
  const repairRail = [standard(0xc77b38, 0.75, 0.17), standard(0xe0cba0, 0.83)];
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
      // The inside guardrail crosses the former road and is also the first work-zone barrier.
      const from = course.detour?.from;
      const along = from === undefined ? -1 : (s + next) / 2 - from;
      if (side === -1 && along >= 5.4 && along <= 17.7) {
        for (const [level, height] of [0.24, 0.69].entries()) {
          diqueBeam(parent, repairRail[(i + level) % repairRail.length],
            diqueEdge(course, p, lateral, height), diqueEdge(course, q, nextLateral, height), 0.132, 0.19, false);
        }
        continue;
      }
      for (const [height, gauge] of [[0.18, 0.056], [0.43, 0.063], [0.76, 0.068]]) {
        diqueBeam(parent, rail, diqueEdge(course, p, lateral, height), diqueEdge(course, q, nextLateral, height), gauge, gauge * 0.72, false);
      }
    }
  }
}

function retainingGlow() {
  const { canvas, context } = canvas2d(64, 96);
  const image = context.createImageData(64, 96);
  for (let y = 0; y < 96; y++) {
    const v = (y - 15) / (y < 15 ? 15 : 80);
    for (let x = 0; x < 64; x++) {
      const u = (x - 31.5) / 31.5;
      const core = Math.max(0, 1 - Math.hypot(u, v));
      const i = (y * 64 + x) * 4;
      image.data[i] = 229 + 26 * core;
      image.data[i + 1] = 127 + 65 * core;
      image.data[i + 2] = 53 + 49 * core;
      image.data[i + 3] = 221 * core ** 1.65;
    }
  }
  context.putImageData(image, 0, 0);
  return new THREE.MeshBasicMaterial({
    map: texture(canvas), blending: THREE.AdditiveBlending, transparent: true,
    depthWrite: false, toneMapped: true,
  });
}

function wallLamps(parent: THREE.Group, course: Course, glow: THREE.Material) {
  const fixture = standard(0x69655c, 0.52, 0.54);
  const lens = new THREE.MeshStandardMaterial({
    color: 0xffd889, emissive: 0xffa350, emissiveIntensity: 3.35, roughness: 0.44,
  });
  const projections: THREE.BufferGeometry[] = [];
  for (const at of [321, 340, 410, 427, 442, 457, 472, 491, 509, 534]) {
    const s = diqueRoadDistance(at);
    const side = at < 350 ? -1 : 1;
    const p = course.sampleAt(s);
    const height = p.y + course.bankAt(s) * side * (course.wallHalfAt(s, side) + 0.22) - DIQUE_GROUND;
    if (height < 1.3) continue;
    const mount = (p: TrackPoint, depth: number, drop: number) =>
      diqueEdge(course, p, side * (course.wallHalfAt(p.s, side) + 0.22 + depth), drop);
    const plate = mount(p, 0.082, -0.50);
    const glass = mount(p, 0.196, -0.55);
    const angle = Math.atan2(p.dx, p.dz);
    box(parent, fixture, plate.x, plate.y, plate.z, 0.24, 0.22, 0.70, false).rotation.y = angle;
    box(parent, lens, glass.x, glass.y, glass.z, 0.058, 0.103, 0.55, false).rotation.y = angle;
    const samples = diqueSpan(course, s - 2.55, s + 2.55);
    const top = (p: TrackPoint) => mount(p, 0.037, -0.39);
    const bottom = (p: TrackPoint) => {
      const vertex = top(p);
      vertex.y = Math.max(DIQUE_GROUND + 0.018, vertex.y - 2.73);
      return vertex;
    };
    const geometry = diqueStrip(samples, side > 0 ? top : bottom, side > 0 ? bottom : top);
    const uv = geometry.getAttribute('uv');
    for (const [index, sample] of samples.entries()) {
      const u = (sample.s - s) / 5.1 + 0.5;
      uv.setXY(index * 2, u, side > 0 ? 1 : 0);
      uv.setXY(index * 2 + 1, u, side > 0 ? 0 : 1);
    }
    projections.push(geometry);
  }
  const pools = mergeGeometries(projections);
  for (const projection of projections) projection.dispose();
  if (pools) diquePart(parent, pools, glow, false, 'Rebote ámbar en el hormigón del dique');
  return lens;
}

function wallFootings(parent: THREE.Group, course: Course, material: THREE.Material) {
  for (const [start, end, outer, height] of [[413, 488, 1.08, 0.88], [410, 492, 1.83, 0.34]]) {
    const from = diqueRoadDistance(start);
    const to = diqueRoadDistance(end);
    const samples = diqueSpan(course, from, to);
    const footing = (p: TrackPoint, distance: number, y: number) => {
      const point = diqueEdge(course, p, course.wallHalfAt(p.s, 1) + distance);
      point.y = DIQUE_GROUND + y;
      return point;
    };
    const lid = diqueStrip(samples, p => footing(p, 0.11, height), p => footing(p, outer, height));
    const face = diqueStrip(samples, p => footing(p, outer, height), p => footing(p, outer, -0.026), 'longitudinal');
    diquePart(parent, lid, material, false, 'Berma de inspección del dique');
    diquePart(parent, face, material, true, 'Zapata del muro de contención');
    for (const s of [from, to]) {
      const p = course.sampleAt(s);
      const q = footing(p, (outer + 0.11) / 2, height / 2);
      box(parent, material, q.x, q.y, q.z, outer - 0.11, height, 0.036, false).rotation.y = Math.atan2(p.dx, p.dz);
    }
  }
}

function bridgePiers(parent: THREE.Group, course: Course, stone: THREE.Material, rim: THREE.Material,
  glow: THREE.Material) {
  const bearing = standard(0x494f51, 0.65, 0.35);
  const iron = standard(0x685e4c, 0.74, 0.33);
  const lamp = new THREE.MeshStandardMaterial({
    color: 0xffcf8d, emissive: 0xff9a36, emissiveIntensity: 2.8, roughness: 0.4,
  });
  const pools: THREE.BufferGeometry[] = [];
  for (const [at, offset] of [[355.75, -1.25], [382.25, -1.3]]) {
    const s = diqueRoadDistance(at);
    const p = course.sampleAt(s);
    const q = diqueEdge(course, p, offset);
    const pier = new THREE.Group();
    pier.name = 'Pila del puente en terreno firme';
    pier.position.set(q.x, DIQUE_GROUND, q.z);
    pier.rotation.y = Math.atan2(p.dx, p.dz);
    parent.add(pier);
    const height = q.y - 0.60 - DIQUE_GROUND;
    box(pier, rim, 0, 0.17, 0, 4.35, 0.34, 2.70);
    box(pier, stone, 0, 0.40, 0, 3.84, 0.20, 2.38);
    box(pier, stone, 0, (height - 0.17) / 2, 0, 3.16, height - 0.83, 2.02);
    for (const x of [-1.36, 1.36]) {
      box(pier, rim, x, height / 2 - 0.03, -1.05, 0.14, height - 1.22, 0.09, false);
    }
    for (const y of [0.74, height * 0.47, height * 0.68]) {
      box(pier, bearing, 0, y, -1.01, 3.09, 0.034, 0.028, false);
    }
    box(pier, stone, -0.43, height - 0.47, 0, 4.67, 0.44, 2.18);
    box(pier, rim, -0.43, height - 0.20, 0, 4.91, 0.15, 2.34);
    for (const x of [-1.88, 0.88]) {
      box(pier, bearing, x, height - 0.05, 0, 0.67, 0.17, 1.83);
    }
    box(pier, iron, 0, height - 0.92, -1.14, 0.61, 0.23, 0.23, false);
    box(pier, lamp, 0, height - 0.98, -1.27, 0.46, 0.080, 0.085, false);
    const geometry = new THREE.PlaneGeometry(3.08, height - 1.38)
      .rotateY(Math.PI).translate(0, (height - 1.38) / 2 + 0.32, -1.027)
      .rotateY(pier.rotation.y).translate(q.x, DIQUE_GROUND, q.z);
    pools.push(geometry);
  }
  const batch = mergeGeometries(pools);
  for (const pool of pools) pool.dispose();
  if (batch) diquePart(parent, batch, glow, false, 'Luz de inspección en las pilas');
  return lamp;
}

function retainingWalls(parent: THREE.Group, course: Course, concrete: THREE.Material) {
  const beams = standard(0x8e8778, 0.79, 0.12);
  const topFace = standard(0x686e70, 0.81, 0.20);
  const weathered = castConcrete(true);
  const bridgeFrom = diqueRoadDistance(349.5);
  const bridgeTo = diqueRoadDistance(391.5);
  const makeRetaining = (from: number, to: number) => {
    const samples = diqueSpan(course, from, to);
    for (const side of [-1, 1]) {
      const margin = (p: TrackPoint) => side * (course.wallHalfAt(p.s, side) + 0.22);
      const cap = (p: TrackPoint) => diqueEdge(course, p, margin(p), -0.055);
      const bottom = (p: TrackPoint) => { const q = cap(p); q.y = DIQUE_GROUND - 0.025; return q; };
      const panel = diqueStrip(samples, side > 0 ? cap : bottom, side > 0 ? bottom : cap, 'longitudinal');
      const normalUV = panel.getAttribute('uv');
      const coordinates = panel.getAttribute('position');
      for (const [index, p] of samples.entries()) {
        normalUV.setXY(index * 2, p.s / 13.8, (coordinates.getY(index * 2) - DIQUE_GROUND) / 7.25);
        normalUV.setXY(index * 2 + 1, p.s / 13.8, (coordinates.getY(index * 2 + 1) - DIQUE_GROUND) / 7.25);
      }
      diquePart(parent, panel, weathered, true, 'Muro de contención con juntas y marcas de humedad');
      const cornice = (p: TrackPoint, depth: number, height: number) =>
        diqueEdge(course, p, margin(p) + side * depth, height);
      diquePart(parent, diqueStrip(samples, side > 0 ? p => cornice(p, 0, -0.040) : p => cornice(p, 0.16, -0.040),
        side > 0 ? p => cornice(p, 0.16, -0.040) : p => cornice(p, 0, -0.040)), topFace);
      diquePart(parent, diqueStrip(samples, side > 0 ? p => cornice(p, 0.16, -0.040) : p => cornice(p, 0.16, -0.18),
        side > 0 ? p => cornice(p, 0.16, -0.18) : p => cornice(p, 0.16, -0.040)), beams);
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
  makeRetaining(diqueRoadDistance(292), bridgeFrom);
  makeRetaining(bridgeTo, diqueRoadDistance(566));
  wallFootings(parent, course, concrete);
  const glow = retainingGlow();
  const wallLenses = wallLamps(parent, course, glow);
  const pierLenses = bridgePiers(parent, course, weathered, beams, glow);
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
  return {
    setNight(night: boolean) {
      glow.opacity = night ? 0.94 : 0.29;
      wallLenses.emissiveIntensity = night ? 2.8 : 1.06;
      pierLenses.emissiveIntensity = night ? 3.18 : 1.16;
    },
  };
}

function fallbackTruss(parent: THREE.Group, course: Course) {
  const web = standard(0x516269, 0.48, 0.67);
  const channel = standard(0x3b484b, 0.43, 0.73);
  const plate = standard(0x818c88, 0.48, 0.56);
  const rust = standard(0x776348, 0.78, 0.43);
  const stations = Array.from({ length: 13 }, (_, i) => course.sampleAt(diqueRoadDistance(351) + i * (39 / 12)));
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
}

function steelBridge(parent: THREE.Group, course: Course, bridgeModel?: readonly THREE.Object3D[]) {
  if (bridgeModel) parent.add(...bridgeModel);
  else fallbackTruss(parent, course);
  const plate = standard(0x818c88, 0.48, 0.56);
  const seam = standard(0x34322e, 0.96);
  for (const at of [361.01, 384.82]) {
    const s = diqueRoadDistance(at);
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

export function buildDiqueTrack(parent: THREE.Group, course: Course, concrete: THREE.Material, bridgeModel?: readonly THREE.Object3D[]) {
  surfaceRuns(parent, course, concrete);
  curbs(parent, course);
  rails(parent, course);
  trackPaint(parent, course);
  const practicals = retainingWalls(parent, course, concrete);
  steelBridge(parent, course, bridgeModel);
  return practicals;
}
