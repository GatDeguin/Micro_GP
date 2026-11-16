import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { diquePlanPoint, type Course } from '../shared/courses';
import { DIQUE_GROUND, diquePart, diqueRoadClear } from './dique-geometry';
import { createDiqueWorkCycle, sampleDiqueWork } from './dique-work-cycle';

export type WorkKind = 'engine' | 'wheel' | 'weld' | 'cargo';

export interface DiqueWorkstation {
  kind: WorkKind;
  name: string;
  position: THREE.Vector3;
  yaw: number;
  phase: number;
  /** Tool contact, relative to the worker's feet; the worker faces local +Z. */
  contact: readonly [number, number, number];
}

const steel = 0x596362;
const zinc = 0xb0b5ad;
const dark = 0x293332;
const rubber = 0x242928;
const blue = 0x426d7b;
const red = 0x9a503c;
const ochre = 0xd4ab51;
const timber = 0x92714e;
const paper = 0xd0bf95;
const carton = 0xad8959;
const up = new THREE.Vector3(0, 1, 0);
const forward = new THREE.Vector3(0, 0, 1);
const identity = new THREE.Quaternion();
const flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
const unitRing = new THREE.TorusGeometry(1, .13, 6, 20);
const tireGeometry = new THREE.TorusGeometry(.275, .073, 7, 24);
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// All solid details share one vertex-colour finish: four static draws before the
// scene's spatial merge, without a separate material or texture for every fitting.
function batch(parent: THREE.Object3D, material: THREE.MeshStandardMaterial, name: string) {
  const pieces: THREE.BufferGeometry[] = [];
  const transform = new THREE.Matrix4();
  const color = new THREE.Color();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  function part(geometry: THREE.BufferGeometry, x: number, y: number, z: number,
    sx: number, sy: number, sz: number, tone: number, orientation = identity) {
    const copy = geometry.clone();
    copy.deleteAttribute('uv');
    copy.clearGroups();
    copy.applyMatrix4(transform.compose(position.set(x, y, z), orientation, scale.set(sx, sy, sz)));
    const colors = new Float32Array(copy.getAttribute('position').count * 3);
    color.setHex(tone);
    for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
    copy.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    pieces.push(copy);
  }
  return {
    part,
    box: (x: number, y: number, z: number, w: number, h: number, d: number, tone: number, orientation = identity) =>
      part(unitBox, x, y, z, w, h, d, tone, orientation),
    cylinder: (x: number, y: number, z: number, radius: number, height: number, tone: number, orientation = identity) =>
      part(unitCylinder, x, y, z, radius, height, radius, tone, orientation),
    ring: (x: number, y: number, z: number, radius: number, tone: number, orientation = identity) =>
      part(unitRing, x, y, z, radius, radius, radius, tone, orientation),
    pipe(a: THREE.Vector3, b: THREE.Vector3, radius: number, tone: number) {
      direction.subVectors(b, a);
      const length = direction.length();
      rotation.setFromUnitVectors(up, direction.normalize());
      position.lerpVectors(a, b, .5);
      part(unitCylinder, position.x, position.y, position.z, radius, length, radius, tone, rotation);
    },
    finish() {
      const geometry = mergeGeometries(pieces);
      for (const piece of pieces) piece.dispose();
      if (geometry) diquePart(parent, geometry, material, true, name);
    },
  };
}

type Parts = ReturnType<typeof batch>;

// Small raised stencil plates remain legible close up and require no canvas atlas.
const glyphs: Record<string, readonly string[]> = {
  A: ['010', '101', '111', '101', '101'], B: ['110', '101', '110', '101', '110'],
  C: ['011', '100', '100', '100', '011'], G: ['011', '100', '101', '101', '011'],
  I: ['111', '010', '010', '010', '111'], L: ['100', '100', '100', '100', '111'],
  M: ['101', '111', '111', '101', '101'], O: ['010', '101', '101', '101', '010'],
  R: ['110', '101', '110', '101', '101'], T: ['111', '010', '010', '010', '010'],
};

function label(d: Parts, title: string, x: number, y: number, z: number, unit = .013) {
  const width = (title.length * 4 + 1) * unit;
  d.box(x, y, z, width, unit * 7.6, .012, dark);
  for (const [i, letter] of [...title].entries()) {
    for (const [row, line] of glyphs[letter].entries()) for (let column = 0; column < 3; column++) {
      if (line[column] === '1') d.box(x - (i * 4 + column - (title.length * 4 - 2) / 2) * unit,
        y + (2 - row) * unit, z - .009, unit * .83, unit * .83, .006, paper);
    }
  }
}

