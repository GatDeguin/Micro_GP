import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const cube = new THREE.BoxGeometry(1, 1, 1);
const tube = new THREE.CylinderGeometry(1, 1, 1, 8);
const ring = new THREE.TorusGeometry(1, .11, 5, 16);
const up = new THREE.Vector3(0, 1, 0);
const palette = { dark: 0x263334, steel: 0x889492, enamel: 0xc1c1ab, red: 0xa84832,
  yellow: 0xc6a34b, blue: 0x3f6770, rubber: 0x252a28, wood: 0xa1845b };

/** Small service installations, all inside the existing foundation. Two opaque
 * batches per building; baked crevice colour, no extra lights or shadow passes. */
export function buildIndustrialFacade(parent: THREE.Group, width: number, depth: number, height: number,
  paint: THREE.MeshStandardMaterial, metal: THREE.MeshStandardMaterial, workshop = false, wallInset = 0) {
  const group = new THREE.Group(); group.name = 'Instalaciones de fachada · mantenimiento y servicio'; parent.add(group);
  // A narrow, feathered occlusion skirt grounds the wall on its apron. It is
  // stable in motion and does not require a full-screen AO pass per viewport.
  const contactPositions: number[] = [], contactColors: number[] = [], contactIndices: number[] = [];
  for (const [outset, alpha] of [[-.06, .30], [.12, .20], [.40, 0]]) {
    for (const [sx, sz] of [[-1, -1], [-1, 1], [1, 1], [1, -1]]) {
      contactPositions.push(sx * (width / 2 + outset), .013, sz * (depth / 2 + outset));
      contactColors.push(0, 0, 0, alpha);
    }
  }
  for (let band = 0; band < 2; band++) for (let side = 0; side < 4; side++) {
    const a = band * 4 + side, b = band * 4 + (side + 1) % 4;
    contactIndices.push(a, b, a + 4, b, b + 4, a + 4);
  }
  const contact = new THREE.BufferGeometry();
  contact.setAttribute('position', new THREE.Float32BufferAttribute(contactPositions, 3));
  contact.setAttribute('color', new THREE.Float32BufferAttribute(contactColors, 4)); contact.setIndex(contactIndices);
  const contactMesh = new THREE.Mesh(contact, new THREE.MeshBasicMaterial({ vertexColors: true,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 }));
  contactMesh.name = 'Oclusión suave del zócalo'; group.add(contactMesh);
  const pieces: THREE.BufferGeometry[][] = [[], []];
  const wall = width / 2 - wallInset;
  const dummy = new THREE.Object3D(), frame = new THREE.Object3D();
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color(), normal = new THREE.Vector3();
  function orient(x: number, z: number, yaw = 0) {
    frame.position.set(x, 0, z); frame.rotation.y = yaw;
    frame.scale.z = width < 16 && yaw !== 0 ? .60 : 1; frame.updateMatrix();
  }
  function part(geometry: THREE.BufferGeometry, x: number, y: number, z: number,
    sx: number, sy: number, sz: number, tint: number, metallic = false, rotation?: THREE.Quaternion) {
    dummy.position.set(x, y, z); dummy.scale.set(sx, sy, sz);
    dummy.quaternion.copy(rotation ?? new THREE.Quaternion()); dummy.updateMatrix();
    matrix.multiplyMatrices(frame.matrix, dummy.matrix);
    const copy = geometry.clone().applyMatrix4(matrix);
    const positions = copy.getAttribute('position'), normals = copy.getAttribute('normal');
    if (!copy.index) copy.setIndex(Array.from({ length: positions.count }, (_, i) => i));
    const colors = new Float32Array(positions.count * 3), uv = new Float32Array(positions.count * 2);
    for (let i = 0; i < positions.count; i++) {
      normal.fromBufferAttribute(normals, i);
      color.setHex(tint).multiplyScalar(normal.y < -.2 ? .64 : .97).toArray(colors, i * 3);
      uv[i * 2] = (Math.abs(normal.x) > .6 ? positions.getZ(i) : positions.getX(i)) * .45;
      uv[i * 2 + 1] = (Math.abs(normal.y) > .6 ? positions.getZ(i) : positions.getY(i)) * .45;
    }
    copy.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    copy.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); pieces[+metallic].push(copy);
  }
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, tint: number, m = false) => {
    // Only the broad cabinet/tool-case edges need a physical highlight.
    if (Math.min(w, h, d) >= .17) {
      const rounded = new RoundedBoxGeometry(w, h, d, 1, .028);
      part(rounded, x, y, z, 1, 1, 1, tint, m); rounded.dispose();
    } else part(cube, x, y, z, w, h, d, tint, m);
  };
  function pipe(ax: number, ay: number, az: number, bx: number, by: number, bz: number, radius: number, tint = palette.steel) {
    const direction = new THREE.Vector3(bx - ax, by - ay, bz - az);
    const length = direction.length();
    part(tube, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, radius, length, radius,
      tint, true, new THREE.Quaternion().setFromUnitVectors(up, direction.divideScalar(length)));
  }
  // A complete utility face: cabinet seams, hinges, lock, conduits, clamps and valve.
  orient(-wall - .035, -depth * .15, -Math.PI / 2);
  box(0, 1.18, .18, 1.12, 1.48, .33, palette.dark);
  box(0, 1.18, .36, 1.04, 1.39, .05, palette.enamel);
  box(.015, 1.18, .393, .022, 1.33, .018, palette.dark);
  for (const y of [.69, 1.66]) box(-.53, y, .39, .052, .14, .065, palette.steel, true);
  box(.38, 1.17, .406, .035, .20, .045, palette.dark);
  box(-.22, 1.57, .398, .22, .18, .012, palette.yellow);
  for (let i = 0; i < 6; i++) box(0, .71 + i * .054, .399, .72, .018, .016, palette.dark);
  for (const x of [-.31, .31]) {
    pipe(x, .08, .18, x, .44, .18, .043);
    pipe(x, 1.94, .16, x, height - .25, .16, .035);
    for (let y = 2.05; y < height - .2; y += 1.25) box(x, y, .14, .15, .065, .16, palette.dark);
  }
  const valveX = -Math.min(depth * .29, 2.0);
  pipe(valveX, .15, .18, valveX, height - .4, .18, .085, palette.blue);
  for (const y of [.60, 1.36, 2.11]) {
    part(tube, valveX, y, .18, .13, .085, .13, palette.steel, true);
    box(valveX, y + .16, .09, .25, .05, .18, palette.dark);
  }
  pipe(valveX, 1.16, .18, valveX, 1.16, .43, .055);
  part(ring, valveX, 1.16, .47, .19, .19, .19, palette.red, true);
  box(valveX, 1.16, .47, .33, .035, .035, palette.red, true);
  box(valveX, 1.16, .47, .035, .33, .035, palette.red, true);

  // Street-facing condensers have visible fan hubs, louver fins and drain lines.
  orient(wall + .04, depth * .10, Math.PI / 2);
  for (const x of [-.92, .92]) {
    const y = Math.min(height + .15, 2.6);
    box(x, y, .26, 1.54, .90, .49, palette.enamel);
    box(x - .25, y, .515, .73, .73, .025, palette.dark);
    part(ring, x - .25, y, .543, .335, .335, .335, palette.steel, true);
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * 2 / 5;
      part(cube, x - .25 + Math.sin(angle) * .14, y + Math.cos(angle) * .14, .55,
        .12, .30, .018, palette.steel, true, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -angle));
    }
    for (let i = 0; i < 7; i++) box(x + .46, y + (i - 3) * .09, .53, .35, .027, .045, palette.dark);
    for (const dx of [-.55, .55]) {
      box(x + dx, y - .53, .28, .08, .10, .60, palette.steel, true);
      box(x + dx, y - .34, .06, .08, .48, .09, palette.steel, true);
    }
    pipe(x + .70, y - .18, .21, x + .70, .12, .21, .024);
  }
  // Roof access remains on the service side and clear of doors and pedestrian routes.
  orient(wall + .05, -depth / 2 + .75, Math.PI / 2);
  for (const x of [-.28, .28]) {
    pipe(x, .15, .24, x, height + .70, .24, .035);
    for (let y = .6; y < height; y += 1.4) pipe(x, y, 0, x, y, .24, .028);
  }
  for (let y = .28; y < height + .2; y += .29) pipe(-.28, y, .24, .28, y, .24, .026);

  // A wall-mounted fire point, readable at car height, with hose and extinguisher.
  orient(wall + .04, depth * .36, Math.PI / 2);
  box(0, 1.03, .09, .74, 1.40, .17, palette.dark);
  box(0, 1.03, .19, .66, 1.32, .04, palette.enamel);
  part(tube, -.12, .95, .31, .105, .51, .105, palette.red);
  box(-.12, 1.25, .31, .19, .055, .11, palette.dark);
  pipe(-.07, 1.22, .32, .11, 1.17, .34, .018, palette.rubber);
  pipe(.11, 1.17, .34, .13, .83, .34, .018, palette.rubber);
  box(0, 1.82, .10, .76, .30, .07, palette.red);
  box(0, 1.82, .14, .24, .035, .018, palette.enamel);
  box(0, 1.82, .14, .035, .20, .018, palette.enamel);

  if (workshop) {
    // Sheltered outdoor maintenance bench fits within the existing apron; tools
    // have handles, heads and hanging pegs instead of unrecognisable rectangles.
    orient(-wall - .035, depth * .30, -Math.PI / 2);
    box(0, 1.57, .07, 2.30, 1.08, .10, palette.blue);
    for (let x = -1.0; x <= 1.01; x += .2) for (let y = 1.17; y <= 1.98; y += .16)
      box(x, y, .127, .021, .021, .008, palette.dark);
    box(0, .92, .43, 2.42, .11, .80, palette.wood);
    for (const x of [-1.05, 1.05]) box(x, .47, .50, .11, .86, .58, palette.dark);
    box(0, .30, .49, 2.18, .065, .64, palette.blue);
    for (let i = 0; i < 6; i++) {
      const x = -.90 + i * .29;
      box(x, 1.57, .16, .034, .37, .037, i % 2 ? palette.steel : palette.yellow, i % 2 === 1);
      box(x, 1.79, .16, .13, .065, .05, palette.steel, true);
      box(x, 1.98, .18, .025, .028, .12, palette.dark);
    }
    box(.78, 1.02, .47, .31, .15, .27, palette.blue);
    box(.78, 1.12, .47, .36, .08, .16, palette.steel, true);
    pipe(.60, 1.04, .59, 1.03, 1.04, .59, .021);
    box(-.67, 1.05, .45, .45, .15, .32, palette.red);
    box(-.67, 1.16, .45, .26, .065, .035, palette.dark);
  }
  const materials = [paint, metal];
  for (let i = 0; i < pieces.length; i++) {
    const material = materials[i].clone(); material.color.setHex(0xffffff); material.vertexColors = true;
    const geometry = mergeGeometries(pieces[i]);
    for (const piece of pieces[i]) piece.dispose();
    if (!geometry) continue;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true; mesh.name = i ? 'Herrajes y conducciones' : 'Equipo de servicio'; group.add(mesh);
  }
  return group;
}
