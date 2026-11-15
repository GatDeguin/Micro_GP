import * as THREE from 'three';
import type { Course } from '../shared/courses';
import { mergeStatic } from './batches';
import { diquePart, diqueRoadClear } from './dique-geometry';
import { box, canvas2d, standard, texture } from './materials';

const bayAngles = [3.06, 3.71] as const;
const bayLength = 6.14;
const bayWidth = 3.12;
const deckHeight = .104;
const cargoLength = 5.15;
const cargoWidth = 2.19;
const cargoHeight = 2.25;
const halfCycle = 16.1;

type Bearing = { center: THREE.Vector3; yaw: number };

function rotationAt(fraction: number) {
  return THREE.MathUtils.lerp(bayAngles[0], bayAngles[1], fraction);
}

function makeBay(parent: THREE.Group, { center, yaw }: Bearing, name: string) {
  const bay = new THREE.Group();
  bay.name = name;
  bay.position.set(center.x, 0, center.z);
  bay.rotation.y = yaw;
  parent.add(bay);
  const edge = standard(0x72685b, .9);
  const deck = standard(0x575b55, .94);
  const paint = standard(0xc09a51, .82);
  const lamp = new THREE.MeshStandardMaterial({ color: 0xffd492, emissive: 0xffaa49, emissiveIntensity: .35, roughness: .43 });
  box(bay, edge, 0, deckHeight / 2, 0, bayLength, deckHeight, bayWidth, false);
  box(bay, deck, 0, deckHeight - .016, 0, bayLength - .15, .04, bayWidth - .15, false);
  for (const xSign of [-1, 1]) for (const zSign of [-1, 1]) {
    box(bay, paint, xSign * 2.74, deckHeight + .012, zSign * 1.38, .53, .009, .082, false);
    box(bay, paint, xSign * 2.96, deckHeight + .012, zSign * 1.21, .082, .009, .38, false);
  }
  box(bay, edge, 0, deckHeight + .04, 1.398, .56, .085, .21, false);
  box(bay, lamp, 0, deckHeight + .084, 1.424, .29, .022, .094, false);
  mergeStatic(bay);
  return lamp;
}

function makeCargo(parent: THREE.Group) {
  const cargo = new THREE.Group();
  cargo.name = 'Contenedor D-07 · carga móvil';
  parent.add(cargo);
  const painted = standard(0xa74d37, .74, .15);
  const ribs = standard(0xbd6245, .69, .29);
  const steel = standard(0x61594c, .70, .47);
  const halfWidth = cargoWidth / 2;
  const halfLength = cargoLength / 2;
  const bottom = -cargoHeight;
  box(cargo, painted, 0, bottom / 2, 0, cargoLength, cargoHeight - .04, cargoWidth, false);
  for (const side of [-1, 1]) {
    for (const y of [bottom + .11, -.075]) box(cargo, ribs, 0, y, side * (halfWidth + .017), cargoLength + .02, .116, .087, false);
    for (let x = -halfLength + .17; x < halfLength - .10; x += .243) {
      box(cargo, ribs, x, bottom / 2, side * (halfWidth + .019), .093, cargoHeight - .25, .079, false);
      if (side === 1) box(cargo, painted, x, -.020, 0, .085, .058, cargoWidth - .112, false);
    }
    for (const z of [-halfWidth + .042, halfWidth - .042]) {
      box(cargo, steel, side * (halfLength + .014), bottom / 2, z, .097, cargoHeight, .113, false);
    }
  }
  for (const z of [-.76, -.25, .25, .76]) {
    box(cargo, steel, halfLength + .031, bottom * .49, z, .037, cargoHeight - .22, .045, false);
    box(cargo, steel, halfLength + .058, bottom * .61, z + .083, .044, .036, .192, false);
  }
  mergeStatic(cargo);
  const { canvas, context } = canvas2d(128, 40);
  context.fillStyle = '#873c32';
  context.fillRect(0, 0, 128, 40);
  context.fillStyle = '#c7c3a4';
  context.font = '700 29px Arial';
  context.textAlign = 'center';
  context.fillText('D-07', 64, 31);
  const plate = new THREE.MeshStandardMaterial({ map: texture(canvas), roughness: .82 });
  const markings = new THREE.Group();
  cargo.add(markings);
  for (const side of [-1, 1]) {
    const number = diquePart(markings, new THREE.PlaneGeometry(.89, .278), plate);
    number.position.set(1.76 * side, -.66, side * (halfWidth + .068));
    if (side < 0) number.rotation.y = Math.PI;
  }
  mergeStatic(markings);
  return { cargo, markings };
}