function hose(d: Parts, points: readonly THREE.Vector3[], radius = .017, tone = rubber) {
  for (let i = 1; i < points.length; i++) d.pipe(points[i - 1], points[i], radius, tone);
}

function mat(d: Parts) {
  // The station origin is the top of this mat, so boots have physical contact.
  d.box(0, -.009, .02, .77, .018, .67, rubber);
  for (let i = -4; i <= 4; i++) d.box(i * .071, .001, .02, .023, .002, .57, dark);
}

function bench(d: Parts, width: number, top: number, color: number) {
  for (const x of [-width / 2 + .085, width / 2 - .085]) for (const z of [.49, 1.04]) {
    d.box(x, (top - .078) / 2, z, .068, top - .042, .068, dark);
    d.box(x, 0, z, .13, .036, .12, rubber);
    d.box(x, top - .12, z - .04, .036, .037, .021, zinc);
  }
  d.box(0, .21, .765, width - .13, .044, .59, color);
  d.box(0, top - .035, .765, width, .07, .76, timber);
  d.box(0, top - .095, .405, width - .12, .11, .045, color);
  d.box(0, top + .015, 1.13, width, .10, .025, steel);
}

function engineBench(d: Parts) {
  mat(d);
  bench(d, 1.61, .65, red);
  label(d, 'MOTOR', -.30, .545, .377);
  // Open cylinder head, coolant jacket, casting ribs and six exposed fasteners.
  d.box(.13, .675, .78, .72, .05, .53, dark);
  d.box(.13, .782, .78, .64, .17, .48, steel);
  for (const x of [-.19, .45]) d.box(x, .866, .78, .055, .14, .51, zinc);
  for (const z of [.545, 1.015]) d.box(.13, .866, z, .64, .14, .044, zinc);
  for (const x of [-.08, .13, .34]) {
    d.cylinder(x, .857, .79, .074, .109, dark);
    d.ring(x, .912, .79, .074, zinc, flat);
    d.cylinder(x, .879, .79, .047, .008, rubber);
    for (const z of [.56, 1.0]) {
      d.cylinder(x, .934, z, .027, .034, zinc);
      d.cylinder(x, .954, z, .014, .004, dark);
    }
  }
  for (let i = 0; i < 5; i++) d.box(-.22, .725 + i * .027, .79, .021, .013, .44, zinc);
  d.pipe(v(.46, .79, .85), v(.57, .74, .87), .033, ochre);
  hose(d, [v(.57, .74, .87), v(.66, .65, .91), v(.71, .36, .98), v(.69, .23, .83)]);
  d.cylinder(.69, .23, .83, .027, .055, zinc);
  // Parts tray, sockets, oil tin and a folded rag on the lower shelf.
  d.box(-.56, .668, .77, .34, .028, .34, dark);
  for (const x of [-.67, -.58, -.49]) d.cylinder(x, .699, .78, .023, .041, zinc);
  d.box(-.47, .273, .80, .34, .075, .30, paper);
  d.cylinder(.31, .338, .87, .075, .21, red);
  d.cylinder(.31, .451, .87, .031, .022, zinc);
  d.pipe(v(.31, .455, .87), v(.39, .49, .87), .013, zinc);
  d.box(.59, .674, .60, .22, .032, .16, blue);
  d.box(.59, .694, .60, .17, .012, .11, paper);
  // A vice grips a spare head bracket instead of an unsupported block.
  d.box(-.66, .698, .47, .18, .09, .15, blue);
  for (const x of [-.71, -.59]) d.box(x, .768, .47, .048, .07, .18, zinc);
  d.pipe(v(-.81, .72, .47), v(-.57, .72, .47), .019, zinc);
  d.pipe(v(-.81, .66, .47), v(-.81, .78, .47), .012, zinc);
}

