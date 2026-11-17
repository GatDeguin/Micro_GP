import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** One shared head including ears; no extra object or draw per worker. */
export function crewHeadGeometry() {
  const head = new THREE.SphereGeometry(.5, 12, 5);
  const pieces: THREE.BufferGeometry[] = [head];
  for (const side of [-1, 1]) {
    pieces.push(new THREE.OctahedronGeometry(1).scale(.085, .16, .105).translate(side * .48, -.01, -.015));
  }
  // Both primitives have position/normal/uv, and are indexed consistently.
  const expanded = pieces.map(piece => piece.index ? piece.toNonIndexed() : piece);
  const geometry = mergeGeometries(expanded);
  for (const piece of new Set([...pieces, ...expanded])) piece.dispose();
  return geometry!;
}
