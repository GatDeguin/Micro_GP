import * as THREE from 'three';
import type { Course } from '../shared/courses';
import { DIQUE_GROUND, diqueEdge, diquePart, diqueRoadClear, diqueSign } from './dique-geometry';
import { box, standard } from './materials';

const steel = standard(0x686d68, 0.68, 0.43);
const paint = standard(0xd0a14f, 0.74, 0.12);
const dark = standard(0x333533, 0.84, 0.16);
const arrow = new THREE.Shape([
  [-0.20, -1.06], [0.20, -1.06], [0.20, 0.25], [0.68, 0.25], [0, 1.14],
  [-0.68, 0.25], [-0.20, 0.25],
].map(([x, forward]) => new THREE.Vector2(x, -forward)));
const stencil = new THREE.ShapeGeometry(arrow).rotateX(-Math.PI / 2);

function roadwaySign(parent: THREE.Group, course: Course, s: number, side: number, width: number, height: number,
  lines: readonly string[], lookBack = 5) {
  const track = course.sampleAt(s);
  const from = course.sampleAt(s - lookBack);
  let mount: THREE.Vector3 | undefined;
  for (const margin of [1.25, 1.82, 2.49]) {
    const candidate = diqueEdge(course, track, side * (course.wallHalfAt(s, side) + margin));
    if (!diqueRoadClear(course, candidate.x, candidate.z, width / 2 + 0.08)) continue;
    mount = candidate;
    break;
  }
  if (!mount) return;
  const sign = new THREE.Group();
  sign.name = lines.join(' · ');
  sign.position.set(mount.x, DIQUE_GROUND, mount.z);
  sign.rotation.y = Math.atan2(from.x - mount.x, from.z - mount.z);
  parent.add(sign);
  for (const x of [-width * 0.34, width * 0.34]) {
    box(sign, dark, x, 0.070, 0, 0.28, 0.14, 0.32, false);
    box(sign, steel, x, height * 0.49, 0, 0.067, height, 0.082, false);
  }
  const boardHeight = width / 2.56;
  box(sign, steel, 0, height, 0, width + 0.08, boardHeight + 0.069, 0.11, false);
  const map = diqueSign(lines, '#3d3529', '#ffdc85', '#bb903f');
  const panel = new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffc182, emissiveIntensity: 0.50,
    roughness: 0.79 });
  diquePart(sign, new THREE.PlaneGeometry(width, boardHeight), panel).position.set(0, height, 0.062);
  return panel;
}

export function buildDiqueDetourLook(target: THREE.Group, course: Course) {
  const detour = course.detour;
  if (!detour) return undefined;
  const root = new THREE.Group();
  root.name = 'Balizamiento del desvío por la terminal';
  target.add(root);
  const { from, to, apex } = detour;
  const length = to - from;
  const panels = [
    roadwaySign(root, course, from - 15.0, 1, 2.28, 2.62, ['DESVÍO →', 'CALZADA EN OBRA'], 11),
    roadwaySign(root, course, apex + 2.6, 1, 2.04, 1.95, ['◀  ◀  ◀'], 12),
    roadwaySign(root, course, to + 5.6, -1, 1.89, 2.16, ['FIN DEL DESVÍO'], 7),
  ];
  const arrows = [[from - 4.3, 5.0], [from + 9.0, 5.7], [from + length * 0.31, 4.2],
    [apex - 9, 4.6], [apex + 3.7, 4.6], [to - 23.4, 4.1], [to - 8.0, 4.6]];
  const plant = course.treatmentDetour;
  if (plant) {
    panels.push(
      roadwaySign(root, course, plant.from + 6.3, 1, 2.64, 2.19, ['← DESVÍO', 'RIACHO Y DEPURADORA'], 9),
      roadwaySign(root, course, plant.apex - 10.2, -1, 2.26, 1.99, ['DESAGÜE', 'MARGEN DEL RIACHO'], 10),
      roadwaySign(root, course, plant.to - 54, -1, 2.33, 1.98, ['DEPURADORA', 'SALIDA AL MALECÓN'], 10),
      roadwaySign(root, course, plant.to + 8.8, 1, 2.13, 1.98, ['MALECÓN', 'FIN DEL DESVÍO'], 10),
    );
    arrows.push([course.tunnel.to - 5.8, 7.1], [plant.from + 3.8, 5.3], [plant.from + 20.5, 4.7],
      [plant.from + 47.0, 4.2], [plant.apex - 9.3, 4.3], [plant.apex + 8.9, 4.3],
      [plant.to - 54, 5.5], [plant.to - 34, 5.2], [plant.to - 17.2, 5.3]);
  }
  for (const [s, bend] of arrows) {
    const p = course.sampleAt(s);
    const next = course.sampleAt(s + bend);
    const marking = diquePart(root, stencil, paint, false, 'Flecha pintada en el pavimento');
    marking.position.copy(diqueEdge(course, p, 0, 0.021));
    marking.rotation.set(0, Math.atan2(next.x - p.x, next.z - p.z), -Math.atan(course.bankAt(p.s)), 'YXZ');
  }
  const reflector = new THREE.MeshStandardMaterial({ color: 0xd9a244, emissive: 0xea8e23, emissiveIntensity: 0.24,
    roughness: 0.46, metalness: 0.12 });
  for (const [start, end, step] of [[from, to, 2.9], ...(plant ? [[plant.from, plant.to, 4.2]] : [])]) {
    for (const side of [-1, 1]) {
      for (let s = start + 3.1; s < end - 3.0; s += step) {
        const p = course.sampleAt(s);
        const edge = diqueEdge(course, p, side * (course.roadHalfAt(s) - 0.23), 0.018);
        const marker = box(root, reflector, edge.x, edge.y, edge.z, 0.105, 0.019, 0.19, false);
        marker.rotation.set(0, Math.atan2(p.dx, p.dz), -Math.atan(course.bankAt(p.s)), 'YXZ');
      }
    }
  }
  return {
    setNight(night: boolean) {
      reflector.emissiveIntensity = night ? 0.91 : 0.23;
      for (const panel of panels) if (panel) panel.emissiveIntensity = night ? 0.92 : 0.30;
    },
  };
}