function makeSpreader(parent: THREE.Group) {
  const spreader = new THREE.Group();
  spreader.name = 'Aparejo · enganche y travesaños';
  parent.add(spreader);
  const bars = standard(0xd49a3e, .61, .38);
  const dark = standard(0x423e35, .71, .56);
  box(spreader, bars, 0, .13, 0, cargoLength - .68, .19, .41, false);
  for (const x of [-cargoLength / 2 + .31, cargoLength / 2 - .31]) {
    box(spreader, bars, x, .10, 0, .40, .14, cargoWidth - .03, false);
    for (const z of [-cargoWidth / 2 + .15, cargoWidth / 2 - .15]) {
      box(spreader, dark, x, .007, z, .25, .128, .251, false);
    }
  }
  box(spreader, dark, 0, .258, 0, .48, .15, .34, false);
  const hook = diquePart(spreader, new THREE.TorusGeometry(.146, .049, 6, 12, 1.75 * Math.PI), dark);
  hook.position.set(.018, .395, .011);
  hook.rotation.z = 1.03;
  box(spreader, dark, 0, .532, 0, .166, .17, .16, false);
  box(spreader, bars, 0, .685, 0, .87, .28, .41, false);
  for (const x of [-.28, 0, .28]) {
    box(spreader, dark, x, .689, .212, .092, .24, .022, false).rotation.z = -.32;
  }
  mergeStatic(spreader);
  return spreader;
}

function makeCargoShadow(parent: THREE.Group) {
  const { canvas, context } = canvas2d(64, 64);
  const shape = context.createRadialGradient(32, 32, 0, 32, 32, 31);
  shape.addColorStop(0, 'rgba(20,19,16,.90)');
  shape.addColorStop(.63, 'rgba(20,19,16,.58)');
  shape.addColorStop(1, 'rgba(20,19,16,0)');
  context.fillStyle = shape;
  context.fillRect(0, 0, 64, 64);
  const material = new THREE.MeshBasicMaterial({ map: texture(canvas), transparent: true, depthWrite: false });
  const shadow = diquePart(parent, new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), material);
  shadow.receiveShadow = false;
  return { shadow, material };
}

