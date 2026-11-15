import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeStatic } from './batches';
import { DIQUE_GROUND, DIQUE_WATER, diqueBeam, diquePart, diqueRoadClear } from './dique-geometry';
import { box, canvas2d, random, standard, texture } from './materials';
import type { Course } from '../shared/courses';

const shipX = 20.4;
const shipZ = 20.9;
const deckY = DIQUE_GROUND + .17;
const dockLoad = new THREE.Vector3(17.7, deckY, 16.90);
const footbridgeStart = new THREE.Vector3(19.89, deckY + .041, 17.72);
const mooring = [8.42, 31.63].map(x => new THREE.Vector3(x, DIQUE_GROUND + .32, 15.12));
const crateLength = 2.65;
const crateDepth = 1.49;
const crateHeight = 1.52;
const legSeconds = 18.65;

type CargoShip = {
  update(now: number): void;
  setNight(night: boolean): void;
  setDetail(detail: boolean): void;
  isTransferring(): boolean;
};

const emptyActivity: CargoShip = { update() {}, setNight() {}, setDetail() {}, isTransferring: () => false };

function part(parent: THREE.Object3D, name: string, x: number, y: number, z: number) {
  const object = new THREE.Group();
  object.name = name;
  object.position.set(x, y, z);
  parent.add(object);
  return object;
}

function fallbackShip() {
  const ship = new THREE.Group();
  const blue = standard(0x286373, .72, .22);
  const oxide = standard(0x8c5542, .82, .27);
  const deck = standard(0x6c6552, .89);
  const cream = standard(0xd6c7a1, .81);
  const amber = standard(0xbb8139, .59, .35);
  const dark = standard(0x333c39, .8);
  const shape = new THREE.Shape([
    [-12.5, 0], [-10.2, 1.88], [-8.1, 2.43], [8.6, 2.47], [12.18, 1.46],
    [12.18, -1.46], [8.6, -2.47], [-8.1, -2.43], [-10.2, -1.88],
  ].map(([x, z]) => new THREE.Vector2(x, -z)));
  const hull = new THREE.ExtrudeGeometry(shape, { depth: 1.95, bevelEnabled: false }).rotateX(-Math.PI / 2);
  const lid = hull.groups[0];
  hull.clearGroups();
  if (lid) hull.setDrawRange(lid.count, hull.getAttribute('position').count - lid.count);
  diquePart(ship, hull, blue).position.y = -.51;
  for (const side of [-1, 1]) {
    box(ship, oxide, .1, 0, side * 2.43, 17.3, .20, .09, false);
    box(ship, deck, -3.8, 1.40, side * 2.04, 9.10, .09, .79, false);
    box(ship, dark, -3.84, 1.38, side * 1.69, 9.17, .61, .14, false);
  }
  box(ship, deck, -3.84, .985, 0, 9.03, .13, 3.34, false);
  box(ship, deck, -9.45, 1.43, 0, 2.24, .07, 3.77, false);
  box(ship, deck, 5.89, 1.42, 0, 10.45, .07, 4.61, false);
  box(ship, cream, 8.19, 2.44, 0, 4.97, 1.99, 3.60, false);
  box(ship, blue, 8.19, 3.47, 0, 5.18, .14, 3.75, false);
  box(ship, dark, 8.16, 3.048, 1.826, 3.98, .35, .084, false);
  box(ship, amber, 2.10, 1.84, -.72, 1.06, .79, .96, false);
  mergeStatic(ship);
  const crane = part(ship, 'DiqueCargoCrane', 2.10, 2.35, -.72);
  const first = part(crane, 'DiqueCargoFirstArm', 0, 0, 0);
  box(first, amber, 0, 0, 2.12, .47, .32, 4.24, false);
  const second = part(first, 'DiqueCargoSecondArm', 0, 0, 4.24);
  box(second, amber, 0, 0, 1.89, .35, .29, 3.78, false);
  part(second, 'DiqueCargoSheave', 0, 0, 3.78);
  part(ship, 'DiqueShipHoldSetdown', -4.97, 1.05, .12);
  part(ship, 'DiqueShipTowForward', -10.73, 1.77, -1.14);
  part(ship, 'DiqueShipTowAft', 10.01, 1.59, -1.52);
  return ship;
}

