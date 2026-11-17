import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Course } from '../shared/courses.ts';
import type { SpaceportPerson } from './spaceport-people.ts';

export interface SpaceportWorkplaceMaterials {
  metal: THREE.MeshStandardMaterial;
  concrete: THREE.MeshStandardMaterial;
  wood?: THREE.MeshStandardMaterial;
  rubber?: THREE.MeshStandardMaterial;
  glass?: THREE.MeshStandardMaterial;
  paint?: THREE.MeshStandardMaterial;
}

const colors = {
  metal: 0xa8b6b8, steel: 0x536873, dark: 0x23323b, paint: 0x365b70,
  cream: 0xd9ddcf, yellow: 0xd7a544, orange: 0xca6c3b, rubber: 0x25312f,
  wood: 0xb89c70, concrete: 0xa0a497, glass: 0x487d85, green: 0x68826a,
};
const box = new THREE.BoxGeometry(1, 1, 1);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
const sphere = new THREE.SphereGeometry(1, 8, 5);
const ring = new THREE.TorusGeometry(1, .045, 5, 20);
const up = new THREE.Vector3(0, 1, 0);
const identity = new THREE.Quaternion();
const alongZ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
const alongX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
type Surface = 'metal' | 'concrete' | 'wood' | 'rubber' | 'paint' | 'glass' | 'glow';
const point = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Each material is merged once per workplace, with world-space UVs for the supplied PBR maps. */
function makeParts(parent: THREE.Group, materials: Record<Surface, THREE.Material>, name: string) {
  const buckets = new Map<Surface, THREE.BufferGeometry[]>();
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3();
  const direction = new THREE.Vector3(), quaternion = new THREE.Quaternion(), color = new THREE.Color();
  function part(surface: Surface, geometry: THREE.BufferGeometry, x: number, y: number, z: number,
    sx: number, sy: number, sz: number, tint: number, rotation = identity) {
    const copy = geometry.clone();
    if (!copy.index) copy.setIndex(Array.from({ length: copy.attributes.position.count }, (_, i) => i));
    copy.clearGroups();
    copy.applyMatrix4(matrix.compose(position.set(x, y, z), rotation, scale.set(sx, sy, sz)));
    const vertices = copy.attributes.position, normals = copy.attributes.normal;
    const uv = new Float32Array(vertices.count * 2), tints = new Float32Array(vertices.count * 3);
    color.setHex(tint);
    for (let i = 0; i < vertices.count; i++) {
      const nx = Math.abs(normals.getX(i)), ny = Math.abs(normals.getY(i)), nz = Math.abs(normals.getZ(i));
      uv[i * 2] = nx > nz ? vertices.getZ(i) : vertices.getX(i);
      uv[i * 2 + 1] = ny > Math.max(nx, nz) ? vertices.getZ(i) : vertices.getY(i);
      color.toArray(tints, i * 3);
    }
    copy.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    copy.setAttribute('color', new THREE.BufferAttribute(tints, 3));
    const bucket = buckets.get(surface);
    if (bucket) bucket.push(copy); else buckets.set(surface, [copy]);
  }
  return {
    part,
    box(surface: Surface, x: number, y: number, z: number, w: number, h: number, d: number, tint: number, q = identity) {
      part(surface, box, x, y, z, w, h, d, tint, q);
    },
    cylinder(surface: Surface, x: number, y: number, z: number, radius: number, h: number, tint: number, q = identity) {
      part(surface, cylinder, x, y, z, radius, h, radius, tint, q);
    },
    pipe(surface: Surface, a: THREE.Vector3, b: THREE.Vector3, radius: number, tint: number) {
      direction.subVectors(b, a);
      const length = direction.length();
      quaternion.setFromUnitVectors(up, direction.normalize()); position.lerpVectors(a, b, .5);
      part(surface, cylinder, position.x, position.y, position.z, radius, length, radius, tint, quaternion);
    },
    finish() {
      for (const [surface, geometries] of buckets) {
        const geometry = mergeGeometries(geometries);
        for (const piece of geometries) piece.dispose();
        if (!geometry) throw new Error(`Cannot merge ${name}: ${surface}`);
        geometry.computeBoundingBox(); geometry.computeBoundingSphere();
        const mesh = new THREE.Mesh(geometry, materials[surface]); mesh.name = `${name} · ${surface}`;
        mesh.castShadow = surface !== 'glow'; mesh.receiveShadow = surface !== 'glow';
        parent.add(mesh);
      }
    },
  };
}
type Parts = ReturnType<typeof makeParts>;

