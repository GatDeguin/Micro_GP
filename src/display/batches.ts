import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type OpaqueMesh = THREE.Mesh<THREE.BufferGeometry, THREE.Material>;

function meshGroups(
  root: THREE.Group,
  keyFor: (geometry: THREE.BufferGeometry) => string | number,
  animated?: ReadonlySet<THREE.Object3D>,
) {
  root.updateWorldMatrix(true, true);
  const groups = new Map<string, OpaqueMesh[]>();
  const pending = [...root.children];
  while (pending.length) {
    const object = pending.pop()!;
    if (!object.visible || animated?.has(object)) continue;
    pending.push(...object.children);
    // Three.js instances also report type "Mesh", with their transforms in a separate buffer.
    if (!(object instanceof THREE.Mesh) || object.constructor !== THREE.Mesh) continue;
    const { geometry, material } = object;
    if (
      Array.isArray(material) || material.transparent ||
      (material instanceof THREE.MeshPhysicalMaterial && material.transmission > 0) ||
      object.customDepthMaterial || object.customDistanceMaterial ||
      geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity ||
      object.matrixWorld.determinant() <= 0
    ) continue;
    const key = [
      keyFor(geometry), material.id, object.castShadow, object.receiveShadow,
      object.renderOrder, object.layers.mask, object.frustumCulled,
    ].join(':');
    const group = groups.get(key);
    if (group) group.push(object);
    else groups.set(key, [object]);
  }
  return [...groups.values()].filter(group => group.length > 1);
}

function replace(root: THREE.Group, sources: OpaqueMesh[], batch: OpaqueMesh) {
  const original = sources[0];
  batch.castShadow = original.castShadow;
  batch.receiveShadow = original.receiveShadow;
  batch.renderOrder = original.renderOrder;
  batch.layers.mask = original.layers.mask;
  batch.frustumCulled = original.frustumCulled;
  for (const source of sources) source.removeFromParent();
  root.add(batch);
}

export function instanceStatic(root: THREE.Group) {
  const groups = meshGroups(root, geometry => geometry.id);
  const worldToRoot = root.matrixWorld.clone().invert();
  const local = new THREE.Matrix4();
  for (const sources of groups) {
    const { geometry, material } = sources[0];
    const batch = new THREE.InstancedMesh(geometry, material, sources.length);
    sources.forEach((source, index) => {
      batch.setMatrixAt(index, local.multiplyMatrices(worldToRoot, source.matrixWorld));
    });
    batch.computeBoundingSphere();
    replace(root, sources, batch);
  }
}

export function mergeStatic(root: THREE.Group, animated: ReadonlySet<THREE.Object3D>) {
  const groups = meshGroups(root, geometry => [
    Boolean(geometry.index), ...Object.keys(geometry.attributes).sort(),
  ].join(','), animated);
  const worldToRoot = root.matrixWorld.clone().invert();
  const local = new THREE.Matrix4();
  for (const sources of groups) {
    const pieces = sources.map(source =>
      source.geometry.clone().applyMatrix4(local.multiplyMatrices(worldToRoot, source.matrixWorld)),
    );
    const geometry = mergeGeometries(pieces);
    for (const piece of pieces) piece.dispose();
    if (geometry) replace(root, sources, new THREE.Mesh(geometry, sources[0].material));
  }
}