function buildLanding(parent: THREE.Group) {
  const landing = new THREE.Group();
  landing.name = 'Embarcadero de carga del Dique';
  parent.add(landing);
  const wood = [0x897359, 0x9b8262, 0x7b654b].map(tint => standard(tint, .89));
  const iron = standard(0x434844, .81, .41);
  const fixture = standard(0xad8850, .68, .28);
  const x = 17.58;
  const z = 16.64;
  box(landing, wood[2], x, deckY - .153, z, 6.61, .21, 2.64, false);
  for (let i = 0; i < 13; i++) {
    box(landing, wood[(i % 5) % wood.length], x, deckY - .055, 15.36 + .206 * i, 6.55, .111, .186, false);
  }
  for (const dx of [-2.91, 2.89]) {
    for (const dz of [-.82, .96]) {
      box(landing, wood[2], x + dx, deckY - .8, z + dz, .33, 1.52, .32, false);
      box(landing, iron, x + dx, deckY - .65, z + dz, .36, .118, .36, false);
      box(landing, fixture, x + dx, deckY + .329, z + dz, .093, .66, .095, false);
    }
    for (const dy of [.29, .65]) box(landing, fixture, x + dx, deckY + dy, z + .07, .065, .067, 1.77, false);
    diqueBeam(landing, wood[2], new THREE.Vector3(x + dx, deckY - .63, z + .91),
      new THREE.Vector3(x + dx, deckY - .24, z - .77), .15, .17, false);
  }
  for (const side of [-1, 1]) {
    for (const dx of [-1.47, 1.47]) {
      box(landing, fixture, dockLoad.x + dx, deckY + .008, dockLoad.z + side * .91, .32, .012, .065, false);
      box(landing, fixture, dockLoad.x + dx, deckY + .008, dockLoad.z + side * .765, .060, .012, .24, false);
    }
  }
  const bollard = new THREE.CylinderGeometry(.11, .135, .27, 12);
  const cap = new THREE.CylinderGeometry(.181, .159, .077, 12);
  for (const at of mooring) {
    diquePart(landing, bollard, iron).position.set(at.x, at.y - .127, at.z);
    diquePart(landing, cap, fixture).position.copy(at).y += .026;
    box(landing, iron, at.x, DIQUE_GROUND + .048, at.z, .39, .095, .38, false);
  }
  mergeStatic(landing);
  const gangway = new THREE.Group();
  gangway.name = 'Pasarela móvil del carguero';
  parent.add(gangway);
  box(gangway, iron, 0, -.05, .50, .99, .107, 1.00, false);
  for (let i = 1; i < 10; i++) box(gangway, wood[1], 0, .018, .10 * i, .89, .032, .077, false);
  for (const side of [-1, 1]) {
    for (const z of [.05, .55, .95]) box(gangway, fixture, side * .43, .22, z, .061, .45, .063, false);
    for (const y of [.245, .445]) box(gangway, fixture, side * .43, y, .50, .048, .054, .96, false);
  }
  mergeStatic(gangway);
  return gangway;
}

function cargoBox(parent: THREE.Group) {
  const cargo = new THREE.Group();
  cargo.name = 'Carga del barco · contenedor B-06';
  parent.add(cargo);
  const paint = standard(0xb46845, .74, .28);
  const rib = standard(0xc77d54, .69, .30);
  const steel = standard(0x5c6155, .73, .39);
  box(cargo, paint, 0, crateHeight / 2 + .014, 0, crateLength, crateHeight - .056, crateDepth, false);
  const depth = crateDepth / 2;
  for (const side of [-1, 1]) {
    for (let x = -1.17; x < 1.25; x += .183) {
      box(cargo, rib, x, .79, side * (depth + .009), .07, crateHeight - .20, .069, false);
      if (side > 0) box(cargo, rib, x, crateHeight - .009, 0, .064, .033, crateDepth - .16, false);
    }
    for (const y of [.065, crateHeight - .045]) box(cargo, steel, 0, y, side * depth, crateLength + .023, .087, .084, false);
    for (const x of [-crateLength / 2, crateLength / 2]) {
      box(cargo, steel, x, .754, side * (depth - .015), .099, 1.51, .093, false);
    }
    for (const z of [-.41, .41]) box(cargo, steel, side * (crateLength / 2 + .026), .755, z, .039, 1.29, .056, false);
  }
  mergeStatic(cargo);
  return cargo;
}