function crate(d: Parts, x: number, z: number, width: number, depth: number, height: number, y = .02) {
  // Pallet runners touch the apron; all cargo and its straps sit on that pallet.
  for (const dx of [-width * .37, width * .37]) d.box('wood', x + dx, y + .07, z, .15, .14, depth, colors.wood);
  for (let i = 0; i < 5; i++) d.box('wood', x, y + .175, z + (i - 2) * depth / 5, width + .12, .07, depth / 5 - .035, colors.wood);
  d.box('paint', x, y + .21 + height / 2, z, width, height, depth - .08, colors.cream);
  for (const dx of [-width * .29, width * .29]) {
    d.box('rubber', x + dx, y + .21 + height / 2, z + depth / 2 - .025, .065, height + .025, .035, colors.dark);
    d.box('rubber', x + dx, y + .21 + height / 2, z - depth / 2 + .025, .065, height + .025, .035, colors.dark);
    d.box('rubber', x + dx, y + .225 + height, z, .065, .025, depth, colors.dark);
    d.box('metal', x + dx, y + .39, z + depth / 2 + .001, .095, .11, .035, colors.metal);
  }
  d.box('paint', x, y + .35 + height / 2, z + depth / 2 - .02, width * .32, height * .29, .025, colors.yellow);
  for (const dx of [-width * .43, width * .43]) d.box('metal', x + dx, y + .23 + height / 2, z + depth / 2 - .02, .055, height - .06, .04, colors.metal);
}

function bench(d: Parts, x: number, z: number, width = 4.2) {
  for (const dx of [-width / 2 + .15, width / 2 - .15]) for (const dz of [-.36, .36]) {
    d.box('metal', x + dx, .52, z + dz, .085, 1, .085, colors.dark);
    d.box('rubber', x + dx, .05, z + dz, .14, .06, .14, colors.rubber);
  }
  d.box('wood', x, 1.04, z, width, .12, 1.05, colors.wood);
  d.box('metal', x, .33, z, width - .15, .055, .84, colors.steel);
  d.box('metal', x, .86, z + .46, width - .1, .12, .045, colors.paint);
  // A mounted perforated tool board and tools with their handles resting on hooks.
  d.box('paint', x, 1.83, z - .49, width, 1.35, .07, colors.paint);
  for (const dx of [-width * .43, width * .43]) d.box('metal', x + dx, 1.54, z - .50, .055, 1.86, .09, colors.steel);
  for (let i = 0; i < 7; i++) {
    const xx = x - width * .38 + i * width * .126;
    d.box('metal', xx, 2.10, z - .42, .14, .035, .10, colors.metal);
    d.box('metal', xx, 1.91, z - .40, .038, .35 + (i % 3) * .06, .035, colors.metal);
    d.box('rubber', xx, 1.74 - (i % 3) * .03, z - .40, .065, .15, .055, i % 2 ? colors.orange : colors.dark);
  }
  for (const dx of [-1.15, -.5, .15]) {
    d.box('paint', x + dx, .48, z + .02, .48, .25, .60, colors.paint);
    d.box('paint', x + dx, .50, z + .327, .25, .06, .018, colors.cream);
  }
}

function toolChest(d: Parts, x: number, z: number) {
  for (const dx of [-.58, .58]) for (const dz of [-.30, .30]) {
    d.cylinder('rubber', x + dx, .12, z + dz, .10, .07, colors.rubber, alongX);
    d.box('metal', x + dx, .23, z + dz, .055, .17, .06, colors.metal);
  }
  d.box('paint', x, .72, z, 1.40, .96, .78, colors.orange);
  d.box('rubber', x, 1.23, z, 1.45, .07, .81, colors.rubber);
  for (let i = 0; i < 5; i++) {
    d.box('paint', x, .37 + i * .17, z + .405, 1.25, .135, .025, colors.orange);
    d.box('metal', x, .40 + i * .17, z + .426, .91, .024, .035, colors.metal);
  }
  d.pipe('metal', point(x + .84, .85, z - .22), point(x + .84, .85, z + .22), .035, colors.metal);
  for (const dz of [-.22, .22]) d.pipe('metal', point(x + .66, .85, z + dz), point(x + .84, .85, z + dz), .03, colors.metal);
}

function hose(d: Parts, points: readonly (readonly [number, number, number])[], tint = colors.rubber) {
  for (let i = 1; i < points.length; i++) d.pipe('rubber', point(...points[i - 1]), point(...points[i]), .028, tint);
}