function wheelMachine(d: Parts) {
  mat(d);
  d.box(.13, .036, .97, .88, .108, .80, dark);
  d.box(.13, .345, 1.0, .67, .53, .59, blue);
  d.box(.13, .64, 1.0, .72, .10, .66, steel);
  d.box(.13, .79, 1.02, .22, .26, .28, dark);
  d.cylinder(.13, .80, .79, .046, .48, zinc, flat);
  for (const x of [-.15, .41]) d.cylinder(x, .075, .72, .035, .037, zinc);
  for (const y of [.23, .31, .39]) d.box(.13, y, .699, .33, .031, .016, dark);
  label(d, 'BAL', .13, .521, .694, .018);
  // Rear control column, gauge face and rim-weight storage bins.
  d.box(-.40, .92, 1.06, .065, .65, .08, steel);
  d.box(-.40, 1.20, 1.02, .34, .24, .10, blue);
  d.cylinder(-.40, 1.215, .959, .077, .018, paper, flat);
  d.ring(-.40, 1.215, .946, .079, zinc);
  for (let i = -1; i <= 1; i++) d.box(-.41 + i * .081, 1.126, .959, .031, .023, .021, i ? dark : red);
  d.box(.68, .80, .96, .34, .04, .38, steel);
  d.box(.68, .755, .96, .045, .08, .045, zinc);
  for (const z of [.83, .96, 1.09]) {
    d.box(.68, .835, z, .31, .07, .022, dark);
    for (const x of [.58, .68, .78]) d.box(x, .836, z - .043, .043, .023, .036, zinc);
  }
  // Connected air line and a coiled hose sit behind the machine, clear of feet.
  d.cylinder(-.20, .26, .681, .025, .043, zinc, flat);
  hose(d, [v(-.20, .26, .66), v(-.39, .13, .61), v(-.57, .03, .73), v(-.61, .03, 1.15)]);
  d.ring(-.60, .032, 1.15, .17, rubber, flat);
  d.ring(-.60, .061, 1.15, .16, rubber, flat);
  d.box(.83, .066, .37, .23, .168, .31, blue);
  d.box(.83, .157, .36, .18, .014, .23, rubber);
}

function weldBench(d: Parts) {
  mat(d);
  // Trestles carry both plate halves and leave a visible butt-weld seam.
  for (const x of [-.64, .75]) {
    for (const z of [.39, .99]) d.pipe(v(x, .025, z), v(x, .70, .69), .035, steel);
    d.box(x, .25, .69, .055, .055, .56, blue);
    d.box(x, .71, .69, .12, .065, .90, steel);
    for (const z of [.39, .99]) d.box(x, .006, z, .15, .048, .12, dark);
  }
  d.box(.08, .764, .446, 1.68, .072, .218, steel);
  d.box(.08, .764, .793, 1.68, .072, .466, steel);
  d.box(.08, .791, .558, 1.68, .013, .012, dark);
  for (const x of [-.51, -.39, -.27]) d.cylinder(x, .802, .558, .013, .008, zinc);
  // Two screw clamps secure the work, with a connected earth clamp at the rear.
  for (const x of [-.64, .75]) {
    d.box(x, .779, 1.03, .075, .15, .06, red);
    d.box(x, .84, .98, .075, .024, .14, red);
    d.cylinder(x, .815, .94, .019, .12, zinc);
    d.pipe(v(x - .06, .879, .94), v(x + .06, .879, .94), .010, zinc);
  }
  d.box(-.72, .82, .80, .10, .034, .19, ochre);
  hose(d, [v(-.72, .82, .80), v(-.94, .62, .92), v(-1.01, .04, .73), v(-1.26, .04, .40), v(-1.24, .24, .36)]);
  // MIG unit: trolley wheels, vents, lead sockets and a chained gas bottle.
  d.box(-1.25, .245, .41, .39, .34, .52, blue);
  d.box(-1.25, .43, .41, .31, .03, .38, zinc);
  for (const x of [-1.42, -1.08]) d.cylinder(x, .053, .41, .071, .06, rubber,
    new THREE.Quaternion().setFromAxisAngle(forward, Math.PI / 2));
  for (let i = 0; i < 5; i++) d.box(-1.25, .18 + i * .028, .142, .23, .012, .01, dark);
  for (const x of [-1.35, -1.15]) d.cylinder(x, .34, .139, .026, .021, zinc, flat);
  label(d, 'MIG', -1.25, .40, .14, .010);
  d.cylinder(-1.27, .48, .96, .115, .91, dark);
  d.cylinder(-1.27, .004, .96, .125, .044, rubber);
  d.cylinder(-1.27, .95, .96, .066, .04, zinc);
  d.cylinder(-1.27, 1.0, .96, .023, .07, ochre);
  d.pipe(v(-1.34, 1.02, .96), v(-1.20, 1.02, .96), .017, red);
  d.ring(-1.27, .57, .96, .12, zinc, flat);
  hose(d, [v(-1.24, .99, .96), v(-1.08, .88, .95), v(-1.04, .49, .68), v(-1.25, .44, .60)], .012);
  // PPE shelf with spare gauntlets and face shield, away from the hot workpiece.
  d.box(1.15, .39, .88, .36, .08, .39, timber);
  for (const x of [1.03, 1.27]) d.box(x, .171, .88, .045, .378, .25, steel);
  for (const x of [1.03, 1.16]) d.box(x, .449, .78, .09, .038, .15, ochre);
  d.box(1.23, .55, .98, .17, .24, .10, dark);
  d.box(1.23, .58, .921, .13, .078, .014, blue);
}