function buildHook(parent: THREE.Group) {
  const frame = new THREE.Group();
  frame.name = 'Gancho y balancín de carga del barco';
  parent.add(frame);
  const ochre = standard(0xc8974c, .62, .37);
  const steel = standard(0x554f40, .74, .52);
  box(frame, ochre, 0, .083, 0, 2.46, .132, .193, false);
  for (const x of [-1.05, 1.05]) {
    box(frame, ochre, x, .071, 0, .219, .137, 1.40, false);
    for (const z of [-.60, .60]) box(frame, steel, x, .012, z, .18, .115, .16, false);
  }
  const hook = diquePart(frame, new THREE.TorusGeometry(.099, .037, 6, 11, 1.72 * Math.PI), steel);
  hook.position.set(.014, .231, .009);
  hook.rotation.z = 1.13;
  box(frame, steel, 0, .354, 0, .126, .108, .13, false);
  box(frame, ochre, 0, .438, 0, .339, .164, .188, false);
  mergeStatic(frame);
  return frame;
}

function waterRibbon(parent: THREE.Group) {
  const { canvas, context } = canvas2d(512, 128);
  const rng = random(79223);
  context.save();
  context.translate(256, 64);
  context.scale(4, 1);
  const gradient = context.createRadialGradient(0, 0, 15, 0, 0, 61);
  gradient.addColorStop(0, 'rgba(11,23,27,.87)');
  gradient.addColorStop(.69, 'rgba(11,23,25,.48)');
  gradient.addColorStop(1, 'rgba(7,19,20,0)');
  context.fillStyle = gradient;
  context.fillRect(-64, -64, 128, 128);
  context.restore();
  const edges = [16.1, 111.9];
  for (const [side, y] of edges.entries()) {
    for (let i = 0; i < 62; i++) {
      const x = 18 + rng() * 469;
      const change = 1 + (x / 512 - .50) ** 2 * 158;
      const z = y + (side === 0 ? 1 : -1) * change + 4.2 * (rng() - .5);
      context.lineWidth = .59 + rng() * 1.42;
      context.strokeStyle = i % 5 ? 'rgba(133,182,181,.48)' : 'rgba(182,206,190,.67)';
      context.beginPath();
      context.moveTo(x, z);
      context.quadraticCurveTo(x + 4.1, z + .66, x + 5.0 + rng() ** 2 * 16, z + .32);
      context.stroke();
    }
  }
  const material = new THREE.MeshBasicMaterial({ map: texture(canvas), transparent: true, opacity: .69, depthWrite: false });
  const glints = new THREE.Mesh(new THREE.PlaneGeometry(26.6, 6.10).rotateX(-Math.PI / 2), material);
  glints.name = 'Ondas y contacto de flotación del carguero';
  parent.add(glints);
  return glints;
}