function engine(d: Parts, x: number, z: number) {
  const cy = 1.70;
  // Axial rocket engine in a wheel-mounted cradle: the bell is hollow, with an actual inner surface.
  for (const dz of [-1.15, .55]) {
    d.box('paint', x, .27, z + dz, 2.70, .15, .17, colors.orange);
    for (const dx of [-1.13, 1.13]) {
      d.cylinder('rubber', x + dx, .15, z + dz, .13, .12, colors.rubber, alongX);
      d.box('metal', x + dx, .37, z + dz, .12, .30, .13, colors.steel);
      d.pipe('metal', point(x + dx, .45, z + dz), point(x + dx * .39, 1.24, z + dz), .065, colors.metal);
    }
    d.box('rubber', x, 1.11, z + dz, 1.06, .14, .17, colors.rubber);
  }
  for (const dx of [-.83, .83]) d.box('paint', x + dx, .30, z - .30, .12, .14, 2.05, colors.orange);
  d.cylinder('metal', x, cy, z - .65, .54, 1.50, colors.metal, alongZ);
  d.cylinder('metal', x, cy, z - 1.45, .37, .20, colors.steel, alongZ);
  const bell = new THREE.LatheGeometry([
    new THREE.Vector2(.32, -.52), new THREE.Vector2(.42, -.22), new THREE.Vector2(.64, .18),
    new THREE.Vector2(.95, .70), new THREE.Vector2(.88, .70), new THREE.Vector2(.57, .18),
    new THREE.Vector2(.35, -.22), new THREE.Vector2(.25, -.52),
  ], 20);
  d.part('metal', bell, x, cy, z + .57, 1, 1, 1, 0x7f8c8d, alongZ); bell.dispose();
  for (const zz of [z - 1.33, z - .9, z - .15]) {
    d.part('metal', ring, x, cy, zz, .56, .56, .56, colors.steel);
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      d.cylinder('metal', x + Math.cos(angle) * .55, cy + Math.sin(angle) * .55, zz, .035, .12, colors.cream, alongZ);
    }
  }
  d.cylinder('paint', x + .54, 2.22, z - .73, .27, .66, colors.paint, alongZ);
  for (const side of [-1, 1]) {
    d.pipe('metal', point(x + side * .38, 2.08, z - 1.28), point(x + side * .72, 2.25, z - .9), .065, colors.metal);
    d.pipe('metal', point(x + side * .72, 2.25, z - .9), point(x + side * .72, 2.25, z - .10), .065, colors.metal);
    d.pipe('metal', point(x + side * .72, 2.25, z - .10), point(x + side * .40, 2.02, z + .12), .065, colors.metal);
  }
  hose(d, [[x + .6, 1.60, z - 1.1], [x + 1.30, 1.15, z - 1.38], [x + 1.52, .09, z - 1.15],
    [x + 1.65, .06, z - .42], [x + 2.0, .06, z - .10], [x + 2.4, .06, z - .44], [x + 2.5, .06, z - 1.3]]);
}

