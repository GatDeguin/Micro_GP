import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { compactScenery, originalScenery } from './render-layers';

// Solid-painted pieces can share a draw in split screen. Textured surfaces and luminous parts keep their materials.
export function buildCompactScenery(scene: THREE.Object3D, roots: readonly THREE.Group[], excluded: ReadonlySet<THREE.Object3D>,
  groupSize = 14) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.68, metalness: 0.10 });
  const groups = new Map<string, { pieces: THREE.BufferGeometry[]; cast: boolean; receive: boolean }>();
  const indices = new WeakMap<THREE.BufferGeometry, THREE.BufferAttribute>();
  const local = new THREE.Matrix4();
  const matrix = new THREE.Matrix4();
  const point = new THREE.Vector3();
  const color = new THREE.Color();
  scene.updateMatrixWorld(true);

  function add(object: THREE.Object3D) {
    if (excluded.has(object)) return;
    for (const child of object.children) add(child);
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
    const source = object.material;
    if (!(source instanceof THREE.MeshStandardMaterial) || source instanceof THREE.MeshPhysicalMaterial
      || source.map || source.roughnessMap || source.normalMap || source.bumpMap || source.alphaMap || source.envMap
      || source.emissive.getHex() !== 0 || source.vertexColors || source.transparent || source.alphaTest > 0
      || source.side !== THREE.FrontSide || source.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile
      || source.polygonOffset || !object.geometry.getAttribute('normal')) return;

    const geometry = object.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const instanced = object instanceof THREE.InstancedMesh;
    const count = instanced ? object.count : 1;
    for (let i = 0; i < count; i++) {
      matrix.copy(object.matrixWorld);
      color.copy(source.color);
      if (instanced) {
        object.getMatrixAt(i, local);
        matrix.multiply(local);
        if (object.instanceColor) {
          const tint = object.instanceColor;
          color.r *= tint.getX(i);
          color.g *= tint.getY(i);
          color.b *= tint.getZ(i);
        }
      }
      const piece = new THREE.BufferGeometry();
      const positions = geometry.getAttribute('position').clone();
      piece.setAttribute('position', positions);
      piece.setAttribute('normal', geometry.getAttribute('normal').clone());
      if (!geometry.index && !indices.has(geometry)) {
        const index = positions.count > 65535 ? new Uint32Array(positions.count) : new Uint16Array(positions.count);
        for (let j = 0; j < index.length; j++) index[j] = j;
        indices.set(geometry, new THREE.BufferAttribute(index, 1));
      }
      piece.setIndex(geometry.index ?? indices.get(geometry)!);
      const channels = new Float32Array(positions.count * 3);
      for (let j = 0; j < channels.length; j += 3) {
        channels[j] = color.r;
        channels[j + 1] = color.g;
        channels[j + 2] = color.b;
      }
      piece.setAttribute('color', new THREE.BufferAttribute(channels, 3));
      piece.applyMatrix4(matrix);
      geometry.boundingBox!.getCenter(point).applyMatrix4(matrix);
      const key = `${Math.floor(point.x / groupSize)},${Math.floor(point.z / groupSize)},${object.castShadow},${object.receiveShadow}`;
      const group = groups.get(key);
      if (group) group.pieces.push(piece);
      else groups.set(key, { pieces: [piece], cast: object.castShadow, receive: object.receiveShadow });
    }
    object.layers.set(originalScenery);
  }

  for (const root of roots) add(root);
  for (const { pieces, cast, receive } of groups.values()) {
    const geometry = mergeGeometries(pieces);
    if (!geometry) throw new Error('No se pudo preparar la geometría de pantalla dividida.');
    const mesh = new THREE.Mesh(geometry, material);
    mesh.layers.set(compactScenery);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    scene.add(mesh);
  }
}
