import * as THREE from 'three';
import type { RaceSnapshot } from '../shared/protocol';
import { TRACK } from '../shared/track';
import { box, canvas2d, horizontalShadow, random, standard, texture } from './materials.ts';
import { crowdCue } from './world-cues';

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
const boardSurface = -0.23;
const pennants = [0xb84f3d, 0x509da5, 0xd6ab50].map(color => new THREE.MeshStandardMaterial({
  color, roughness: 0.87, side: THREE.DoubleSide,
}));
const up = new THREE.Vector3(0, 1, 0);
type Point = [x: number, y: number, z: number];

export const grandstandSections = [{ s: -6.88, offset: -6.7 }, { s: 0, offset: -6.55 }].map(({ s, offset }) => {
  const p = TRACK.sampleAt(s);
  return { x: p.x - p.dz * offset, z: p.z + p.dx * offset, yaw: Math.atan2(-p.dz, p.dx) };
});

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

function pennant(figure: THREE.Object3D, hand: Point, color: number) {
  rod(figure, seatEdge, hand, [hand[0] + 0.035, hand[1] + 0.159, hand[2]], 0.008);
  const shape = new THREE.BufferGeometry();
  const [x, y, z] = hand;
  shape.setAttribute('position', new THREE.Float32BufferAttribute([
    x + 0.034, y + 0.155, z, x + 0.211, y + 0.118, z - 0.025, x + 0.018, y + 0.083, z,
  ], 3));
  shape.computeVertexNormals();
  figure.add(new THREE.Mesh(shape, pennants[color % pennants.length]));
}

function spectator(parent: THREE.Object3D, motion: THREE.Object3D, place: Point, variation: number, scale: number, yaw: number,
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
  let wave: THREE.Group | undefined;
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
    const joint: Point = [side * 0.087, shoulder - 0.008, 0];
    if (waving) {
      const anchor = new THREE.Group();
      anchor.position.copy(figure.position);
      anchor.quaternion.copy(figure.quaternion);
      anchor.scale.copy(figure.scale);
      motion.add(anchor);
      wave = new THREE.Group();
      wave.position.set(...joint);
      anchor.add(wave);
      const local = (point: Point): Point => [point[0] - joint[0], point[1] - joint[1], point[2] - joint[2]];
      rod(wave, jacket, [0, 0, 0], local(elbow), 0.028);
      rod(wave, face, local(elbow), local(hand), 0.019);
      piece(wave, sphere, face, ...local(hand), 0.024, 0.025, 0.021);
      if (pose === 'flag') pennant(wave, local(hand), variation);
    } else {
      rod(figure, jacket, joint, elbow, 0.028);
      rod(figure, face, elbow, hand, 0.019);
      piece(figure, sphere, face, ...hand, 0.024, 0.025, 0.021);
    }
  }
  return wave;
}