function workshop(d: Parts) {
  d.box('concrete', -94, -.055, -152.35, 26, .15, 11.3, colors.concrete);
  d.box('paint', -94, 3.3, -157.7, 26, 6.6, .22, colors.cream);
  d.box('paint', -94, .57, -157.565, 26, 1.12, .04, colors.paint);
  for (const x of [-106.2, -99.7, -93.2, -86.7, -81.6]) d.box('metal', x, 3.3, -157.50, .14, 6.6, .16, colors.steel);
  // Raised sliding doors occupy the margins, retaining a broad view into the working bay.
  for (const [x, w] of [[-100.45, 2.10], [-88.45, 1.90]]) {
    d.box('paint', x, 3.29, -149.38, w, 6.54, .15, colors.paint);
    for (let y = .38; y < 6.5; y += .43) d.box('metal', x, y, -149.27, w - .08, .035, .035, colors.steel);
    d.box('paint', x, .44, -149.265, w - .12, .56, .035, colors.yellow);
    for (let xx = x - w / 2 + .2; xx < x + w / 2; xx += .48) d.box('paint', xx, .44, -149.24, .16, .55, .025, colors.dark);
    d.box('metal', x, 1.34, -149.22, .08, .55, .08, colors.metal);
  }
  d.box('metal', -94, 6.62, -149.27, 14.7, .18, .32, colors.steel);
  d.box('metal', -94, .035, -149.30, 14.5, .035, .12, colors.steel);
  for (const x of [-101.6, -87.4]) {
    d.box('metal', x, 3.3, -149.3, .22, 6.6, .28, colors.metal);
    d.box('paint', x, .54, -149.10, .26, 1.08, .15, colors.yellow);
  }
  // Gantry is anchored to four shoes, with an I beam, trolley and taut hoist cable.
  for (const x of [-104.2, -83.8]) for (const z of [-155.5, -151.0]) {
    d.box('metal', x, .09, z, .70, .14, .70, colors.steel);
    d.box('paint', x, 2.91, z, .17, 5.65, .17, colors.yellow);
    d.pipe('metal', point(x, 4.75, z), point(x + (x < -94 ? .85 : -.85), 5.60, z), .055, colors.metal);
  }
  for (const x of [-104.2, -83.8]) d.box('paint', x, 5.68, -153.25, .24, .40, 4.95, colors.yellow);
  for (const y of [5.51, 5.88]) d.box('paint', -94, y, -153.25, 20.9, .10, .42, colors.yellow);
  d.box('paint', -94, 5.69, -153.25, 20.9, .35, .10, colors.yellow);
  for (const x of [-101, -94, -87]) {
    d.box('metal', x, 4.68, -157.2, 3.2, .13, .35, colors.steel);
    for (const dx of [-1.2, 1.2]) d.box('metal', x + dx, 4.68, -157.38, .08, .08, .45, colors.steel);
    d.box('glow', x, 4.60, -157.16, 2.90, .035, .30, 0xe6eaca);
  }

  bench(d, -100.6, -156.75, 4.0);
  bench(d, -88.0, -156.75, 4.4);
  toolChest(d, -98.1, -151.2);
  toolChest(d, -85.0, -152.8);
  engine(d, -94.5, -152.8);
  // A dismantled valve on the first bench and a clamped test article on the second.
  d.box('metal', -100.4, 1.16, -156.62, .67, .12, .50, colors.steel);
  d.cylinder('metal', -100.4, 1.44, -156.62, .24, .46, colors.metal);
  d.cylinder('metal', -100.4, 1.61, -156.62, .30, .07, colors.steel);
  d.box('paint', -88.2, 1.20, -156.65, 1.30, .20, .68, colors.paint);
  for (const x of [-88.62, -87.78]) d.box('metal', x, 1.47, -156.65, .10, .39, .45, colors.metal);
  d.cylinder('metal', -88.2, 1.53, -156.65, .22, .88, colors.metal, alongX);
  d.box('paint', -86.6, 1.38, -156.74, .72, .55, .44, colors.cream);
  d.box('glass', -86.6, 1.42, -156.503, .55, .27, .024, colors.glass);
  for (const x of [-86.82, -86.59, -86.36]) d.cylinder('rubber', x, 1.22, -156.491, .035, .025, colors.dark, alongZ);
  hose(d, [[-86.6, 1.12, -156.5], [-86.8, 1.12, -156.2], [-87.4, 1.12, -156.18], [-88.1, 1.32, -156.4]], colors.orange);

  // Compressor, reel, charging outlet and supported cable run beside the bay.
  d.box('paint', -104.9, .14, -152.5, 1.20, .24, 1.45, colors.paint);
  d.cylinder('paint', -104.9, .66, -152.5, .40, 1.30, colors.orange, alongZ);
  d.box('metal', -104.9, 1.20, -152.65, .48, .48, .62, colors.steel);
  d.cylinder('metal', -104.90, 1.27, -152.31, .16, .08, colors.metal, alongZ);
  d.cylinder('paint', -104.9, 1.27, -152.26, .115, .018, colors.cream, alongZ);
  d.box('paint', -104.9, 1.90, -157.34, .62, .88, .28, colors.paint);
  d.pipe('metal', point(-104.9, 1.48, -157.30), point(-104.9, .20, -157.30), .038, colors.metal);
  hose(d, [[-104.9, .20, -157.30], [-104.9, .06, -156.3], [-105.5, .06, -155.7], [-105.6, .06, -153.5], [-105.1, .60, -152.0]]);
  for (let i = 0; i < 5; i++) d.part('rubber', ring, -103.6, .68, -155.85 + i * .065, .40, .40, .40, colors.rubber);
  d.box('metal', -103.6, .60, -156.05, .13, 1.16, .10, colors.steel);
  d.box('metal', -103.6, .09, -156.05, .70, .13, .65, colors.steel);

  crate(d, -103.9, -148.10, 1.50, 1.30, 1.05);
  crate(d, -102.05, -148.10, 1.25, 1.10, .67);
  crate(d, -82.55, -156.40, 1.35, 1.25, .88);
  crate(d, -82.55, -156.40, 1.05, 1.0, .61, 1.11);
  // Hand cart parked against a crate, with wheels and a supported load.
  for (const dx of [-.36, .36]) {
    d.cylinder('rubber', -104.9 + dx, .20, -149.6, .18, .09, colors.rubber, alongX);
    d.pipe('metal', point(-104.9 + dx, .20, -149.6), point(-104.9 + dx, 1.60, -149.93), .035, colors.metal);
  }
  d.pipe('rubber', point(-105.26, 1.60, -149.93), point(-104.54, 1.60, -149.93), .047, colors.dark);
  d.box('metal', -104.9, .17, -149.35, .84, .07, .58, colors.steel);
  d.box('paint', -104.9, .52, -149.42, .64, .62, .43, colors.cream);
  // Leaning ladder endpoints both meet either the ground or the rear partition.
  for (const dx of [-.33, .33]) d.pipe('metal', point(-106.1 + dx, .02, -155.9), point(-106.1 + dx, 3.18, -157.55), .040, colors.metal);
  for (let i = 1; i <= 8; i++) {
    const y = .02 + 3.16 * i / 9, z = -155.9 - 1.65 * i / 9;
    d.pipe('metal', point(-106.43, y, z), point(-105.77, y, z), .034, colors.steel);
  }
  // Flush paint is confined to the work apron, away from the service-road spur at z=-143.
  for (const x of [-100.8, -87.2]) d.box('paint', x, .024, -148.1, .10, .006, 2.1, colors.yellow);
  d.box('paint', -94, .024, -147.10, 13.6, .006, .10, colors.yellow);
  for (const x of [-102, -86]) {
    d.cylinder('paint', x, .51, -147.35, .105, .98, colors.yellow);
    d.cylinder('rubber', x, .68, -147.35, .11, .16, colors.dark);
    d.cylinder('metal', x, .06, -147.35, .22, .08, colors.steel);
  }
}