function cargoBench(d: Parts) {
  mat(d);
  bench(d, 1.54, .65, blue);
  label(d, 'CARGA', -.22, .545, .377);
  d.box(.13, .783, .68, .60, .266, .47, carton);
  d.box(.13, .918, .68, .067, .008, .48, paper);
  d.box(.13, .786, .439, .067, .269, .008, paper);
  d.box(.29, .80, .435, .145, .095, .008, paper);
  for (let i = 0; i < 7; i++) d.box(.236 + i * .017, .80, .429, i % 3 ? .006 : .010, .054, .004, dark);
  d.box(-.49, .671, .76, .30, .035, .39, dark);
  d.box(-.49, .692, .75, .265, .008, .34, paper);
  for (const z of [.66, .73, .80]) d.box(-.49, .699, z, .19, .003, .005, blue);
  d.cylinder(.65, .68, .88, .073, .065, ochre);
  d.cylinder(.65, .716, .88, .033, .009, paper);
  // Pallet, strapped cases and a hand truck form a completed-outbound stack.
  for (const x of [.98, 1.39, 1.80]) d.box(x, .046, .83, .12, .128, .95, timber);
  for (let i = 0; i < 5; i++) d.box(1.39, .13, .43 + i * .20, 1.08, .04, .15, carton);
  for (const x of [1.15, 1.64]) {
    d.box(x, .345, .83, .45, .38, .71, carton);
    d.box(x, .542, .83, .043, .012, .72, dark);
    d.box(x, .345, .467, .043, .38, .012, dark);
  }
  d.box(1.39, .70, .87, .68, .30, .58, timber);
  for (const x of [1.16, 1.62]) d.box(x, .70, .57, .039, .30, .023, ochre);
  d.box(1.39, .856, .87, .70, .013, .60, carton);
  for (const x of [-1.08, -.78]) {
    d.pipe(v(x, .13, 1.02), v(x, 1.04, 1.18), .023, blue);
    d.cylinder(x, .087, 1.0, .105, .063, rubber,
      new THREE.Quaternion().setFromAxisAngle(forward, Math.PI / 2));
  }
  d.pipe(v(-1.08, 1.04, 1.18), v(-.78, 1.04, 1.18), .028, rubber);
  d.box(-.93, .057, .85, .42, .034, .37, zinc);
  d.box(-.48, .31, .80, .27, .16, .30, carton);
  d.box(.13, .26, .80, .35, .06, .30, paper);
}

