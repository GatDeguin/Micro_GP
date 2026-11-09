import * as THREE from 'three';
import { box, horizontalShadow, random, standard } from './materials.ts';

const frame = standard(0x58605b, 0.62, 0.42);
const rail = standard(0x9d9d8e, 0.49, 0.47);
const wood = standard(0xb99a71, 0.78);
const seatEdge = standard(0x7d623e, 0.8);
const tread = standard(0x716959, 0.77);
const deckEdge = standard(0xc0b59b, 0.73);
const shoes = standard(0x322a24, 0.91);
const clothes = [0x994a39, 0x5e7577, 0xd7c8a7, 0x656473, 0x976f43, 0x52674b, 0x6d4737]
  .map(color => standard(color, 0.89));
const skin = [0xd0a180, 0xb17d5a, 0x8d5c3d, 0x663f2e].map(color => standard(color, 0.92));
const hair = [0x33251d, 0x574139, 0x72614a].map(color => standard(color, 0.95));
const trousers = [standard(0x424954, 0.91), standard(0x726650, 0.93), standard(0x393835, 0.93)];
const sphere = new THREE.SphereGeometry(1, 10, 7);
const cap = new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.55);
const shirt = new THREE.CylinderGeometry(0.47, 0.42, 1, 8);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
const up = new THREE.Vector3(0, 1, 0);
type Point = [x: number, y: number, z: number];

function piece(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material,
  x: number, y: number, z: number, width: number, height: number, depth: number) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(width, height, depth);
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function rod(parent: THREE.Object3D, material: THREE.Material, from: Point, to: Point, radius: number) {
  const axis = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const tube = piece(parent, cylinder, material, (from[0] + to[0]) / 2, (from[1] + to[1]) / 2,
    (from[2] + to[2]) / 2, radius, axis.length(), radius);
  tube.quaternion.setFromUnitVectors(up, axis.normalize());
}

const rows = [
  { z: 0.66, y: 0.09, occupied: [0, 1, 3, 5, 7, 8, 9] },
  { z: 0.01, y: 0.33, occupied: [0, 2, 3, 4, 6, 7, 9] },
  { z: -0.64, y: 0.57, occupied: [1, 2, 4, 5, 7, 8, 9] },
];
const places = [-2.80, -2.28, -1.76, -1.24, -0.72, 0.72, 1.24, 1.76, 2.28, 2.80];

function seating(parent: THREE.Object3D) {
  for (const center of [-1.73, 1.73]) {
    for (const { z, y } of rows) {
      box(parent, frame, center, y - 0.055, z, 2.78, 0.10, 0.64);
      box(parent, tread, center, y - 0.009, z, 2.78, 0.035, 0.65, false);
      box(parent, deckEdge, center, y + 0.008, z + 0.29, 2.73, 0.017, 0.046, false);
      for (const x of [center - 1.02, center, center + 1.02]) {
        box(parent, frame, x, y + 0.069, z - 0.15, 0.065, 0.16, 0.16, false);
      }
      box(parent, seatEdge, center, y + 0.133, z - 0.15, 2.72, 0.055, 0.31, false);
      box(parent, wood, center, y + 0.16, z - 0.15, 2.76, 0.035, 0.31, false);
      box(parent, wood, center, y + 0.225, z - 0.29, 2.72, 0.082, 0.055, false);
    }
    for (const x of [center - 1.12, center + 1.12]) {
      for (const { z, y } of rows) {
        box(parent, frame, x, y * 0.49, z, 0.085, y, 0.088);
        box(parent, frame, x, 0.028, z, 0.19, 0.051, 0.16, false);
      }
      rod(parent, frame, [x, 0.09, 0.88], [x, 0.56, -0.93], 0.033);
    }
  }
  for (const { z, y } of rows) {
    box(parent, frame, 0, y - 0.062, z, 0.57, 0.115, 0.64);
    box(parent, tread, 0, y - 0.008, z, 0.58, 0.037, 0.65, false);
    box(parent, deckEdge, 0, y + 0.009, z + 0.29, 0.53, 0.018, 0.06, false);
  }
  for (const x of [-3.09, -0.32, 0.32, 3.09]) {
    rod(parent, rail, [x, 0.13, 0.83], [x, 0.59, 0.83], 0.025);
    rod(parent, rail, [x, 0.57, -0.93], [x, 1.04, -0.93], 0.027);
    rod(parent, rail, [x, 0.59, 0.83], [x, 1.04, -0.93], 0.024);
  }
  for (const center of [-1.73, 1.73]) {
    for (const y of [0.81, 1.04]) rod(parent, rail, [center - 1.38, y, -0.93], [center + 1.38, y, -0.93], 0.024);
  }
}

