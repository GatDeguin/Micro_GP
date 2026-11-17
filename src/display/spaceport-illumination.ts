import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Course } from '../shared/courses.ts';

/** Two local floodlights plus batched, baked pools; one shared sun still owns shadows. */
export function buildSpaceportIllumination(parent: THREE.Group, course: Course) {
  const group = new THREE.Group(); group.name = 'Spaceport · iluminación de competición y plataforma'; parent.add(group);
  const size = 64, pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const r = Math.hypot((x + .5) / size * 2 - 1, (y + .5) / size * 2 - 1), at = (y * size + x) * 4;
    pixels[at] = pixels[at + 1] = pixels[at + 2] = 255;
    pixels[at + 3] = Math.round(Math.max(0, 1 - r) ** 1.65 * 255);
  }
  const map = new THREE.DataTexture(pixels, size, size); map.needsUpdate = true;
  map.minFilter = map.magFilter = THREE.LinearFilter;
  const poolMaterial = new THREE.MeshBasicMaterial({ map, color: 0xffffff, transparent: true,
    blending: THREE.AdditiveBlending, opacity: .035, depthWrite: false, toneMapped: false, vertexColors: true });
  const placements: { position: THREE.Vector3; rotation: THREE.Quaternion; scale: THREE.Vector3; color: number }[] = [];
  const pieces: THREE.BufferGeometry[] = [], basis = new THREE.Matrix4(), tint = new THREE.Color();
  function colored(piece: THREE.BufferGeometry, hex: number) {
    const values = new Float32Array(piece.attributes.position.count * 3); tint.setHex(hex);
    for (let i = 0; i < values.length; i += 3) tint.toArray(values, i);
    piece.setAttribute('color', new THREE.BufferAttribute(values, 3)); pieces.push(piece);
  }
  for (let s = 4; s < course.length; s += 44) {
    // Follow the actual curved deck; a single tangent quad would float above
    // the vertical loops and cut through the banking at its ends.
    const side = Math.floor(s / 22) % 2 ? 1 : -1, positions: number[] = [], uv: number[] = [], indices: number[] = [];
    for (let j = 0; j <= 12; j++) {
      const along = s - 4.6 + j * 9.2 / 12, f = course.frameAt!(along);
      const half = Math.min(3, course.roadHalfAt(along) - .75);
      for (const edge of [-1, 1]) {
        const offset = side * .7 + edge * half;
        positions.push(f.x - f.rx * offset + f.nx * .032, f.y - f.ry * offset + f.ny * .032, f.z - f.rz * offset + f.nz * .032);
        uv.push((edge + 1) / 2, j / 12);
      }
      if (j < 12) { const a = j * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const patch = new THREE.BufferGeometry(); patch.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    patch.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); patch.setIndex(indices); patch.computeVertexNormals(); colored(patch, 0xb8dbea);
  }
  for (const [x, y, z, w, d] of [[-94, .04, -152.4, 13, 8], [-164, .075, -111, 10, 8],
    [-99, .025, -68, 15, 6], [-53, .025, -108, 12, 5]] as const) {
    placements.push({ position: new THREE.Vector3(x, y, z), rotation: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2),
      scale: new THREE.Vector3(w, d, 1), color: 0xffc980 });
  }
  for (const s of course.pit.stalls) {
    const f = course.frameAt!(s, course.pit.stationOffset);
    placements.push({ position: new THREE.Vector3(f.x, .027, f.z - 2.6),
      rotation: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2),
      scale: new THREE.Vector3(10.5, 7.5, 1), color: 0xffd399 });
  }
  const matrix = new THREE.Matrix4();
  placements.forEach(p => colored(new THREE.PlaneGeometry(1, 1).applyMatrix4(matrix.compose(p.position, p.rotation, p.scale)), p.color));
  const poolGeometry = mergeGeometries(pieces)!; for (const piece of pieces) piece.dispose();
  poolGeometry.computeBoundingSphere();
  const pools = new THREE.Mesh(poolGeometry, poolMaterial); pools.name = 'Manchas de luz sobre pista, boxes y edificios'; group.add(pools);

  const steel = new THREE.MeshStandardMaterial({ color: 0x677c84, roughness: .48, metalness: .65 });
  const emissive = new THREE.MeshBasicMaterial({ color: 0xffe5bb, toneMapped: false });
  const poles = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), steel, 8);
  const lenses = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), emissive, 12);
  const rotation = new THREE.Quaternion(), position = new THREE.Vector3(), scale = new THREE.Vector3();
  const floods: THREE.SpotLight[] = [];
  for (const [i, [x, y, z, tx, ty, tz]] of [[-7, 15, -212, 26, 22, -184], [61, 16, -147, 29, 19, -184]].entries()) {
    poles.setMatrixAt(i * 4, matrix.compose(position.set(x, y / 2, z), rotation.identity(), scale.set(.24, y, .24)));
    poles.setMatrixAt(i * 4 + 1, matrix.compose(position.set(x, .07, z), rotation, scale.set(1.7, .3, 1.7)));
    rotation.setFromRotationMatrix(basis.lookAt(new THREE.Vector3(tx, ty, tz), new THREE.Vector3(x, y, z), new THREE.Vector3(0, 1, 0)));
    poles.setMatrixAt(i * 4 + 2, matrix.compose(position.set(x, y, z), rotation, scale.set(2.35, 1.18, .26)));
    poles.setMatrixAt(i * 4 + 3, matrix.compose(position.set(x, y - .75, z), rotation, scale.set(.17, .9, .17)));
    for (let j = 0; j < 6; j++) {
      position.set((j % 3 - 1) * .70, (j < 3 ? -.27 : .27), .16).applyQuaternion(rotation).add(new THREE.Vector3(x, y, z));
      lenses.setMatrixAt(i * 6 + j, matrix.compose(position, rotation, scale.set(.59, .43, .05)));
    }
    const flood = new THREE.SpotLight(i ? 0xc8e7ff : 0xffd7a1, 100, 105, .71, .68, 2);
    flood.position.set(x, y, z); flood.target.position.set(tx, ty, tz); flood.name = 'Reflector de plataforma · sin sombra adicional';
    group.add(flood, flood.target); floods.push(flood);
  }
  poles.name = 'Torres de reflectores'; lenses.name = 'Doce lentes de reflector';
  poles.castShadow = poles.receiveShadow = true; poles.computeBoundingSphere(); lenses.computeBoundingSphere(); group.add(poles, lenses);
  return {
    setNight(night: boolean) {
      poolMaterial.opacity = night ? .30 : .025;
      floods[0].intensity = night ? 3400 : 140; floods[1].intensity = night ? 2400 : 110;
      emissive.color.setHex(night ? 0xffe2ae : 0xe0d4b8).multiplyScalar(night ? 2.2 : .9);
    },
  };
}