export function buildDiqueCraneActivity(mount: THREE.Group, course: Course, model: THREE.Object3D) {
  mount.add(model);
  const turntable = model.getObjectByName('DiqueCraneTurntable');
  const boom = model.getObjectByName('DiqueCraneBoom');
  const tip = model.getObjectByName('DiqueCraneHoist');
  const stayTop = model.getObjectByName('DiqueCraneStayTop');
  const stayBoom = model.getObjectByName('DiqueCraneStayBoom');
  if (!turntable || !boom || !tip || !stayTop || !stayBoom) return { update() {} };
  turntable.traverse(object => { object.castShadow = false; });

  // The yard stays in the crane site's coordinate system, under the excluded animated group.
  // Cancel the display scale and yaw on the Blender model so the freight keeps its physical proportions.
  const yard = new THREE.Group();
  yard.name = 'Patio de maniobra · bahías A y B';
  mount.updateMatrix();
  yard.matrixAutoUpdate = false;
  yard.matrix.copy(mount.matrix).invert();
  mount.add(yard);
  yard.updateWorldMatrix(true, false);
  const worldToYard = yard.matrixWorld.clone().invert();
  const tipPoint = new THREE.Vector3();
  const relative = (target: THREE.Vector3, anchor: THREE.Object3D, x = 0) =>
    target.set(x, 0, 0).applyMatrix4(anchor.matrixWorld).applyMatrix4(worldToYard);
  const bearingAt = (angle: number, grade = 0) => {
    turntable.rotation.y = angle;
    boom.rotation.x = grade;
    turntable.updateWorldMatrix(true, true);
    relative(tipPoint, tip);
    return Math.atan2(tipPoint.x, tipPoint.z);
  };
  const bays = bayAngles.map(angle => ({ yaw: bearingAt(angle), center: tipPoint.clone() }));
  const corner = new THREE.Vector3();
  // Check both bay decks and the width of the load throughout the swept arc against the actual fence.
  for (let i = 0; i <= 14; i++) {
    const fraction = i / 14;
    const end = i === 0 || i === 14;
    const yaw = bearingAt(rotationAt(fraction), -.036 * Math.sin(Math.PI * fraction));
    const along = end ? bayLength / 2 : cargoLength / 2 + .16;
    const across = end ? bayWidth / 2 : cargoWidth / 2 + .16;
    for (const [x, z] of [[-along, -across], [along, -across], [-along, across], [along, across]]) {
      corner.set(tipPoint.x + x * Math.cos(yaw) + z * Math.sin(yaw), 0,
        tipPoint.z - x * Math.sin(yaw) + z * Math.cos(yaw)).applyMatrix4(yard.matrixWorld);
      if (!diqueRoadClear(course, corner.x, corner.z, .50)) {
        bearingAt(bayAngles[0]);
        yard.removeFromParent();
        return { update() {} };
      }
    }
  }
  const signals = bays.map((bay, index) => makeBay(yard, bay, index === 0 ? 'Bahía A' : 'Bahía B'));
  const { cargo, markings } = makeCargo(yard);
  const spreader = makeSpreader(yard);
  const { shadow, material: shadowMaterial } = makeCargoShadow(yard);
  const cables = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true), standard(0xffffff, .61, .59), 4);
  cables.name = 'Cables del cabrestante y tensores de la pluma';
  const reach = new THREE.Box3().setFromPoints([new THREE.Vector3(), ...bays.map(bay => bay.center)]);
  cables.boundingSphere = reach.expandByScalar(2.6).getBoundingSphere(new THREE.Sphere());
  cables.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < 4; i++) cables.setColorAt(i, new THREE.Color(i < 2 ? 0x35332d : 0x756f60));
  yard.add(cables);
  const column = new THREE.Object3D();
  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const updateLine = (index: number, radius: number) => {
    direction.subVectors(end, start);
    column.position.copy(start).lerp(end, .5);
    column.scale.set(radius, direction.length(), radius);
    column.quaternion.setFromUnitVectors(up, direction.normalize());
    column.updateMatrix();
    cables.setMatrixAt(index, column.matrix);
  };
  let origin: number | undefined;
  let night = false;
  let destination = 0;

  function setSignals() {
    const steady = night ? .92 : .27;
    for (const [index, signal] of signals.entries()) signal.emissiveIntensity = steady + (index === destination ? .90 : 0);
  }

  const update = (now: number) => {
    origin ??= now;
    const elapsed = (now - origin) / 1000;
    const t = THREE.MathUtils.euclideanModulo(elapsed, halfCycle);
    const reverse = THREE.MathUtils.euclideanModulo(Math.floor(elapsed / halfCycle), 2) === 1;
    const progress = THREE.MathUtils.smootherstep(t, 6.6, 10.2);
    const raise = THREE.MathUtils.smootherstep(t, 4.35, 6.6) - THREE.MathUtils.smootherstep(t, 10.2, 12.6);
    const payout = 1 - THREE.MathUtils.smootherstep(t, 1.4, 3.83) + THREE.MathUtils.smootherstep(t, 13.3, 15.6);
    const airborne = Math.sin(Math.PI * progress);
    const swivel = reverse ? 1 - progress : progress;
    const idleSwing = .21 * (1 - THREE.MathUtils.smootherstep(t, .24, 1.38) - THREE.MathUtils.smootherstep(t, 14.20, 15.63));
    const yaw = bearingAt(rotationAt(swivel + (reverse ? -idleSwing : idleSwing)), -.036 * airborne);
    const pendulum = .16 * airborne * Math.sin(t * 2.9);
    const x = tipPoint.x + Math.cos(yaw) * pendulum;
    const z = tipPoint.z - Math.sin(yaw) * pendulum;
    const pitch = .036 * airborne * Math.cos(t * 2.6);
    const roll = .044 * airborne * Math.sin(t * 2.9);
    const aboveBay = progress === 0 || progress === 1 ? bays[swivel] : undefined;
    cargo.position.set(aboveBay?.center.x ?? x, deckHeight + cargoHeight + 3.58 * raise, aboveBay?.center.z ?? z);
    cargo.rotation.set(pitch, aboveBay?.yaw ?? yaw, roll, 'YXZ');
    spreader.position.set(x, cargo.position.y + 2.92 * payout, z);
    spreader.rotation.set(pitch, yaw, roll, 'YXZ');
    for (const [i, side] of [-1, 1].entries()) {
      relative(start, tip, side * .19);
      end.set(side * .24, .818, 0).applyQuaternion(spreader.quaternion).add(spreader.position);
      updateLine(i, .035);
      relative(start, stayTop, side * .47);
      relative(end, stayBoom, side * .40);
      updateLine(i + 2, .029);
    }
    cables.instanceMatrix.needsUpdate = true;
    shadow.position.set(cargo.position.x, progress > .10 && progress < .90 ? .038 : deckHeight + .007, cargo.position.z);
    shadow.rotation.y = cargo.rotation.y;
    shadow.scale.set(cargoLength + 1.6 * raise, 1, cargoWidth + 1.25 * raise);
    shadowMaterial.opacity = (night ? .75 : .92) * (1 - .72 * raise);
    const activeBay = swivel < .5 ? 0 : 1;
    if (activeBay !== destination) {
      destination = activeBay;
      setSignals();
    }
  };

  update(0);
  origin = undefined;
  setSignals();
  return {
    update,
    setNight(enabled: boolean) { night = enabled; setSignals(); },
    setDetail(detail: boolean) { markings.visible = detail; },
  };
}
