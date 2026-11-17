import * as THREE from 'three';
import { diquePlanPoint, diqueRoadDistance, type Course } from '../shared/courses.ts';
import type { RaceSnapshot } from '../shared/protocol.ts';
import { DIQUE_BUILDING_PAD, diqueBuildingPoint, diqueBuildings, type DiqueBuilding } from './dique-architecture-layout';
import { DIQUE_GROUND, diqueEdge, diqueRoadClear } from './dique-geometry';
import { freightLane } from './dique-terminal-layout';
import { standard } from './materials';
import { marshalSignal, nearestCar } from './world-cues';
import { createDiqueWorkCycle, sampleDiqueWork } from './dique-work-cycle';
import type { DiqueWorkstation } from './dique-workstations';
import { crewHeadGeometry } from './crew-geometry';

type Point = readonly [number, number, number];
type Role = 'mechanic' | 'marshal' | 'gate' | 'dock' | 'clerk' | 'rigger' | 'mooring' | 'dispatcher';
type Signal = ReturnType<typeof marshalSignal>;

interface Worker {
  role: Role;
  from: THREE.Vector3;
  to: THREE.Vector3;
  position: THREE.Vector3;
  facing: number;
  yaw: number;
  distance: number;
  phase: number;
  colors: readonly [uniform: number, vest: number, helmet: number, skin: number];
  cue?: THREE.Vector3;
  look?: { x: number; z: number };
  cautionUntil: number;
  signal: Signal;
  task?: DiqueWorkstation;
}

function batch(parent: THREE.Group, name: string, geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number) {
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.name = name;
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  parent.add(mesh);
  return { mesh, used: 0, colors: new Int32Array(capacity).fill(-1), colorsChanged: false };
}

type Batch = ReturnType<typeof batch>;

function uploadPrefix(attribute: THREE.InstancedBufferAttribute, components: number) {
  attribute.clearUpdateRanges();
  attribute.addUpdateRange(0, components);
  attribute.needsUpdate = true;
}

function checkerMap() {
  const pixels = new Uint8Array(8 * 6 * 4);
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 8; x++) {
      const i = (y * 8 + x) * 4;
      const value = (Math.floor(x / 2) + Math.floor(y / 2)) % 2 ? 27 : 239;
      pixels.set([value, value, value, 255], i);
    }
  }
  const map = new THREE.DataTexture(pixels, 8, 6);
  map.colorSpace = THREE.SRGBColorSpace;
  map.needsUpdate = true;
  return map;
}

function contactMap() {
  const size = 24;
  const pixels = new Uint8Array(size ** 2 * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const radius = Math.hypot((x + 0.5) / size * 2 - 1, (y + 0.5) / size * 2 - 1);
      pixels[(y * size + x) * 4 + 3] = Math.round(Math.max(0, 1 - radius) ** 1.38 * 255);
    }
  }
  const map = new THREE.DataTexture(pixels, size, size);
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearFilter;
  map.needsUpdate = true;
  return map;
}

