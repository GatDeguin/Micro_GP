import * as THREE from 'three';

export type Section = readonly [z: number, halfWidth: number, bottom: number, top: number];

export const ARCH_RADIUS = 0.239;
const sideProfile = [[0.72, 0], [0.93, 0.14], [1, 0.34], [0.99, 0.65], [0.92, 0.86], [0.77, 1]] as const;
const sideRows = [0, 0.065, 0.14, 0.24, 0.34, 0.49, 0.65, 0.76, 0.86, 0.94, 1];
const crownRows = [0.75, 0.50, 0.25, 0, -0.25, -0.50, -0.75];
const ringSize = sideRows.length * 2 + crownRows.length;

const tangent = (a: number, b: number) => a * b > 0 ? 2 * a * b / (a + b) : 0;

function interpolate(a: number, b: number, m0: number, m1: number, span: number, t: number) {
  const u = 1 - t;
  return u * u * ((1 + 2 * t) * a + t * span * m0) + t * t * ((1 + 2 * u) * b - u * span * m1);
}

export function sectionAt(sections: readonly Section[], z: number): Section {
  const found = sections.findIndex(section => section[0] >= z);
  const index = found < 0 ? sections.length - 1 : Math.max(1, found);
  const [rear, front] = [sections[index - 1], sections[index]];
  const length = front[0] - rear[0];
  const t = THREE.MathUtils.clamp((z - rear[0]) / length, 0, 1);
  const before = sections[index - 2];
  const after = sections[index + 1];
  const mix = (i: 1 | 2 | 3) => {
    const slope = (front[i] - rear[i]) / length;
    const m0 = before ? tangent((rear[i] - before[i]) / (rear[0] - before[0]), slope) : slope;
    const m1 = after ? tangent(slope, (after[i] - front[i]) / (after[0] - front[0])) : slope;
    return interpolate(rear[i], front[i], m0, m1, length, t);
  };
  return [z, mix(1), mix(2), mix(3)];
}

function outlineAt(height: number) {
  const upper = Math.max(1, sideProfile.findIndex(([, y]) => y >= height));
  const [x1, y1] = sideProfile[upper - 1];
  const [x2, y2] = sideProfile[upper];
  const lower = sideProfile[upper - 2];
  const higher = sideProfile[upper + 1];
  const span = y2 - y1;
  const slope = (x2 - x1) / span;
  const m0 = lower ? tangent((x1 - lower[0]) / (y1 - lower[1]), slope) : slope;
  const m1 = higher ? tangent(slope, (higher[0] - x2) / (higher[1] - y2)) : slope;
  return interpolate(x1, x2, m0, m1, span, (height - y1) / span);
}

export function archFloor([z, , bottom, top]: Section, wheelbase: number) {
  const d = Math.abs(Math.abs(z) - wheelbase) / ARCH_RADIUS;
  if (d >= 1) return bottom;
  const crown = Math.min(0.451, top - 0.024);
  return THREE.MathUtils.lerp(bottom, crown, Math.sqrt(1 - d * d));
}

export function crownHeight([, width, bottom, top]: Section, x: number, body: boolean) {
  const offset = Math.min(1, Math.abs(x) / (width * 0.77));
  return top + (1 - offset * offset) * Math.min(body ? 0.018 : 0.005, (top - bottom) * 0.09);
}

function skinWidth(section: Section, y: number, wheelbase?: number) {
  const [z, width, bottom, top] = section;
  const base = width * outlineAt(THREE.MathUtils.clamp((y - bottom) / (top - bottom), 0, 1));
  if (wheelbase === undefined) return base;
  const along = Math.abs(Math.abs(z) - wheelbase) / ARCH_RADIUS;
  const across = Math.max(0, 1 - (y - archFloor(section, wheelbase)) / 0.085);
  const crest = THREE.MathUtils.clamp((top - y) / 0.038, 0, 1);
  return Math.min(0.55, base + 0.024 * Math.max(0, 1 - along * along) * across * across * crest);
}

export function sidePoint(sections: readonly Section[], z: number, height: number, side: number, lift = 0.004, wheelbase?: number) {
  const section = sectionAt(sections, z);
  const y = THREE.MathUtils.lerp(section[2], section[3], height);
  return new THREE.Vector3(side * (skinWidth(section, y, wheelbase) + lift), y, z);
}

export function shellSections(sections: readonly Section[], wheelbase?: number) {
  const zSamples = sections.map(section => section[0]);
  for (let i = 1; i < sections.length; i++) {
    const from = sections[i - 1][0];
    const span = sections[i][0] - from;
    const steps = Math.ceil(span / 0.064);
    for (let j = 1; j < steps; j++) zSamples.push(from + span * j / steps);
  }
  if (wheelbase !== undefined) {
    // The bottom row follows both arch crowns. The lower skin spans above the tyres.
    for (const center of [-wheelbase, wheelbase]) {
      for (let i = 0; i <= 20; i++) zSamples.push(center + ARCH_RADIUS * Math.cos(i * Math.PI / 20));
    }
  }
  zSamples.sort((a, b) => a - b);
  const first = sections[0][0];
  const last = sections[sections.length - 1][0];
  return zSamples.filter((z, i) => z >= first && z <= last && (i === 0 || z - zSamples[i - 1] > 1e-6))
    .map(z => sectionAt(sections, z));
}

export function shellGeometry(sections: readonly Section[], wheelbase?: number) {
  const first = sections[0][0];
  const last = sections[sections.length - 1][0];
  const rings = shellSections(sections, wheelbase);
  const positions: number[] = [];
  const uv: number[] = [];
  const triangles: number[] = [];
  rings.forEach((dimensions, section) => {
    const [z, width, bottom, top] = dimensions;
    const cut = wheelbase === undefined ? bottom : archFloor(dimensions, wheelbase);
    const sideVertex = (side: number, h: number) => {
      const y = THREE.MathUtils.lerp(cut, top, h);
      positions.push(side * skinWidth(dimensions, y, wheelbase), y, z);
    };
    for (const h of sideRows) sideVertex(1, h);
    for (const q of crownRows) {
      const x = q * width * 0.77;
      positions.push(x, crownHeight(dimensions, x, wheelbase !== undefined), z);
    }
    for (let i = sideRows.length - 1; i >= 0; i--) sideVertex(-1, sideRows[i]);

    for (let index = 0; index < ringSize; index++) {
      uv.push((z - first) / (last - first), index / ringSize);
      if (section < rings.length - 1) {
        const a = section * ringSize + index;
        const b = section * ringSize + (index + 1) % ringSize;
        triangles.push(a, b, a + ringSize, b, b + ringSize, a + ringSize);
      }
    }
  });
  const front = (rings.length - 1) * ringSize;
  for (let i = 1; i < ringSize - 1; i++) triangles.push(0, i + 1, i, front, front + i, front + i + 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(triangles);
  geometry.computeVertexNormals();
  return geometry;
}