export function buildGrandstands(parent: THREE.Object3D, animated: THREE.Object3D = parent) {
  const finish = TRACK.sampleAt(0);
  const waving: THREE.Group[] = [];
  const flashes: THREE.Sprite[] = [];
  const spark = canvas2d(64, 64);
  const glow = spark.context.createRadialGradient(32, 32, 1, 32, 32, 31);
  glow.addColorStop(0, 'rgba(255,255,248,1)');
  glow.addColorStop(0.21, 'rgba(228,241,255,.90)');
  glow.addColorStop(0.54, 'rgba(176,218,255,.25)');
  glow.addColorStop(1, 'rgba(155,193,255,0)');
  spark.context.fillStyle = glow;
  spark.context.fillRect(0, 0, 64, 64);
  const flashMap = texture(spark.canvas);
  const rng = random(376);
  for (const [section, { x, z, yaw }] of grandstandSections.entries()) {
    const stands = new THREE.Group();
    stands.name = `Tribuna de meta ${section + 1}`;
    stands.position.set(x, boardSurface + 0.075, z);
    stands.rotation.y = yaw;
    parent.add(stands);
    const crowd = new THREE.Group();
    crowd.name = 'Banderines y fotógrafos';
    crowd.position.copy(stands.position);
    crowd.quaternion.copy(stands.quaternion);
    animated.add(crowd);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(6.55, 2.48), horizontalShadow());
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -0.068;
    stands.add(shadow);
    box(stands, tread, 0, -0.0375, 0, 6.36, 0.075, 2.06, false);
    seating(stands);

    const plaque = canvas2d(256, 80);
    plaque.context.fillStyle = '#364844'; plaque.context.fillRect(0, 0, 256, 80);
    plaque.context.fillStyle = '#e5c794'; plaque.context.font = '900 35px Arial';
    plaque.context.textAlign = 'center'; plaque.context.textBaseline = 'middle';
    plaque.context.fillText(section ? 'META · B' : 'META · A', 128, 42);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.97, 0.29), new THREE.MeshStandardMaterial({ map: texture(plaque.canvas), roughness: 0.8 }));
    sign.position.set(section ? 2.63 : -2.63, 0.19, 0.99);
    stands.add(sign);

    for (const [row, { z, y, occupied }] of rows.entries()) {
      for (const place of occupied) {
        const pose = (row === 2 && place === 2) || (row === 1 && place === 7) ? 'flag'
          : (row === 2 && place === 7) || (row === 0 && place === 5) ? 'standing'
            : (row * 3 + place + section) % 6 === 1 ? 'wave' : 'seated';
        const wave = spectator(stands, crowd, [places[place], y, z + (pose === 'standing' ? 0.12 : -0.13)],
          Math.floor(rng() * 121), 0.93 + rng() * 0.095, (rng() - 0.5) * 0.32, pose);
        if (wave) waving.push(wave);
      }
    }
    for (const [x, y, z] of [[-2.57, 0.81, -0.24], [1.03, 0.59, 0.56]]) {
      box(stands, frame, x, y - 0.34, z, 0.052, 0.68, 0.056, false);
      box(stands, shoes, x, y, z, 0.18, 0.106, 0.16, false);
      box(stands, rail, x, y + 0.006, z + 0.086, 0.081, 0.065, 0.076, false);
      const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashMap, blending: THREE.AdditiveBlending,
        transparent: true, depthWrite: false, toneMapped: false, opacity: 0 }));
      flash.position.set(x, y + 0.066, z + 0.13);
      flash.scale.setScalar(0.50);
      flash.visible = false;
      crowd.add(flash);
      flashes.push(flash);
    }
  }

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let previous: RaceSnapshot | undefined;
  let pending: ReturnType<typeof crowdCue> = null;
  let reactionAt = -10_000;
  let finishReaction = false;
  return {
    observe(snapshot: RaceSnapshot) {
      const cue = crowdCue(previous, snapshot, finish);
      if (cue) pending = cue;
      if (previous?.heat !== snapshot.heat) reactionAt = -10_000;
      previous = snapshot;
    },
    update(now: number) {
      if (pending && (now - reactionAt > 1150 || pending === 'finish')) {
        finishReaction = pending === 'finish';
        reactionAt = now;
      }
      pending = null;
      const energy = Math.max(0, 1 - (now - reactionAt) / (finishReaction ? 2600 : 1550));
      for (const [i, wave] of waving.entries()) {
        const phase = now * (0.003 + energy * 0.004) + i * 1.27;
        const amount = reduced ? 0.24 : 1;
        wave.rotation.set(Math.cos(phase * 0.74) * (0.05 + energy * 0.2) * amount, 0,
          Math.sin(phase) * (0.11 + energy * 0.51) * amount);
      }
      for (const [i, flash] of flashes.entries()) {
        const age = now - reactionAt - (i % 2) * 224 - Math.floor(i / 2) * 28;
        flash.visible = !reduced && (finishReaction || i % 2 === 0) && age >= 0 && age < 115;
        if (flash.visible) flash.material.opacity = (1 - age / 115) ** 2;
      }
    },
  };
}