export function buildDiqueWorkers(parent: THREE.Group, course: Course, stations: readonly DiqueWorkstation[] = []) {
  const group = new THREE.Group();
  group.name = 'Personal de operación y comisarios del Dique';
  parent.add(group);
  const workers: Worker[] = [];

  function add(role: Role, from: THREE.Vector3, to: THREE.Vector3, facing: number, colors: Worker['colors'],
    cue?: THREE.Vector3) {
    const clearance = role === 'gate' ? 0.64 : 0.52;
    const distance = from.distanceTo(to);
    const steps = Math.max(1, Math.ceil(distance / 0.26));
    for (let i = 0; i <= steps; i++) {
      const point = from.clone().lerp(to, i / steps);
      if (!diqueRoadClear(course, point.x, point.z, clearance)) return;
    }
    const worker: Worker = { role, from, to, position: from.clone(), distance, facing, yaw: facing,
      phase: workers.length * 1.31, colors, cue, cautionUntil: 0, signal: 'idle' };
    workers.push(worker);
    return worker;
  }

  function plan(x: number, z: number, y = DIQUE_GROUND) {
    const point = diquePlanPoint(x, z);
    return new THREE.Vector3(point.x, y, point.z);
  }

  const mechanic = [0x223c52, 0x346283, 0xc1aa77, 0xc48d69] as const;
  const marshal = [0x353946, 0xed711c, 0xf8c18a, 0xe4ab86] as const;
  const workwear = [0x293d49, 0xd6ac36, 0xefc944, 0xae7455] as const;
  const inspector = [0x40545b, 0xa0aa55, 0xe4e7de, 0xd49574] as const;
  function buildingCrew(site: DiqueBuilding, role: Role, from: number, to: number, inset: number,
    facing: number, colors: Worker['colors']) {
    const point = (localX: number) => {
      const { x, z } = diqueBuildingPoint(site, localX, site.depth / 2 + inset);
      return new THREE.Vector3(x, DIQUE_GROUND + DIQUE_BUILDING_PAD, z);
    };
    add(role, point(from), point(to), facing + site.yaw, colors);
  }
  for (const [i, stall] of (stations.length ? [] : [course.pit.stalls[0], course.pit.stalls[2]]).entries()) {
    const point = course.sampleAt(stall + (i ? -0.95 : 0.72));
    const from = diqueEdge(course, point, course.pit.stationOffset - 1.49, -0.026);
    add('mechanic', from, from, i ? 0.56 : -0.48, mechanic);
  }
  for (const task of stations) {
    const worker = add('mechanic', task.position, task.position, task.yaw,
      task.kind === 'weld' || task.kind === 'cargo' ? workwear : mechanic);
    if (worker) worker.task = task;
  }
  const gateAnchor = course.sampleAt(88.9);
  const gate = diqueEdge(course, gateAnchor, -9.66);
  const gateApproach = diqueEdge(course, gateAnchor, course.pit.offset);
  gate.y = DIQUE_GROUND;
  add('gate', gate, gate, 0.24, inspector, gateApproach);

  add('dock', plan(162.0, 163.35), plan(165.2, 163.35), 0.55, workwear);
  buildingCrew(diqueBuildings.depot, 'clerk', -3.1, 2.7, 2.09, -0.30, inspector);
  buildingCrew(diqueBuildings.workshop, 'mechanic', -1.52, -1.52, 0.82, 0.16, mechanic);
  buildingCrew(diqueBuildings.pumps, 'clerk', 0.55, 1.45, 1.06, 0.49, inspector);
  buildingCrew(diqueBuildings.station, 'clerk', -0.94, 0.65, 1.03, Math.PI + 0.29, workwear);
  buildingCrew(diqueBuildings.timing, 'clerk', 0.73, 0.73, 1.04, 0.27, marshal);
  add('rigger', plan(214.2, 137.7), plan(214.6, 139.6), Math.PI / 2, workwear);
  add('clerk', plan(183.0, 136.0), plan(185.0, 136.0), 0.22, workwear);

  const plant = plan(225, 27.5, DIQUE_GROUND + 4.515);
  const plantYaw = -0.08;
  function onPlant(x: number, z: number) {
    return new THREE.Vector3(plant.x + Math.cos(plantYaw) * x + Math.sin(plantYaw) * z, plant.y,
      plant.z - Math.sin(plantYaw) * x + Math.cos(plantYaw) * z);
  }
  add('clerk', onPlant(-11.05, 4.78), onPlant(-8.55, 4.78), Math.PI + plantYaw, inspector);

  const atGround = (x: number, z: number) => new THREE.Vector3(x, DIQUE_GROUND + 0.038, z);
  add('mooring', atGround(13.20, 14.67), atGround(13.20, 14.67), 0.40, workwear);
  add('clerk', atGround(21.48, 14.71), atGround(22.66, 14.71), -0.35, inspector);
  const dispatch = atGround(freightLane.gate.x - 4.10, freightLane.gate.z);
  add('dispatcher', dispatch, dispatch, Math.PI - 0.45, inspector);
  const maintenance = course.treatmentDetour ? plan(46.8, 110.3) : plan(56.55, 124.4);
  add('mechanic', maintenance, maintenance, Math.PI - 0.25, mechanic);
  if (course.treatmentDetour) {
    add('clerk', plan(54.5, 123.8), plan(58.5, 123.8), 0.22, workwear);
  }
  add('dock', plan(216.9, 79.8), plan(220.3, 79.9), 1.55, workwear);
  add('clerk', plan(222.3, 73.4), plan(225.2, 73.2), 1.78, inspector);
  function spillwayWalk(px: number, pz: number, yaw: number, from: number, to: number, look: number) {
    const center = plan(px, pz, -0.744);
    const along = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    add('clerk', center.clone().addScaledVector(along, from), center.clone().addScaledVector(along, to), look, inspector);
  }
  spillwayWalk(73.1, 81.4, 0.39, -1.72, 0.69, Math.PI / 2);
  spillwayWalk(92.45, 103, -0.29, -0.96, 0.91, -Math.PI / 2);

  const marshalPosts = [6.1, diqueRoadDistance(460)].map((s, i) => {
    const lane = course.sampleAt(s);
    const side = 1;
    const edge = diqueEdge(course, lane, course.wallHalfAt(s, side) + (i ? 0.69 : 0.82));
    if (!i) edge.y = DIQUE_GROUND;
    else edge.y += 0.02;
    const yaw = Math.atan2(lane.x - edge.x, lane.z - edge.z);
    add('marshal', edge, edge, yaw, marshal, new THREE.Vector3(lane.x, lane.y, lane.z));
    return { edge, yaw };
  });
  if (course.detour) {
    const lane = course.sampleAt(course.detour.from + 25);
    const post = diqueEdge(course, lane, course.wallHalfAt(lane.s, 1) + 1.23);
    post.y = DIQUE_GROUND;
    const yaw = Math.atan2(lane.x - post.x, lane.z - post.z);
    add('marshal', post, post, yaw, marshal, new THREE.Vector3(lane.x, lane.y, lane.z));
  }

  const coated = standard(0xffffff, 0.76);
  const accents = standard(0xffffff, 0.56, 0.12);
  accents.emissive.setHex(0x665034);
  accents.emissiveIntensity = 0.08;
  const people = workers.length;
  const hoseSegments = workers.reduce((count, worker) => count +
    (worker.task?.kind === 'wheel' || worker.task?.kind === 'weld' ? 2 : 0), 0);
  const box = batch(group, 'Uniformes, equipo y pasarela', new THREE.BoxGeometry(1, 1, 1), coated, people * 14 + 100);
  const joint = batch(group, 'Mangas y pantalones', new THREE.CapsuleGeometry(0.5, 0.01, 2, 6), coated, people * 8 + hoseSegments);
  const round = batch(group, 'Caras y guantes', new THREE.SphereGeometry(0.5, 8, 5), coated, people * 4 + 16);
  const heads = batch(group, 'Rostros con orejas y volumen', crewHeadGeometry(), coated, people);
  const chest = batch(group, 'Torsos de los operarios', new THREE.CylinderGeometry(0.5, 0.39, 1, 7), coated, people);
  const brim = batch(group, 'Viseras de protección', new THREE.CylinderGeometry(0.5, 0.5, 1, 9), coated, people * 2);
  const helmet = batch(group, 'Cascos', new THREE.SphereGeometry(0.5, 9, 5, 0, 2 * Math.PI, 0, Math.PI / 2), coated, people);
  const detailBox = batch(group, 'Cintas reflectantes y detalle del uniforme', new THREE.BoxGeometry(1, 1, 1), accents, people * 26 + 20);
  const hotMetal = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const sparks = batch(group, 'Soldadura y virutas calientes', new THREE.SphereGeometry(.5, 5, 3), hotMetal, 12);
  const flagPlane = new THREE.PlaneGeometry(1, 1);
  const flag = batch(group, 'Banderas de pista', flagPlane, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), 6);
  const checker = batch(group, 'Bandera a cuadros', flagPlane, new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide, map: checkerMap(),
  }), 4);
  const shadows = batch(group, 'Contacto de los operarios', new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: contactMap(), transparent: true, opacity: 0.72, depthWrite: false, polygonOffset: true,
      polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), people);
  const batches = [box, joint, round, heads, chest, brim, helmet, detailBox, flag, checker, shadows, sparks];
  const taskCycle = createDiqueWorkCycle();
  const root = new THREE.Object3D();
  const part = new THREE.Object3D();
  const matrix = new THREE.Matrix4();
  const axisY = new THREE.Vector3(0, 1, 0);
  const direction = new THREE.Vector3();
  const color = new THREE.Color();
  const palette = new Map<number, THREE.Color>();
  const boot = 0x242927;
  let startedAt: number | undefined;
  let previousTime: number | undefined;
  let lastHeat: number | undefined;
  let lastFrame = -1;
  let lastPhase: RaceSnapshot['phase'] | undefined;
  let detail = true;
  let vesselHandling = false;
  let truckInspection = false;

  function write(target: Batch, hex: number) {
    const slot = target.used++;
    part.updateMatrix();
    target.mesh.setMatrixAt(slot, matrix.multiplyMatrices(root.matrix, part.matrix));
    if (target.colors[slot] === hex) return;
    let shade = palette.get(hex);
    if (!shade) {
      shade = color.setHex(hex).clone();
      palette.set(hex, shade);
    }
    target.mesh.setColorAt(slot, shade);
    target.colors[slot] = hex;
    target.colorsChanged = true;
  }

  function shape(target: Batch, at: Point, size: Point, hex: number, rx = 0, ry = 0, rz = 0) {
    part.position.set(...at);
    part.scale.set(...size);
    part.rotation.set(rx, ry, rz);
    write(target, hex);
  }

  function limb(target: Batch, from: Point, to: Point, diameter: number, hex: number) {
    direction.set(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    const length = direction.length();
    part.position.set((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2);
    part.scale.set(diameter, length + diameter * 0.58, diameter);
    part.quaternion.setFromUnitVectors(axisY, direction.multiplyScalar(1 / Math.max(length, 0.0001)));
    write(target, hex);
  }

  function at(position: THREE.Vector3, yaw: number) {
    root.position.copy(position);
    root.rotation.y = yaw;
    root.updateMatrix();
  }

  function catwalk() {
    const { edge, yaw } = marshalPosts[1];
    at(edge, yaw);
    const frame = 0x4e6067;
    shape(box, [0, -0.075, 0], [1.70, 0.15, 1.30], 0x818d92);
    shape(box, [0, -0.71, -0.63], [1.52, 0.11, 0.11], frame);
    for (const side of [-1, 1]) {
      const x = side * 0.76;
      shape(box, [x, 0.48, -0.62], [0.08, 0.99, 0.08], frame);
      limb(box, [x, -0.11, -0.61], [x, -0.89, 0.55], 0.091, frame);
    }
    shape(box, [0, 0.55, -0.62], [1.56, 0.054, 0.061], 0x697979);
    shape(box, [0, 0.96, -0.62], [1.61, 0.071, 0.069], 0xba984a);
  }

  function pose(worker: Worker, now: number, dt: number) {
    const { role, signal, task, colors: [uniform, vest, cap, skin] } = worker;
    const clock = now + worker.phase;
    let stride = 0;
    let lift = 0;
    let heading = worker.facing;
    if (worker.distance > 0) {
      const walk = worker.distance / 0.62 + 0.55;
      const pause = role === 'dock' ? 2.45 : 3.2;
      const cycle = walk + pause;
      const phase = clock % (cycle * 2);
      const forward = phase < cycle;
      const leg = phase % cycle;
      const progress = THREE.MathUtils.smoothstep(leg, 0, walk);
      const along = forward ? progress : 1 - progress;
      worker.position.lerpVectors(worker.from, worker.to, along);
      const amount = THREE.MathUtils.smoothstep(leg, 0, 0.42) * (1 - THREE.MathUtils.smoothstep(leg, walk - 0.48, walk));
      const gait = progress * worker.distance * 8.9;
      stride = Math.sin(gait) * amount;
      lift = Math.cos(gait) * amount;
      if (leg < walk) {
        heading = Math.atan2(worker.to.x - worker.from.x, worker.to.z - worker.from.z) + (forward ? 0 : Math.PI);
      }
    }
    if (worker.look) heading = Math.atan2(worker.look.x - worker.position.x, worker.look.z - worker.position.z);
    const turn = Math.atan2(Math.sin(heading - worker.yaw), Math.cos(heading - worker.yaw));
    worker.yaw += turn * (1 - Math.exp(-dt * 8));
    at(worker.position, worker.yaw);
    if (task) sampleDiqueWork(now, task.phase, taskCycle);
    const tinkering = task ? taskCycle.engage * .27 : role === 'mechanic'
      ? THREE.MathUtils.smoothstep(Math.sin(clock * 0.88), -0.55, 0.55) : 0;
    const settle = Math.sin(clock * 2.05) * 0.009 + Math.abs(lift) * 0.018 - tinkering * 0.23;
    const lean = tinkering * 0.14;
    const flagsUp = role === 'marshal' && (signal === 'red' || signal === 'yellow' || signal === 'checkered' || worker.look);
    const signaling = (role === 'gate' && worker.look !== undefined) || (role === 'mooring' && vesselHandling);
    const armWave = Math.sin(clock * (signal === 'checkered' ? 7.2 : 5.0));
    const radio = role === 'rigger' && Math.sin(clock * 1.23) > -0.28;
    let rightHand: Point = [0, 0, 0];

    shape(shadows, [0, 0.012, -0.013], [0.91, 0.78, 1], 0xffffff, -Math.PI / 2);
    shape(chest, [0, 0.93 + settle, lean], [0.43, 0.39, 0.279], uniform, tinkering * 0.35);
    shape(box, [0, 0.68 + settle, lean * 0.37], [0.335, 0.16, 0.24], uniform);
    shape(box, [0, 0.746 + settle, lean * 0.56], [0.36, 0.035, 0.246], boot);
    const headZ = lean * 1.75;
    shape(heads, [0, 1.251 + settle, headZ], [0.238, 0.259, 0.225], skin);
    shape(round, [0, 1.261 + settle, headZ + 0.1], [0.079, 0.068, 0.074], skin);
    shape(brim, [0, 1.339 + settle, headZ + 0.014], [0.277, 0.027, role === 'mechanic' ? 0.29 : 0.276], cap, -0.09);
    shape(helmet, [0, 1.355 + settle, headZ], [0.23, 0.226, 0.232], cap);
    if (detail) {
      shape(detailBox, [0, 1.422 + settle, headZ], [.039, .028, .18], cap);
      shape(detailBox, [0, 1.196 + settle, headZ + .106], [.064, .010, .014], 0x795645);
      shape(detailBox, [0, .947 + settle, lean + .157], [.015, .31, .014], 0x2d3636, tinkering * .35);
      shape(detailBox, [-.087, 1.004 + settle, lean + .158], [.088, .078, .016], 0x43575c, tinkering * .35);
      shape(detailBox, [-.087, 1.022 + settle, lean + .170], [.065, .022, .009], 0xdfd7b9, tinkering * .35);
      shape(detailBox, [.044, .75 + settle, lean * .56 + .135], [.052, .034, .022], 0x9ba9a6);
      shape(detailBox, [-.18, .71 + settle, lean * .56], [.092, .14, .12], 0x454943);
    }

    for (const side of [-1, 1]) {
      const x = side * 0.116;
      const foot: Point = [x * 1.19, 0.073 + Math.max(0, side * lift) * 0.097, stride * side * 0.16 + 0.023];
      const knee: Point = [x * 1.13, 0.341 + (foot[1] - 0.073) * 0.70 + settle * 0.43,
        foot[2] * 0.60 + tinkering * 0.17 + 0.02];
      limb(joint, [x, 0.626 + settle, lean * 0.40], knee, 0.155, uniform);
      limb(joint, knee, foot, 0.115, uniform);
      shape(box, [foot[0], foot[1] - 0.025, foot[2] + 0.048], [0.129, 0.096, 0.216], boot);
      const shoulder: Point = [side * 0.206, 1.071 + settle, lean];
      let elbow: Point = [side * 0.25, 0.873 + settle, lean + side * stride * -0.075];
      let hand: Point = [side * 0.243, 0.704 + settle, lean + side * stride * -0.155 + 0.025];
      if (task) {
        const [tx, ty, tz] = task.contact;
        const reach = task.kind === 'wheel' ? taskCycle.wheelGrip : taskCycle.engage;
        // Both hands reach a machine-defined contact; the torso never drives the tool tip.
        const right = side > 0;
        const stroke = taskCycle.stroke;
        const grip: Point = right
          ? task.kind === 'engine' ? [tx + .10 * Math.sin(stroke * .34), ty + .055, tz - .20 * Math.cos(stroke * .34)]
            : task.kind === 'wheel' ? [tx, ty + .02, tz - .12]
              : task.kind === 'weld' ? [tx + .07, ty + .10, tz - .18]
                : [tx + stroke * .055, ty + .045, tz - .055]
          : task.kind === 'engine' ? [tx - .23, ty - .10, tz - .07]
            : task.kind === 'wheel' ? [tx - .28, ty + .18, tz + .02]
              : task.kind === 'weld' ? [tx - .12, ty + .05, tz - .07]
                : [tx - .26, ty - .01, tz + .04];
        hand = [hand[0] + (grip[0] - hand[0]) * reach,
          hand[1] + (grip[1] - hand[1]) * reach, hand[2] + (grip[2] - hand[2]) * reach];
        elbow = [side * .29, .87 + settle + (hand[1] - .8) * .32, .13 + hand[2] * .25];
      } else if (role === 'dock' || role === 'clerk' || role === 'dispatcher') {
        elbow = [side * 0.225, 0.845 + settle, 0.113];
        const writing = role === 'dispatcher' && truckInspection && side > 0 ? Math.sin(clock * 5.2) * 0.034 : 0;
        hand = [side * (role === 'dock' ? 0.199 : 0.133) + writing, 0.815 + settle, 0.287];
      } else if (role === 'mechanic') {
        elbow = [side * 0.19, 0.871 + settle, 0.13 + lean];
        hand = [side * 0.17, 0.738 + settle + Math.sin(clock * 5) * 0.021 * tinkering,
          0.13 + lean + 0.17 * tinkering];
      } else if (side > 0 && (flagsUp || signaling || radio)) {
        elbow = [0.282, 1.046 + settle + (flagsUp ? 0.14 : 0.10), 0.098];
        hand = radio ? [0.159, 1.192 + settle, 0.134] :
          [flagsUp ? 0.333 + armWave * 0.075 : 0.299, 1.322 + settle + (flagsUp ? armWave * 0.11 : 0), 0.129];
      }
      limb(joint, shoulder, elbow, 0.128, uniform);
      limb(joint, elbow, hand, 0.107, uniform);
      shape(round, hand, [0.082, 0.088, 0.077], role === 'mechanic' || role === 'dock' ? 0x625955 : skin);
      if (side > 0) rightHand = hand;
      shape(box, [side * 0.094, 0.936 + settle, lean + 0.119], [0.104, 0.302, 0.058], vest, tinkering * 0.35);
      shape(box, [side * 0.092, 0.941 + settle, lean - 0.116], [0.118, 0.282, 0.052], vest, tinkering * 0.35);
      if (!detail) continue;
      shape(detailBox, [foot[0], foot[1] - .065, foot[2] + .048], [.14, .025, .23], 0x171e1d);
      shape(detailBox, [foot[0], foot[1] + .028, foot[2] + .043], [.068, .012, .065], 0x6a7068);
      shape(detailBox, [side * .09, 1.075 + settle, lean + .08], [.073, .031, .10], uniform, tinkering * .35, 0, side * -.20);
      shape(detailBox, [side * .05, 1.28 + settle, headZ + .115], [.068, .037, .014], 0x657e7e);
      if (role !== 'mechanic') {
        for (const face of [-1, 1]) shape(detailBox, [side * 0.092, 0.89 + settle, lean + face * 0.15],
          [0.109, 0.044, 0.013], 0xcdd2c2, tinkering * 0.32);
      } else {
        shape(detailBox, [side * 0.087, 1.001 + settle, lean + 0.151], [0.073, 0.027, 0.011], 0xc3bc9b);
      }
      shape(detailBox, [side * 0.05, 1.28 + settle, headZ + 0.107], [0.023, 0.014, 0.011], 0x3d2f2a);
    }

    if (task) {
      const [x, y, z] = rightHand;
      const [tx, ty, tz] = task.contact;
      const reach = task.kind === 'wheel' ? taskCycle.wheelGrip : taskCycle.engage;
      // The business end stays on the bolt, spindle, seam or parcel throughout work.
      const tip: Point = [x + (tx - x) * reach, y - .03 + (ty - y + .03) * reach,
        z + .13 + (tz - z - .13) * reach];
      if (task.kind === 'engine') {
        limb(box, rightHand, tip, .028, 0xa8aea5);
        shape(brim, [tip[0], tip[1] + .025, tip[2]], [.071, .071, .071], 0xc5c5b7);
        shape(box, [x, y, z], [.064, .045, .10], 0x34454b, 0, taskCycle.stroke * .34);
      } else if (task.kind === 'wheel') {
        shape(box, [x, y - .045, z], [.087, .13, .066], 0x315c69, -.2);
        limb(box, rightHand, tip, .052, 0x9b9e96);
        // Reusable pneumatic hose moves with the hand and terminates at the machine.
        limb(joint, [x, y - .12, z], [.30, .21, .30], .028, 0x323936);
        limb(joint, [.30, .21, .30], [.54, .17, .69], .028, 0x323936);
      } else if (task.kind === 'weld') {
        shape(box, [0, 1.255 + settle, headZ + .144], [.284, .26, .078], 0x354644, -.12);
        shape(box, [0, 1.295 + settle, headZ + .189], [.152, .065, .016], 0x607d6b, -.12);
        limb(box, rightHand, tip, .042, 0x626f6d);
        shape(box, rightHand, [.09, .077, .14], 0x343c39, -.25);
        limb(joint, [x + .03, y - .025, z - .07], [.44, .15, .23], .026, 0x2d3533);
        limb(joint, [.44, .15, .23], [.72, .10, .67], .026, 0x2d3533);
        if (taskCycle.arc > .10) {
          const glow = .038 + .025 * taskCycle.arc;
          shape(sparks, tip, [glow, glow, glow], 0xa5d9e0);
          if (detail) for (let i = 0; i < 7; i++) {
            const age = (now * 2.3 + i * .137) % 1;
            const angle = i * 2.399;
            shape(sparks, [tx + Math.cos(angle) * age * .26,
              ty + .12 * Math.sin(age * Math.PI) - age * age * .28,
              tz + Math.sin(angle) * age * .19], [.011, .017 + .019 * (1 - age), .011], 0xffbc62);
          }
        }
      } else {
        shape(box, [x, y + .018, z + .021], [.10, .084, .16], 0x9f6036, 0, taskCycle.stroke * .08);
        shape(brim, [x + .045, y + .074, z], [.10, .035, .10], 0xc3a773, 0, 0, Math.PI / 2);
        limb(box, [x, y - .015, z + .055], tip, .019, 0xb5b5a7);
      }
    } else if (role === 'dock') {
      shape(box, [0, 0.844 + settle, 0.31], [0.352, 0.185, 0.246], 0x6c523c);
      for (const x of [-0.11, 0.11]) {
        shape(box, [x, 0.85 + settle, 0.438], [0.021, 0.175, 0.014], 0xb09370);
      }
    } else if (role === 'clerk' || role === 'dispatcher') {
      shape(box, [0, 0.838 + settle, 0.313], [0.259, 0.039, 0.194], 0x4e5b59, -0.28);
      shape(box, [0, 0.86 + settle, 0.302], [0.214, 0.011, 0.145], 0xc8bea0, -0.28);
    } else if (role === 'mechanic') {
      const [x, y, z] = rightHand;
      shape(box, [x + 0.045, y, z + 0.066], [0.043, 0.031, 0.185], 0x9f9b8e, 0.2, 0.73);
      shape(brim, [x + 0.096, y - 0.012, z + 0.121], [0.074, 0.032, 0.074], 0xb9bcaf);
    } else if (role === 'rigger') {
      const [x, y, z] = rightHand;
      shape(box, [x + 0.009, y + 0.036, z + 0.038], [0.061, 0.099, 0.039], 0x283238, 0.05, 0.14, -0.17);
      shape(box, [x + 0.033, y + 0.094, z + 0.035], [0.012, 0.068, 0.012], 0x464a42, 0, 0, -0.16);
    } else if (role === 'gate' || role === 'mooring') {
      const [x, y, z] = rightHand;
      shape(box, [x, y + 0.045, z], [0.05, 0.21, 0.052], 0x454649);
      const activeTint = role === 'mooring' ? 0xe8ba69 : 0x77c9a3;
      shape(box, [x, y + 0.139, z], [0.127, 0.097, 0.043], signaling ? activeTint : 0xdcb05a);
    } else {
      const [x, y, z] = rightHand;
      const sweep = flagsUp ? armWave * 0.48 - 0.36 : -0.46;
      const pole: Point = [x - Math.sin(sweep) * 0.48, y + Math.cos(sweep) * 0.48, z + 0.035];
      limb(box, [x, y - 0.058, z], pole, 0.024, 0xbcb294);
      const target = signal === 'checkered' ? checker : flag;
      const cloth = signal === 'yellow' ? 0xeab132 : signal === 'red' ? 0xc94640 : signal === 'idle' ? 0xb7ae8b : 0x58ae77;
      shape(target, [pole[0] + 0.117, pole[1] - 0.124, pole[2] + 0.024], [0.257, 0.247, 1],
        target === checker ? 0xffffff : cloth, 0.11, Math.sin(clock * 4.7) * 0.41, sweep);
    }
  }

  function observe(snapshot: RaceSnapshot) {
    if (snapshot.heat === lastHeat && snapshot.frame === lastFrame && snapshot.phase === lastPhase) return;
    const reset = snapshot.heat !== lastHeat || snapshot.frame < lastFrame ||
      (snapshot.phase !== lastPhase && (snapshot.phase === 'demo' || snapshot.phase === 'grid'));
    for (const worker of workers) {
      if (!worker.cue) continue;
      if (worker.role === 'gate') {
        const traffic = snapshot.phase === 'race' || snapshot.phase === 'practice' ?
          snapshot.cars.filter(car => {
            const offset = (car.z - gateApproach.z) * gateAnchor.dx - (car.x - gateApproach.x) * gateAnchor.dz;
            return Math.abs(offset) <= course.pit.halfWidth + 0.12 &&
              (car.pitReady || Math.abs(car.speed) <= course.pit.speedLimit + 1.25);
          }) : [];
        worker.look = nearestCar(traffic, worker.cue, worker.look ? 4.42 : 3.62);
        continue;
      }
      if (reset) worker.cautionUntil = 0;
      worker.look = nearestCar(snapshot.cars, worker.cue, 10.6);
      for (const hit of snapshot.impacts ?? []) {
        const age = snapshot.frame - hit.frame;
        if (age < 0 || age >= 108 || hit.strength < 0.24 || Math.abs(hit.y - worker.cue.y) > 1.25) continue;
        if ((hit.x - worker.cue.x) ** 2 + (hit.z - worker.cue.z) ** 2 > 10.6 ** 2) continue;
        worker.cautionUntil = Math.max(worker.cautionUntil, hit.frame + 108);
        if (age < 48) worker.look = hit;
      }
      worker.signal = marshalSignal(snapshot, worker.cautionUntil);
    }
    lastHeat = snapshot.heat;
    lastFrame = snapshot.frame;
    lastPhase = snapshot.phase;
  }

  function render(now: number, dt: number) {
    for (const partBatch of batches) {
      partBatch.used = 0;
      partBatch.colorsChanged = false;
    }
    catwalk();
    for (const worker of workers) pose(worker, now, dt);
    for (const partBatch of batches) {
      const { mesh, used, colorsChanged } = partBatch;
      mesh.count = used;
      if (used === 0) continue;
      uploadPrefix(mesh.instanceMatrix, used * mesh.instanceMatrix.itemSize);
      const colors = mesh.instanceColor;
      if (colorsChanged && colors) {
        // Retain pending colors for slots that may return before this batch is drawn.
        const pending = colors.updateRanges[0]?.count ?? 0;
        uploadPrefix(colors, Math.max(pending, used * colors.itemSize));
      }
    }
  }

  render(0, 1 / 60);
  return {
    observe,
    setPortActivity(vessel: boolean, truck: boolean) { vesselHandling = vessel; truckInspection = truck; },
    update(now: number) {
      startedAt ??= now;
      const dt = previousTime === undefined ? 1 / 60 : THREE.MathUtils.clamp((now - previousTime) / 1000, 0, 0.1);
      previousTime = now;
      render(Math.max(0, (now - startedAt) / 1000), dt);
    },
    setNight(night: boolean) { accents.emissiveIntensity = night ? 0.23 : 0.08; },
    setDetail(enabled: boolean) { detail = enabled; detailBox.mesh.visible = enabled; },
  };
}