export function buildDiqueWorkstations(props: THREE.Group, course: Course, authoredGarage: boolean) {
  const finish = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .66, metalness: .23 });
  finish.name = 'Bancos de trabajo, herrajes y herramientas';
  const status = new THREE.MeshBasicMaterial({ color: 0x86b787 });
  const animated = new THREE.Group();
  animated.name = 'Maquinaria en funcionamiento de los talleres';
  props.add(animated);
  const stations: DiqueWorkstation[] = [];
  let wheel: THREE.Group | undefined;
  let needle: THREE.Group | undefined;
  let wheelPhase = 0;
  const orientation = new THREE.Quaternion();

  function station(kind: WorkKind, name: string, parent: THREE.Object3D, local: THREE.Vector3,
    localYaw: number, phase: number, contact: DiqueWorkstation['contact'], make: (d: Parts) => void) {
    const frame = new THREE.Group();
    frame.name = name;
    frame.position.copy(local);
    frame.rotation.y = localYaw;
    parent.add(frame);
    frame.updateWorldMatrix(true, false);
    const position = frame.getWorldPosition(new THREE.Vector3());
    frame.getWorldQuaternion(orientation);
    const direction = forward.clone().applyQuaternion(orientation);
    const yaw = Math.atan2(direction.x, direction.z);
    stations.push({ kind, name, position, yaw, phase, contact });
    const d = batch(frame, finish, name + ' · equipo y útiles');
    make(d);
    d.finish();
    return frame;
  }

  const floor = (authoredGarage ? .913 : .948) + .018;
  const firstBay = props.getObjectByName('Box 1');
  if (firstBay) station('engine', 'Ajuste de culata · Box 01', firstBay, v(-1.25, floor, 2.10), Math.PI,
    1.1, [.13, .956, .56], engineBench);
  const secondBay = props.getObjectByName('Box 2');
  if (secondBay) {
    const frame = station('wheel', 'Equilibrado de rueda · Box 02', secondBay, v(.05, floor, 2.10), Math.PI,
      4.6, [.13, .80, .47], wheelMachine);
    const moving = new THREE.Group();
    moving.name = 'Rueda y lectura del equilibrador';
    animated.add(moving);
    animated.updateWorldMatrix(true, false);
    moving.position.copy(animated.worldToLocal(frame.getWorldPosition(new THREE.Vector3())));
    moving.quaternion.copy(animated.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(frame.getWorldQuaternion(new THREE.Quaternion())));
    wheel = new THREE.Group();
    wheel.position.set(.13, .80, .67);
    wheel.name = 'Neumático, llanta y cierre sobre el eje';
    moving.add(wheel);
    const rim = batch(wheel, finish, 'Llanta de cinco radios y banda de rodadura');
    rim.part(tireGeometry, 0, 0, 0, 1, 1, 1.50, rubber);
    for (const z of [-.106, .106]) rim.ring(0, 0, z, .223, zinc);
    rim.cylinder(0, 0, -.03, .070, .24, steel, flat);
    rim.cylinder(0, 0, -.18, .084, .055, ochre, flat);
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * .4;
      rim.pipe(v(Math.cos(angle) * .055, Math.sin(angle) * .055, -.10),
        v(Math.cos(angle) * .215, Math.sin(angle) * .215, -.10), .027, zinc);
      rim.cylinder(Math.cos(angle) * .050, Math.sin(angle) * .050, -.161, .012, .014, zinc, flat);
    }
    for (let i = 0; i < 24; i++) {
      const angle = i * Math.PI / 12;
      rim.box(Math.cos(angle) * .344, Math.sin(angle) * .344, 0, .021, .037, .15, dark,
        new THREE.Quaternion().setFromAxisAngle(forward, angle));
    }
    rim.box(.284, 0, -.10, .041, .020, .015, ochre);
    rim.finish();
    needle = new THREE.Group();
    needle.position.set(-.40, 1.215, .934);
    moving.add(needle);
    const pointer = batch(needle, finish, 'Aguja del equilibrador');
    pointer.pipe(v(0, 0, 0), v(0, .055, 0), .006, red);
    pointer.cylinder(0, 0, -.002, .012, .008, dark, flat);
    pointer.finish();
    const light = diquePart(moving, new THREE.SphereGeometry(.020, 8, 5), status);
    light.name = 'Piloto de equilibrado';
    light.position.set(-.29, 1.20, .955);
    wheelPhase = 4.6;
  }

  const yardPlaces = [
    ['weld', 'Soldadura de chapas · repuestos del pórtico', 'Almacén de repuestos del pórtico oeste', 51.25, 30.5, -.2, 2.40, 7.3, [.13, .80, .56], weldBench],
    ['cargo', 'Embalaje de repuestos · patio de mantenimiento', 'Patio de bobinas y herramientas de mantenimiento', 146.8, 88.7, 1.0, 2.50, 10.2, [.13, .922, .56], cargoBench],
  ] as const;
  for (const [kind, name, yardName, planX, planZ, x, z, phase, contact, make] of yardPlaces) {
    const yard = props.getObjectByName(yardName);
    if (yard) {
      station(kind, name, yard, v(x, .089 + .018, z), Math.PI, phase, contact, make);
    } else {
      // Details can be omitted on a fallback scene; retain the same safe ground footprint.
      const at = diquePlanPoint(planX, planZ);
      const origin = v(at.x + x, DIQUE_GROUND + .018, at.z + z);
      if ([-1.9, 0, 1.9].every(dx => [-1.4, 0, .4].every(dz => diqueRoadClear(course, origin.x + dx, origin.z + dz, .25)))) {
        station(kind, name, props, origin, Math.PI, phase, contact, make);
      }
    }
  }

  let originTime: number | undefined;
  const work = createDiqueWorkCycle();
  let night = false;
  return {
    stations,
    animated,
    update(now: number) {
      originTime ??= now;
      const seconds = Math.max(0, (now - originTime) / 1000);
      if (!wheel || !needle) return;
      sampleDiqueWork(seconds, wheelPhase, work);
      wheel.rotation.z = work.spin;
      needle.rotation.z = .80 - work.working * 1.65 + work.working * Math.sin(seconds * 14) * .055;
      status.color.setRGB(.26 + work.working * .55, .45 + (1 - work.working) * .23, .22);
      status.color.multiplyScalar(night ? 1.15 : .84);
    },
    setNight(value: boolean) { night = value; },
  };
}