function courtyard(d: Parts) {
  d.box('concrete', -164, -.02, -110.8, 10.6, .16, 9.0, colors.concrete);
  for (const x of [-168.4, -165.5, -162.5, -159.6]) d.box('paint', x, .064, -110.8, .025, .006, 8.8, colors.steel);
  for (const z of [-113.8, -110.8, -107.8]) d.box('paint', -164, .064, z, 10.4, .006, .025, colors.steel);
  for (const x of [-168.6, -159.4]) for (const z of [-114.6, -107]) {
    d.box('metal', x, .12, z, .43, .12, .43, colors.steel);
    d.box('metal', x, 1.78, z, .12, 3.35, .12, colors.steel);
  }
  for (const x of [-168.6, -159.4]) d.box('metal', x, 3.43, -110.8, .18, .23, 8.2, colors.steel);
  for (const z of [-114.6, -107]) d.box('metal', -164, 3.43, z, 9.3, .23, .18, colors.steel);
  d.box('paint', -164, 3.12, -106.66, 6.7, .86, .08, colors.paint);
  // Narrow slats leave the tables visible from above and cast a sheltered, dappled edge.
  for (let x = -168.8; x < -159; x += .48) d.box('wood', x, 3.58, -110.8, .24, .12, 8.3, colors.wood);
  for (const z of [-112.5, -109.1]) d.box('metal', -164, 3.42, z, 9.6, .16, .11, colors.steel);
  for (const x of [-166.1, -161.8]) {
    for (const dx of [-.75, .75]) for (const dz of [-.35, .35]) d.box('metal', x + dx, .52, -110.6 + dz, .07, .92, .07, colors.steel);
    for (const dz of [-.30, 0, .30]) d.box('wood', x, 1.01, -110.6 + dz, 2.18, .08, .27, colors.wood);
    for (const dz of [-1, 1]) {
      for (const dx of [-.75, .75]) d.box('metal', x + dx, .28, -110.6 + dz, .08, .44, .39, colors.steel);
      for (const seatZ of [-.14, .14]) d.box('wood', x, .53, -110.6 + dz + seatZ, 2.18, .08, .25, colors.wood);
    }
    // Cups have a dark inset, so their hollow opening is legible at close camera distance.
    for (const [dx, dz] of [[-.55, -.17], [.38, .18]]) {
      d.cylinder('paint', x + dx, 1.14, -110.6 + dz, .075, .18, colors.cream);
      d.cylinder('rubber', x + dx, 1.232, -110.6 + dz, .058, .008, 0x45372b);
      d.part('paint', ring, x + dx + .081, 1.14, -110.6 + dz, .050, .064, .05, colors.cream);
    }
    d.box('paint', x + .13, 1.064, -110.57, .43, .025, .33, colors.paint);
    d.box('paint', x + .13, 1.080, -110.57, .35, .008, .27, colors.cream);
  }
  // The food station sits on the slab's western edge, facing the open circulation aisle.
  d.box('paint', -167.9, 1.14, -113.65, 1.25, 2.16, .75, colors.paint);
  d.box('metal', -167.9, 2.25, -113.65, 1.32, .08, .82, colors.metal);
  d.box('glass', -168.02, 1.53, -113.259, .74, .99, .025, colors.glass);
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
    d.box('paint', -168.26 + col * .24, 1.24 + row * .30, -113.236, .12, .20, .025,
      row % 2 ? colors.orange : colors.cream);
  }
  d.box('rubber', -167.9, .61, -113.25, .69, .25, .04, colors.dark);
  d.box('metal', -167.43, 1.48, -113.23, .13, .42, .04, colors.metal);
  d.box('glow', -167.43, 1.58, -113.204, .08, .10, .012, 0x83c0b3);
  d.box('paint', -165.65, .57, -113.7, 2.02, 1.02, .75, colors.cream);
  d.box('wood', -165.65, 1.12, -113.7, 2.10, .08, .82, colors.wood);
  d.box('paint', -165.9, 1.46, -113.7, .65, .60, .48, colors.dark);
  d.box('metal', -165.9, 1.26, -113.43, .52, .07, .22, colors.metal);
  d.cylinder('paint', -165.9, 1.35, -113.43, .07, .14, colors.cream);
  d.cylinder('paint', -165.05, 1.36, -113.67, .13, .40, colors.metal);
  // Two bins and a compact bicycle rack occupy the south edge, leaving the north walkway clear.
  for (const x of [-159.9, -160.7]) {
    d.box('paint', x, .51, -107.65, .62, .90, .62, x < -160 ? colors.green : colors.paint);
    d.box('metal', x, .98, -107.65, .67, .06, .67, colors.metal);
    d.box('rubber', x, 1.017, -107.65, .36, .014, .26, colors.dark);
  }
  for (let i = 0; i < 3; i++) {
    const x = -167.7 + i * .85;
    d.pipe('metal', point(x, .06, -107.1), point(x, .80, -107.1), .033, colors.metal);
    d.pipe('metal', point(x, .80, -107.1), point(x + .50, .80, -107.1), .033, colors.metal);
    d.pipe('metal', point(x + .50, .80, -107.1), point(x + .50, .06, -107.1), .033, colors.metal);
  }
  for (const x of [-167.3, -165.9]) {
    d.part('rubber', ring, x, .43, -107.35, .35, .35, .35, colors.rubber);
    d.part('metal', ring, x, .43, -107.35, .30, .30, .30, colors.metal);
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI / 3;
      d.pipe('metal', point(x + Math.cos(a) * .30, .43 + Math.sin(a) * .30, -107.35),
        point(x - Math.cos(a) * .30, .43 - Math.sin(a) * .30, -107.35), .008, colors.metal);
    }
  }
  for (const [a, b] of [
    [[-167.3, .43, -107.35], [-166.76, .84, -107.35]], [[-166.76, .84, -107.35], [-166.53, .43, -107.35]],
    [[-166.53, .43, -107.35], [-167.3, .43, -107.35]], [[-166.76, .84, -107.35], [-166.06, .87, -107.35]],
    [[-166.06, .87, -107.35], [-166.53, .43, -107.35]], [[-166.06, .87, -107.35], [-165.9, .43, -107.35]],
  ] as const) d.pipe('paint', point(a[0], a[1], a[2]), point(b[0], b[1], b[2]), .025, colors.orange);
  d.box('rubber', -166.78, .94, -107.35, .25, .07, .15, colors.dark);
  d.pipe('metal', point(-166.05, .85, -107.35), point(-166.08, 1.12, -107.35), .025, colors.metal);
  d.pipe('rubber', point(-166.08, 1.12, -107.54), point(-166.08, 1.12, -107.16), .027, colors.dark);
  d.box('paint', -162.4, 2.13, -114.55, 2.9, 1.24, .12, colors.paint);
  for (const x of [-163.6, -161.2]) d.box('metal', x, 1.12, -114.55, .07, 2.12, .07, colors.steel);
  for (const [x, y] of [[-163.25, 2.35], [-162.38, 2.35], [-161.55, 2.35], [-163.25, 1.87], [-162.38, 1.87]]) {
    d.box('paint', x, y, -114.479, .60, .35, .015, x < -163 ? colors.yellow : colors.cream);
    d.box('paint', x, y + .07, -114.467, .40, .028, .01, colors.paint);
    d.box('paint', x, y - .04, -114.467, .40, .018, .01, colors.steel);
  }
  for (const x of [-166.5, -161.5]) d.box('glow', x, 3.30, -112.5, 1.0, .05, .17, 0xe8dcaf);
}

