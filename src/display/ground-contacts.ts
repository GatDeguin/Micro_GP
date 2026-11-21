import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvas2d, texture } from './materials';

export type GroundContact = readonly [x: number, y: number, z: number, width: number, depth: number, yaw?: number];

/** Stationary occlusion on the receiving surface, one draw for the batch. */
export function bakeGroundContacts(parent: THREE.Object3D, contacts: readonly GroundContact[]) {
  if (!contacts.length) return;
  const { canvas, context } = canvas2d(48, 48);
  const image = context.createImageData(48, 48);
  for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
    const u = (x + .5) / 24 - 1, v = (y + .5) / 24 - 1;
    const distance = (Math.abs(u) ** 4 + Math.abs(v) ** 4) ** .25;
    image.data.set([12, 17, 20, 132 * (1 - THREE.MathUtils.smoothstep(distance, .60, 1))], (y * 48 + x) * 4);
  }
  context.putImageData(image, 0, 0);
  const material = new THREE.MeshBasicMaterial({ map: texture(canvas), transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const patches = contacts.map(([x, y, z, width, depth, yaw = 0]) => new THREE.PlaneGeometry(width, depth)
    .rotateX(-Math.PI / 2).rotateY(yaw).translate(x, y, z));
  const geometry = mergeGeometries(patches)!;
  for (const patch of patches) patch.dispose();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Oclusión precalculada en apoyos';
  parent.add(mesh);
}