export async function buildDiqueCargoShip(parent: THREE.Group, course: Course): Promise<CargoShip> {
  if (![8.42, 14.26, 20.91, 31.63].every(x => diqueRoadClear(course, x, 15.1, .29))) return emptyActivity;
  const asset = new URL('./assets/dique-barco.glb', import.meta.url).href;
  const model = await new GLTFLoader().loadAsync(asset).then(result => result.scene, fallbackShip);
  const crane = model.getObjectByName('DiqueCargoCrane');
  const first = model.getObjectByName('DiqueCargoFirstArm');
  const second = model.getObjectByName('DiqueCargoSecondArm');
  const sheave = model.getObjectByName('DiqueCargoSheave');
  const hold = model.getObjectByName('DiqueShipHoldSetdown');
  const towForward = model.getObjectByName('DiqueShipTowForward');
  const towAft = model.getObjectByName('DiqueShipTowAft');
  if (!crane || !first || !second || !sheave || !hold || !towForward || !towAft) return emptyActivity;

  const berth = new THREE.Group();
  berth.name = 'Dársena de carga · M/N Dique';
  parent.add(berth);
  const ship = part(berth, 'Carguero atracado Dique', shipX, DIQUE_WATER, shipZ);
  ship.add(model);
  const rigLighting = new Map<THREE.MeshStandardMaterial, number>();
  model.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = false;
    object.receiveShadow = true;
    if (object.material instanceof THREE.MeshStandardMaterial && object.material.emissive.getHex() !== 0) {
      rigLighting.set(object.material, object.material.emissiveIntensity);
    }
  });
  const gangway = buildLanding(berth);
  const cargo = cargoBox(berth);
  const hook = buildHook(berth);
  const ribbon = waterRibbon(berth);
  const lines = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 7, 1),
    standard(0xffffff, .71, .36), 11);
  lines.name = 'Cables de atraque, izado y pistones hidráulicos';
  lines.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  [0x746a4e, 0x746a4e, 0x746a4e, 0x746a4e, 0x746a4e, 0x746a4e, 0x423d33,
    0x9e7537, 0xa1a195, 0x9e7537, 0xa1a195].forEach((color, i) => lines.setColorAt(i, new THREE.Color(color)));
  lines.boundingSphere = new THREE.Sphere(new THREE.Vector3(shipX, .9, 18.0), 16.1);
  berth.add(lines);

  const armLength = second.position.z;
  const knuckleLength = sheave.position.z;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const transform = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  const forward = new THREE.Vector3(0, 0, 1);
  const cargoSetdown = new THREE.Vector3();
  const pulleyTarget = new THREE.Vector3();
  const liftDirection = new THREE.Vector3();
  const conversion = new THREE.Matrix4();
  const intoShip = new THREE.Matrix4();
  const rest = new THREE.Quaternion();
  const rigPoint = (out: THREE.Vector3, object: THREE.Object3D, x: number, y: number, z: number) =>
    out.set(x, y, z).applyMatrix4(object.matrixWorld).applyMatrix4(conversion);
  const placeLine = (slot: number, radius: number) => {
    direction.subVectors(b, a);
    transform.position.copy(a).lerp(b, .5);
    transform.scale.set(radius, direction.length(), radius);
    transform.quaternion.setFromUnitVectors(up, direction.normalize());
    transform.updateMatrix();
    lines.setMatrixAt(slot, transform.matrix);
  };
  const tension = new THREE.Vector3();
  const slack = new THREE.Vector3();
  const link = (start: THREE.Object3D, end: THREE.Object3D, i: number, startOffset: THREE.Vector3, endOffset: THREE.Vector3) => {
    rigPoint(tension, start, startOffset.x, startOffset.y, startOffset.z);
    rigPoint(slack, end, endOffset.x, endOffset.y, endOffset.z);
    a.copy(tension);
    b.lerpVectors(tension, slack, .58);
    placeLine(i, .087);
    a.copy(b);
    b.copy(slack);
    placeLine(i + 1, .045);
  };
  const cylinders = [
    { start: crane, end: first, a: new THREE.Vector3(.33, -.26, -.23), b: new THREE.Vector3(.32, -.20, 2.35) },
    { start: first, end: second, a: new THREE.Vector3(-.24, .164, 2.94), b: new THREE.Vector3(-.23, .155, 1.47) },
  ];
  const fairleads = [towForward, towAft];
  let origin: number | undefined;
  let transferring = false;
  let night = false;

  const update = (now: number) => {
    origin ??= now;
    const seconds = (now - origin) / 1000;
    const t = THREE.MathUtils.euclideanModulo(seconds, legSeconds);
    const reverse = THREE.MathUtils.euclideanModulo(Math.floor(seconds / legSeconds), 2) === 1;
    const travel = THREE.MathUtils.smootherstep(t, 6.22, 10.76);
    const onboard = reverse ? 1 - travel : travel;
    const elevation = THREE.MathUtils.smootherstep(t, 3.93, 6.22) - THREE.MathUtils.smootherstep(t, 10.76, 13.52);
    const slackHeight = 1 - THREE.MathUtils.smootherstep(t, .93, 3.34) + THREE.MathUtils.smootherstep(t, 14.19, 16.91);
    transferring = t >= 3.34 && t < 14.19;

    ship.position.set(shipX + .026 * Math.sin(seconds * .62), DIQUE_WATER + .048 * Math.sin(seconds * 1.71),
      shipZ + .047 * Math.sin(seconds * 1.08));
    ship.rotation.set(.014 * Math.sin(seconds * 1.48), .0033 * Math.sin(seconds * .78), -.0058 * Math.sin(seconds * 1.36));
    berth.updateWorldMatrix(true, false);
    conversion.copy(berth.matrixWorld).invert();
    ship.updateWorldMatrix(false, true);
    rigPoint(cargoSetdown, hold, 0, 0, 0);
    cargo.position.lerpVectors(dockLoad, cargoSetdown, onboard).y += 2.17 * elevation;
    cargo.position.x += .082 * Math.sin(Math.PI * travel) * Math.sin(t * 2.7);
    cargo.quaternion.slerpQuaternions(rest, ship.quaternion, onboard);

    hook.position.set(0, crateHeight, 0).applyQuaternion(cargo.quaternion).add(cargo.position);
    hook.position.y += 1.49 * slackHeight;
    hook.quaternion.copy(cargo.quaternion);
    intoShip.copy(ship.matrix).invert();
    pulleyTarget.set(0, .515, 0).applyQuaternion(hook.quaternion).add(hook.position).applyMatrix4(intoShip).sub(crane.position);
    liftDirection.copy(up).transformDirection(intoShip);
    const nearestVertical = pulleyTarget.dot(liftDirection);
    const reach = armLength + knuckleLength - .058;
    const ceiling = Math.sqrt(Math.max(0, nearestVertical ** 2 + reach ** 2 - pulleyTarget.lengthSq())) - nearestVertical;
    // Shorten the paid-out line near full extension, keeping the hook under the sheave while the deck rolls.
    const payout = Math.min(1.98 - 1.09 * elevation - .27 * slackHeight, Math.max(.06, ceiling));
    pulleyTarget.addScaledVector(liftDirection, payout);
    const radial = Math.hypot(pulleyTarget.x, pulleyTarget.z);
    const squared = radial * radial + pulleyTarget.y * pulleyTarget.y;
    const bend = Math.acos(THREE.MathUtils.clamp((squared - armLength ** 2 - knuckleLength ** 2)
      / (2 * armLength * knuckleLength), -.98, .999));
    crane.rotation.y = Math.atan2(pulleyTarget.x, pulleyTarget.z);
    first.rotation.x = -Math.atan2(pulleyTarget.y, radial) - Math.atan2(knuckleLength * Math.sin(bend), armLength + knuckleLength * Math.cos(bend));
    second.rotation.x = bend;
    crane.updateWorldMatrix(true, true);
    rigPoint(a, sheave, 0, 0, 0);
    b.set(0, .515, 0).applyQuaternion(hook.quaternion).add(hook.position);
    placeLine(6, .026);
    for (const [i, cylinder] of cylinders.entries()) link(cylinder.start, cylinder.end, 7 + i * 2, cylinder.a, cylinder.b);

    for (let i = 0; i < fairleads.length; i++) {
      rigPoint(tension, fairleads[i], 0, 0, 0);
      a.copy(mooring[i]);
      for (let segment = 1; segment <= 3; segment++) {
        const ratio = segment / 3;
        b.lerpVectors(mooring[i], tension, ratio).y -= .22 * Math.sin(Math.PI * ratio);
        placeLine(i * 3 + segment - 1, .034);
        a.copy(b);
      }
    }
    lines.instanceMatrix.needsUpdate = true;

    rigPoint(b, ship, -.52, 1.54, -2.15);
    direction.subVectors(b, footbridgeStart);
    gangway.position.copy(footbridgeStart);
    gangway.scale.z = direction.length();
    gangway.quaternion.setFromUnitVectors(forward, direction.normalize());
    ribbon.position.set(ship.position.x, DIQUE_WATER + .012, ship.position.z);
    ribbon.rotation.y = ship.rotation.y;
    ribbon.material.opacity = (night ? .66 : .78) + .072 * Math.sin(seconds * 1.71 + .72);
  };

  update(0);
  origin = undefined;
  return {
    update,
    setNight(enabled) {
      night = enabled;
      for (const [material, intensity] of rigLighting) material.emissiveIntensity = intensity * (enabled ? 2.43 : .90);
    },
    setDetail(detail) { ribbon.visible = detail; },
    isTransferring() { return transferring; },
  };
}