function inspectionTrolley(parent: THREE.Group, materials: Record<Surface, THREE.Material>) {
  const trolley = new THREE.Group(); trolley.name = 'Inspection trolley · clear overhead service corridor';
  parent.add(trolley);
  const d = makeParts(trolley, materials, 'Inspection trolley');
  d.box('metal', 0, 5.35, -153.25, .82, .30, .62, colors.dark);
  for (const x of [-.27, .27]) for (const z of [-153.51, -152.99]) {
    d.cylinder('metal', x, 5.55, z, .085, .10, colors.metal, alongZ);
  }
  d.cylinder('paint', 0, 5.05, -153.25, .19, .54, colors.orange, alongZ);
  d.pipe('rubber', point(0, 4.96, -153.25), point(0, 3.42, -153.25), .019, colors.dark);
  d.part('metal', ring, 0, 3.29, -153.25, .14, .18, .14, colors.metal);
  d.finish();
  function update(now: number) {
    if (!Number.isFinite(now)) return;
    // A gentle 35-second inspection traverse in the aisle beside the supported motor.
    // The cable stays taut and the hook never approaches either workers or the engine.
    trolley.position.x = -91.4 + Math.sin(now * .00018);
  }
  update(0); return { update };
}

/** Static ambient contact uses one faded atlas batch, including contact on work surfaces. */
function contactShadows(parent: THREE.Group) {
  const size = 32, pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const radius = Math.hypot((x + .5) / size * 2 - 1, (y + .5) / size * 2 - 1);
    const at = (y * size + x) * 4;
    pixels[at] = pixels[at + 1] = pixels[at + 2] = 255;
    pixels[at + 3] = Math.round(Math.max(0, 1 - radius) ** 1.45 * 205);
  }
  const map = new THREE.DataTexture(pixels, size, size); map.needsUpdate = true;
  map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearFilter;
  const material = new THREE.MeshBasicMaterial({ color: 0x172425, map, transparent: true, opacity: .65,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const geometries: THREE.BufferGeometry[] = [];
  function pad(x: number, z: number, w: number, depth: number, y = .026) {
    const geometry = new THREE.PlaneGeometry(w, depth);
    geometry.rotateX(-Math.PI / 2); geometry.translate(x, y, z); geometries.push(geometry);
  }
  for (const [x, z, w, d] of [
    [-94.5, -152.8, 3.4, 3.7], [-98.1, -151.2, 1.7, 1.05], [-85, -152.8, 1.7, 1.05],
    [-100.6, -156.75, 4.4, 1.6], [-88, -156.75, 4.8, 1.6], [-104.9, -152.5, 1.5, 1.9],
    [-103.9, -148.1, 1.8, 1.6], [-102.05, -148.1, 1.6, 1.4], [-82.55, -156.4, 1.7, 1.6],
    [-104.9, -149.5, 1.05, 1.0], [-103.6, -156.05, .95, .9],
    [-100.4, -155.65, .77, .72], [-88.2, -155.65, .77, .72],
  ]) pad(x, z, w, d);
  for (const x of [-104.2, -83.8]) for (const z of [-155.5, -151.0]) pad(x, z, .95, .95);
  for (const x of [-166.1, -161.8]) {
    pad(x, -110.6, 3.0, 3.4, .067);
    for (const dx of [-.75, .75]) for (const dz of [-1, -.35, .35, 1]) pad(x + dx, -110.6 + dz, .30, .43, .068);
    for (const [dx, dz] of [[-.55, -.17], [.38, .18]]) pad(x + dx, -110.6 + dz, .27, .27, 1.056);
  }
  for (const [x, z, w, d] of [[-167.9, -113.65, 1.65, 1.1], [-165.65, -113.7, 2.5, 1.2],
    [-159.9, -107.65, .9, .9], [-160.7, -107.65, .9, .9], [-166.6, -107.35, 2.3, .65]]) pad(x, z, w, d, .067);
  for (const x of [-168.6, -159.4]) for (const z of [-114.6, -107]) pad(x, z, .75, .75, .067);
  pad(-100.4, -156.62, .91, .74, 1.106); pad(-88.2, -156.65, 1.6, .92, 1.106);
  pad(-165.9, -113.7, .9, .72, 1.166);
  const geometry = mergeGeometries(geometries); for (const piece of geometries) piece.dispose();
  if (!geometry) throw new Error('Cannot merge workplace contact shadows');
  const mesh = new THREE.Mesh(geometry, material); mesh.name = 'Workplaces · soft surface contact';
  mesh.renderOrder = 1; parent.add(mesh);
  return { setNight(value: boolean) { material.opacity = value ? .48 : .65; } };
}

/** Two close-up repair poses share three instance batches, including the tools held by their hands. */
function technicians(parent: THREE.Group) {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .83 });
  function batch(name: string, geometry: THREE.BufferGeometry, capacity: number) {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.name = name; mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    parent.add(mesh); return mesh;
  }
  const blocks = batch('Workplace technicians · clothing and connected tools', box, 44);
  const limbs = batch('Workplace technicians · working arms and legs', cylinder, 24);
  const heads = batch('Workplace technicians · faces and helmets', sphere, 8);
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3();
  const color = new THREE.Color(), rotation = new THREE.Quaternion(), direction = new THREE.Vector3();
  const counts = [0, 0, 0], batches = [blocks, limbs, heads];
  function shape(which: number, x: number, y: number, z: number, w: number, h: number, d: number, tint: number, q = identity) {
    const mesh = batches[which], index = counts[which]++;
    matrix.compose(position.set(x, y, z), q, scale.set(w, h, d)); mesh.setMatrixAt(index, matrix);
    color.setHex(tint); mesh.setColorAt(index, color);
  }
  function bone(ax: number, ay: number, az: number, bx: number, by: number, bz: number, width: number, tint: number) {
    direction.set(bx - ax, by - ay, bz - az);
    const length = direction.length(); rotation.setFromUnitVectors(up, direction.normalize());
    shape(1, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, width, length, width, tint, rotation);
  }
  let detailed = true, last = -Infinity;
  function update(now: number) {
    if (!Number.isFinite(now) || now - last < (detailed ? 32 : 100) && now >= last) return;
    last = now; counts.fill(0);
    for (let i = 0; i < 2; i++) {
      const x = i === 0 ? -100.4 : -88.2, z = -155.65;
      const skin = i ? 0xa97858 : 0xdfad88, uniform = i ? 0x446575 : 0x617b78;
      const bend = Math.sin(now * .0018 + i * 1.4) * .025;
      shape(0, x, 1.06, z - .08, .40, .43, .27, uniform);
      shape(0, x, .79, z, .34, .16, .24, colors.dark);
      shape(1, x, 1.31, z - .11, .06, .11, .06, skin);
      shape(2, x, 1.48, z - .13, .125, .145, .125, skin);
      shape(2, x, 1.57, z - .12, .15, .080, .15, colors.yellow);
      shape(0, x, 1.54, z - .17, .31, .025, .29, colors.yellow);
      shape(0, x, 1.49, z - .255, .21, .043, .018, colors.glass);
      shape(0, x, 1.23, z + .063, .27, .042, .018, colors.yellow);
      for (const side of [-1, 1]) {
        const footZ = z + side * .075;
        bone(x + side * .11, .77, z, x + side * .14, .43, z + .035, .075, colors.dark);
        bone(x + side * .14, .43, z + .035, x + side * .15, .13, footZ, .057, colors.dark);
        shape(0, x + side * .15, .08, footZ - .045, .15, .12, .27, colors.dark);
        const handY = side < 0 ? 1.25 : 1.57 + bend, handZ = side < 0 ? -156.35 : -156.59;
        const handX = x + (side < 0 ? -.22 : .12);
        bone(x + side * .24, 1.22, z - .08, x + side * .32, 1.08, z - .37, .062, uniform);
        bone(x + side * .32, 1.08, z - .37, handX, handY, handZ, .050, uniform);
        shape(2, handX, handY, handZ, .064, .065, .060, skin);
        if (side > 0) {
          // Screwdriver blade is seated in the workpiece, while its handle follows the palm.
          bone(handX, handY, handZ, x, 1.62, -156.62, .014, colors.metal);
          shape(0, handX, handY + .025, handZ, .065, .11, .065, colors.orange);
        }
      }
    }
    for (let i = 0; i < batches.length; i++) {
      const mesh = batches[i]; mesh.count = counts[i]; mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor!.needsUpdate = true;
    }
  }
  update(0);
  return { update, setDetail(value: boolean) { detailed = value; } };
}

