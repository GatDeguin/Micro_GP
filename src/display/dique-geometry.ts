import * as THREE from 'three';
import type { Course } from '../shared/courses';
import type { TrackPoint } from '../shared/track';
import { box, canvas2d, texture } from './materials';

export const DIQUE_GROUND = -0.94;
export const DIQUE_WATER = -2.20;

export function diqueSpan(course: Course, from: number, to: number) {
  return [course.sampleAt(from), ...course.samples.filter(p => p.s > from && p.s < to), { ...course.sampleAt(to), s: to }];
}

export function diqueEdge(course: Course, p: TrackPoint, lateral = 0, lift = 0) {
  return new THREE.Vector3(p.x - p.dz * lateral, p.y + course.bankAt(p.s) * lateral + lift, p.z + p.dx * lateral);
}

export function diqueStrip(samples: readonly TrackPoint[], a: (p: TrackPoint) => THREE.Vector3,
  b: (p: TrackPoint) => THREE.Vector3, map: 'planar' | 'longitudinal' = 'planar') {
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  const uv = [];
  const indices = [];
  for (const [i, p] of samples.entries()) {
    for (const [edge, point] of [a(p), b(p)].entries()) {
      positions.push(point.x, point.y, point.z);
      if (map === 'planar') uv.push(point.x * 0.23, point.z * 0.23);
      else uv.push(p.s * 0.33, edge);
    }
    if (i === samples.length - 1) continue;
    const k = i * 2;
    indices.push(k, k + 1, k + 2, k + 2, k + 1, k + 3);
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function diqueBeam(parent: THREE.Object3D, material: THREE.Material, from: THREE.Vector3, to: THREE.Vector3,
  width: number, height = width, casts = true) {
  const direction = new THREE.Vector3().subVectors(to, from);
  const span = direction.length();
  const middle = from.clone().lerp(to, 0.5);
  const beam = box(parent, material, middle.x, middle.y, middle.z, width, height, span + 0.016, casts);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.normalize());
  return beam;
}

export function diquePart(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[],
  cast = false, name = '') {
  const part = new THREE.Mesh(geometry, material);
  part.name = name;
  part.castShadow = cast;
  part.receiveShadow = true;
  parent.add(part);
  return part;
}

export function diqueRoadClear(course: Course, x: number, z: number, gap: number) {
  // Check each deck in plan so scenery cannot fit under one lane and hit another.
  for (const p of course.samples) {
    const dx = x - p.x;
    const dz = z - p.z;
    const longitudinal = dx * p.dx + dz * p.dz;
    if (Math.abs(longitudinal) > gap + 0.24) continue;
    const offset = dz * p.dx - dx * p.dz;
    if (Math.abs(offset) < course.wallHalfAt(p.s, Math.sign(offset)) + gap) return false;
  }
  return true;
}

export function diqueSign(lines: readonly string[], background: string, color: string, border = color) {
  const { canvas, context } = canvas2d(384, 128);
  context.fillStyle = background;
  context.fillRect(0, 0, 384, 128);
  context.strokeStyle = border;
  context.lineWidth = 4;
  context.strokeRect(6, 6, 372, 116);
  context.fillStyle = color;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  for (const [i, line] of lines.entries()) {
    context.font = i === 0 ? '900 58px Arial, sans-serif' : '700 26px Arial, sans-serif';
    context.fillText(line, 192, lines.length === 1 ? 65 : i === 0 ? 51 : 95, 350);
  }
  return texture(canvas);
}

export function diquePlane(points: readonly THREE.Vector2[], holes: readonly (readonly THREE.Vector2[])[] = []) {
  const shape = new THREE.Shape(points.map(p => new THREE.Vector2(p.x, -p.y)));
  shape.closePath();
  for (const polygon of holes) {
    const path = new THREE.Path(polygon.map(p => new THREE.Vector2(p.x, -p.y)));
    path.closePath();
    shape.holes.push(path);
  }
  return new THREE.ShapeGeometry(shape, 12).rotateX(-Math.PI / 2);
}