function pennant(figure: THREE.Object3D, hand: Point) {
  rod(figure, seatEdge, hand, [hand[0] + 0.035, hand[1] + 0.159, hand[2]], 0.008);
  const shape = new THREE.BufferGeometry();
  const [x, y, z] = hand;
  shape.setAttribute('position', new THREE.Float32BufferAttribute([
    x + 0.034, y + 0.155, z, x + 0.211, y + 0.118, z - 0.025, x + 0.018, y + 0.083, z,
  ], 3));
  shape.computeVertexNormals();
  const cloth = standard(0xab5437, 0.87);
  cloth.side = THREE.DoubleSide;
  figure.add(new THREE.Mesh(shape, cloth));
}

function spectator(parent: THREE.Object3D, place: Point, variation: number, scale: number, yaw: number,
  pose: 'seated' | 'wave' | 'flag' | 'standing') {
  const figure = new THREE.Group();
  figure.position.set(...place);
  figure.scale.setScalar(scale);
  figure.rotation.y = yaw;
  parent.add(figure);

  const jacket = clothes[variation % clothes.length];
  const pants = trousers[(variation + 1) % trousers.length];
  const face = skin[(variation * 3 + 1) % skin.length];
  const coiffure = variation % 5 === 0 ? clothes[(variation + 4) % clothes.length] : hair[variation % hair.length];
  const standing = pose === 'standing';
  const hip = standing ? 0.285 : 0.188;
  const shoulder = hip + 0.196;
  const headY = shoulder + 0.078;
  piece(figure, shirt, jacket, 0, (hip + shoulder) / 2, -0.004, 0.235, shoulder - hip + 0.034, 0.135);
  piece(figure, sphere, face, 0, headY, 0.008, 0.070, 0.078, 0.067);
  piece(figure, cap, coiffure, 0, headY + 0.017, -0.004, 0.073, 0.064, 0.070);
  for (const side of [-1, 1]) {
    const x = side * 0.057;
    const foot: Point = [x, 0.023, standing ? 0.027 : 0.206];
    const knee: Point = [x + side * 0.007, standing ? 0.155 : 0.123, standing ? 0.012 : 0.164];
    rod(figure, pants, [x, hip + 0.014, 0], knee, 0.037);
    rod(figure, pants, knee, foot, 0.030);
    piece(figure, sphere, shoes, foot[0], foot[1], foot[2] + 0.024, 0.036, 0.021, 0.068);

    const waving = side === 1 && (pose === 'wave' || pose === 'flag');
    const elbow: Point = [side * 0.144, shoulder + (waving ? 0.041 : -0.073), 0.055];
    const hand: Point = waving ? [side * 0.177, shoulder + 0.146, 0.078]
      : [side * 0.115, hip + (standing ? -0.037 : 0.005), standing ? 0.049 : 0.171];
    rod(figure, jacket, [side * 0.087, shoulder - 0.008, 0], elbow, 0.028);
    rod(figure, face, elbow, hand, 0.019);
    piece(figure, sphere, face, ...hand, 0.024, 0.025, 0.021);
    if (side === 1 && pose === 'flag') pennant(figure, hand);
  }
}

export function buildGrandstands(parent: THREE.Object3D) {
  const stands = new THREE.Group();
  stands.name = 'Tribunas y público';
  stands.position.set(-13.65, -0.23, 1.65);
  parent.add(stands);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(6.55, 2.48), horizontalShadow());
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.013;
  stands.add(shadow);
  seating(stands);

  const rng = random(376);
  for (const [row, { z, y, occupied }] of rows.entries()) {
    for (const place of occupied) {
      const pose = row === 2 && place === 2 ? 'flag'
        : (row === 2 && place === 7) || (row === 0 && place === 5) ? 'standing'
          : (row * 3 + place) % 5 === 1 ? 'wave' : 'seated';
      spectator(stands, [places[place], y, z + (pose === 'standing' ? 0.12 : -0.13)], Math.floor(rng() * 121),
        0.93 + rng() * 0.095, (rng() - 0.5) * 0.32, pose);
    }
  }
}