function signs(parent: THREE.Group) {
  if (typeof document === 'undefined') return;
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256;
  const context = canvas.getContext('2d'); if (!context) return;
  const labels = ['03  /  INTEGRACIÓN DE MOTORES', 'ÁREA DE DESCANSO  /  PERSONAL'];
  for (let i = 0; i < labels.length; i++) {
    context.fillStyle = '#243d4b'; context.fillRect(0, i * 128, 1024, 128);
    context.fillStyle = i ? '#d5b575' : '#6ba1ab'; context.fillRect(0, i * 128 + 112, 1024, 8);
    context.fillStyle = '#e8e7d7'; context.font = '600 42px Arial'; context.textAlign = 'center';
    context.fillText(labels[i], 512, i * 128 + 76, 980);
  }
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshStandardMaterial({ map, roughness: .8, emissive: 0x31434c, emissiveIntensity: .16 });
  const pieces: THREE.BufferGeometry[] = [];
  for (const [i, [x, y, z, w]] of [[-94, 7.32, -149.0, 10.4], [-164, 3.12, -106.60, 6.6]].entries()) {
    const piece = new THREE.PlaneGeometry(w, w / 8);
    const uv = piece.attributes.uv;
    for (let j = 0; j < uv.count; j++) uv.setY(j, uv.getY(j) * .5 + (1 - i) * .5);
    piece.translate(x, y, z); pieces.push(piece);
  }
  const geometry = mergeGeometries(pieces); for (const piece of pieces) piece.dispose();
  if (geometry) { const mesh = new THREE.Mesh(geometry, material); mesh.name = 'Workplaces · departmental signage'; parent.add(mesh); }
}

export function buildSpaceportWorkplaces(parent: THREE.Group, course: Course, source: SpaceportWorkplaceMaterials) {
  const group = new THREE.Group(); group.name = 'Spaceport · taller de integración y patio del personal';
  group.userData.course = course.id; parent.add(group);
  function surface(sourceMaterial: THREE.MeshStandardMaterial, roughness: number, metalness: number) {
    const result = sourceMaterial.clone(); result.vertexColors = true; result.color.setHex(0xffffff);
    result.roughness = result.roughnessMap ? 1 : roughness; result.metalness = metalness; return result;
  }
  const glow = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, toneMapped: false });
  const materials: Record<Surface, THREE.Material> = {
    metal: surface(source.metal, .37, .68), concrete: surface(source.concrete, .92, 0),
    paint: surface(source.paint ?? source.metal, .62, .20), wood: surface(source.wood ?? source.concrete, .86, 0),
    rubber: surface(source.rubber ?? source.concrete, .94, 0), glass: surface(source.glass ?? source.metal, .23, .27), glow,
  };
  const repair = makeParts(group, materials, 'Integration workshop'); workshop(repair); repair.finish();
  const staff = makeParts(group, materials, 'Staff courtyard'); courtyard(staff); staff.finish();
  const working = technicians(group), trolley = inspectionTrolley(group, materials);
  const contact = contactShadows(group); signs(group);
  const people: SpaceportPerson[] = [
    { role: 'scientist', x: -91.2, z: -151.0, y: .02, yaw: -Math.PI / 2, phase: 1.2 },
    { role: 'technician', x: -96.7, z: -148.0, y: .02, yaw: Math.PI, phase: 2.7 },
    { role: 'technician', x: -85.9, z: -147.8, y: .02, yaw: -1.2, phase: 3.9 },
    { role: 'scientist', x: -163.0, z: -113.5, y: .06, yaw: Math.PI, phase: 1.8 },
    { role: 'technician', x: -164.2, z: -112.3, y: .06, yaw: -1.0, phase: 5.0 },
    { role: 'visitor', x: -167.7, z: -112.2, y: .06, yaw: Math.PI, phase: 3.0 },
    { role: 'scientist', x: -169.5, z: -116.5, y: .05, to: [-158.5, -116.5], phase: 7.2 },
    { role: 'technician', x: -162.9, z: -108.4, y: .06, yaw: 1.0, phase: 4.3 },
  ];
  return {
    people,
    update(now: number) { working.update(now); trolley.update(now); },
    setNight(value: boolean) { glow.color.setScalar(value ? 1.55 : .72); contact.setNight(value); },
    setDetail(value: boolean) { working.setDetail(value); },
  };
}
