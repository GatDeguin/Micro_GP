import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Course } from '../shared/courses';
import type { RaceSnapshot } from '../shared/protocol';
import { mergeStatic } from './batches';
import { DIQUE_GROUND, diqueEdge, diquePart, diqueSign } from './dique-geometry';
import { forkliftYard, sampleDiqueForklift } from './dique-yard-motion';
import { box, canvas2d, horizontalShadow, random, standard, texture } from './materials';
import { nearestCar } from './world-cues';

const steel = standard(0x869390, 0.52, 0.57);
const chassis = standard(0x334247, 0.73, 0.38);
const tire = standard(0x252827, 0.93);
const timber = standard(0x9c7750, 0.84);
const rim = standard(0x948573, 0.46, 0.47);
const workwear = standard(0x414e54, 0.86);
const vest = standard(0xdc8c38, 0.73);
const hardHat = standard(0xd0b571, 0.54);
const skin = standard(0xa96f52, 0.78);
const lamp = (color: number) => new THREE.MeshStandardMaterial({
  color, emissive: color, roughness: 0.37, emissiveIntensity: 0.5,
});
const part = (parent: THREE.Object3D, material: THREE.Material, x: number, y: number, z: number,
  width: number, height: number, depth: number) => box(parent, material, x, y, z, width, height, depth, false);
const floor = DIQUE_GROUND + 0.043;
const fairing = new RoundedBoxGeometry(1, 1, 1, 2, 0.12);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 14).rotateZ(Math.PI / 2);
const wheelShape = new THREE.LatheGeometry([
  [0.32, -0.59], [0.85, -0.59], [0.97, -0.46], [1, -0.29], [1, 0.29],
  [0.97, 0.46], [0.85, 0.59], [0.32, 0.59], [0.32, -0.59],
].map(([r, h]) => new THREE.Vector2(r, h)), 18).rotateZ(Math.PI / 2);
const flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

function weatheredPaint() {
  const { canvas, context } = canvas2d(128, 128);
  const rng = random(72941);
  context.fillStyle = '#ca913c';
  context.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 260; i++) {
    const side = i < 190;
    const x = side ? 3 + rng() * 13 : rng() * 128;
    const y = rng() * 128;
    context.fillStyle = rng() < 0.46 ? 'rgba(49,39,29,.4)' : 'rgba(241,203,135,.31)';
    context.fillRect(i % 3 === 0 ? 128 - x : x, y, 0.4 + rng() * 6, 0.55 + rng() * 2.6);
  }
  return new THREE.MeshPhysicalMaterial({
    map: texture(canvas), roughness: 0.58, metalness: 0.30, clearcoat: 0.22, clearcoatRoughness: 0.53,
  });
}

function workLane(parent: THREE.Group) {
  const left = forkliftYard.start - 6.5;
  const right = forkliftYard.end + 2.3;
  const { canvas, context } = canvas2d(1024, 160);
  const rng = random(2118);
  const stroke = (color: string, width: number, y: number) => {
    context.fillStyle = color;
    context.fillRect(16, y, 992, width);
  };
  stroke('rgba(39,44,42,.44)', 18, 30);
  stroke('rgba(39,44,42,.44)', 18, 112);
  for (let i = 0; i < 600; i++) {
    const y = rng() * 18 + (i % 2 === 0 ? 29 : 112);
    context.fillStyle = 'rgba(44,43,39,.20)';
    context.fillRect(rng() * 1024, y, 2 + rng() * 27, 0.6 + rng() * 2);
  }
  stroke('rgba(214,180,101,.83)', 3, 8);
  stroke('rgba(214,180,101,.83)', 3, 149);
  context.strokeStyle = '#c6aa70';
  context.lineWidth = 3;
  context.fillStyle = '#d2b47e';
  context.font = 'bold 28px Arial';
  context.textAlign = 'center';
  for (const [index, x] of [forkliftYard.start, forkliftYard.end].entries()) {
    const px = (x - left) * 1024 / (right - left);
    context.strokeRect(px - 34, 39, 68, 80);
    context.fillText(index === 0 ? 'A' : 'B', px, 140);
  }
  const mark = new THREE.MeshBasicMaterial({
    map: texture(canvas), transparent: true, depthWrite: false, polygonOffset: true,
    polygonOffsetFactor: -1, polygonOffsetUnits: -2,
  });
  const deck = diquePart(parent, flat, mark, false, 'Corredor pintado del montacargas');
  deck.position.set((left + right) / 2, floor + 0.004, forkliftYard.z);
  deck.scale.set(right - left, 1, 3.95);
}

function forklift(parent: THREE.Group) {
  const truck = new THREE.Group();
  const body = new THREE.Group();
  const forks = new THREE.Group();
  const beacon = lamp(0xffa638);
  const lenses = lamp(0xffe2a8);
  const reverse = lamp(0xf1e3d5);
  const paint = weatheredPaint();
  truck.name = 'Montacargas del muelle';
  truck.rotation.y = Math.PI / 2;
  parent.add(truck);
  truck.add(body, forks);
  part(body, chassis, 0, 0.46, -0.24, 1.52, 0.24, 2.48);
  const counterweight = diquePart(body, fairing, paint);
  counterweight.position.set(0, 0.79, -0.89);
  counterweight.scale.set(1.48, 0.48, 1.12);
  part(body, chassis, 0, 0.56, -1.52, 1.51, 0.21, 0.22);
  part(body, paint, 0, 0.66, 0.76, 1.63, 0.29, 0.53);
  part(body, tire, 0, 0.76, -0.03, 0.78, 0.09, 0.76);
  part(body, tire, 0, 0.99, -0.22, 0.58, 0.16, 0.44);
  part(body, tire, 0, 1.23, -0.46, 0.57, 0.40, 0.10);
  part(body, steel, -0.26, 0.95, 0.37, 0.066, 0.49, 0.068).rotation.x = -0.20;
  const steering = diquePart(body, new THREE.TorusGeometry(0.18, 0.024, 6, 14), chassis);
  steering.rotation.x = -1.19;
  steering.position.set(-0.26, 1.22, 0.32);
  const driver = new THREE.Group();
  driver.name = 'Conductor sentado con casco y chaleco';
  body.add(driver);
  part(driver, workwear, -0.13, 1.03, 0.011, 0.36, 0.17, 0.44);
  const torso = part(driver, vest, -0.13, 1.32, -0.20, 0.39, 0.40, 0.26);
  torso.rotation.x = -0.12;
  part(driver, hardHat, -0.13, 1.27, -0.052, 0.38, 0.050, 0.018);
  const head = new THREE.SphereGeometry(1, 12, 8);
  const face = diquePart(driver, head, skin);
  face.position.set(-0.13, 1.66, -0.19);
  face.scale.set(0.126, 0.155, 0.135);
  const helmet = diquePart(driver, head, hardHat);
  helmet.position.set(-0.13, 1.75, -0.19);
  helmet.scale.set(0.153, 0.104, 0.157);
  part(driver, hardHat, -0.13, 1.73, -0.087, 0.29, 0.039, 0.25);
  const arm = part(driver, workwear, -0.31, 1.317, 0.102, 0.103, 0.115, 0.43);
  arm.rotation.x = 0.26;
  part(driver, skin, -0.31, 1.265, 0.304, 0.104, 0.093, 0.11);
  for (const x of [-0.69, 0.69]) {
    for (const z of [-0.74, 0.64]) part(body, chassis, x, 1.51, z, 0.103, 1.64, 0.106);
    part(body, paint, x, 2.34, -0.05, 0.12, 0.11, 1.63);
    part(body, lenses, x * 0.83, 1.98, 0.74, 0.22, 0.13, 0.061);
    part(body, reverse, x * 0.81, 0.86, -1.47, 0.19, 0.13, 0.064);
  }
  for (const z of [-0.77, -0.48, -0.11, 0.27, 0.64]) part(body, paint, 0, 2.34, z, 1.36, 0.10, 0.065);
  part(body, chassis, 0.53, 2.43, -0.50, 0.30, 0.065, 0.28);
  part(body, beacon, 0.53, 2.52, -0.50, 0.20, 0.13, 0.20);
  for (const x of [-0.44, 0.44]) {
    part(body, chassis, x, 1.22, 1.10, 0.12, 1.86, 0.18);
    part(body, steel, x * 0.75, 1.17, 1.18, 0.055, 1.75, 0.046);
    part(forks, steel, x * 0.88, 0.27, 1.27, 0.125, 0.43, 0.115);
    part(forks, steel, x * 0.88, 0.108, 1.96, 0.125, 0.060, 1.46);
  }
  part(body, chassis, 0, 1.99, 1.10, 0.98, 0.094, 0.17);
  part(forks, chassis, 0, 0.54, 1.26, 1.06, 0.16, 0.109);
  part(forks, chassis, 0, 0.75, 1.26, 1.06, 0.082, 0.087);
  mergeStatic(body);
  mergeStatic(forks);

  const wheelSize = [0.44, 0.44, 0.36, 0.36];
  const wheels = new THREE.InstancedMesh(wheelShape, tire, 4);
  const rims = new THREE.InstancedMesh(cylinder, rim, 4);
  const hubs = new THREE.InstancedMesh(cylinder, chassis, 4);
  const spokes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), chassis, 12);
  for (const batch of [wheels, rims, hubs, spokes]) {
    batch.receiveShadow = true;
    batch.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.42, 0), 1.75);
    batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    truck.add(batch);
  }
  const dummy = new THREE.Object3D();
  function turnWheels(distance: number) {
    for (const [i, radius] of wheelSize.entries()) {
      const side = i % 2 === 0 ? -1 : 1;
      const z = i < 2 ? 0.73 : -1.02;
      dummy.rotation.x = distance / radius;
      dummy.position.set(side * 0.79, radius, z);
      dummy.scale.set(0.32, radius, radius);
      dummy.updateMatrix();
      wheels.setMatrixAt(i, dummy.matrix);
      dummy.position.x = side * 0.966;
      dummy.scale.set(0.095, radius * 0.59, radius * 0.59);
      dummy.updateMatrix();
      rims.setMatrixAt(i, dummy.matrix);
      dummy.position.x = side * 1.019;
      dummy.scale.set(0.05, radius * 0.23, radius * 0.23);
      dummy.updateMatrix();
      hubs.setMatrixAt(i, dummy.matrix);
      for (let spoke = 0; spoke < 3; spoke++) {
        const angle = distance / radius + spoke * Math.PI * 2 / 3;
        dummy.rotation.x = angle;
        dummy.position.set(side * 1.013, radius * (1 + 0.38 * Math.cos(angle)), z + radius * 0.38 * Math.sin(angle));
        dummy.scale.set(0.03, radius * 0.27, 0.027);
        dummy.updateMatrix();
        spokes.setMatrixAt(3 * i + spoke, dummy.matrix);
      }
    }
    wheels.instanceMatrix.needsUpdate = rims.instanceMatrix.needsUpdate = hubs.instanceMatrix.needsUpdate = spokes.instanceMatrix.needsUpdate = true;
  }
  const shadow = diquePart(parent, flat, horizontalShadow());
  shadow.scale.set(3.75, 1, 2.54);
  const { canvas, context } = canvas2d(64, 64);
  const falloff = context.createRadialGradient(32, 32, 1, 32, 32, 32);
  falloff.addColorStop(0, 'rgba(255,207,142,0.72)');
  falloff.addColorStop(1, 'rgba(255,178,101,0)');
  context.fillStyle = falloff;
  context.fillRect(0, 0, 64, 64);
  const deckLight = new THREE.MeshBasicMaterial({
    map: texture(canvas), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const beam = diquePart(parent, flat, deckLight, false, 'Reflejo cálido del montacargas');
  beam.scale.set(4.90, 1, 2.99);
  return { truck, forks, turnWheels, shadow, beacon, lenses, reverse, beam, deckLight };
}

function pallet(parent: THREE.Group) {
  const freight = new THREE.Group();
  parent.add(freight);
  freight.name = 'Pallet de repuestos del muelle';
  const crate = standard(0x58716d, 0.73, 0.26);
  const latch = standard(0xb7a67e, 0.56, 0.30);
  for (const z of [-0.59, 0, 0.59]) {
    part(freight, timber, 0, 0.034, z, 1.30, 0.068, 0.17);
    part(freight, timber, 0, 0.176, z, 1.30, 0.076, 0.20);
    for (const x of [-0.57, 0, 0.57]) part(freight, timber, x, 0.102, z, 0.13, 0.075, 0.16);
  }
  part(freight, crate, 0, 0.559, 0, 1.19, 0.69, 1.18);
  for (const x of [-0.55, 0.55]) {
    part(freight, latch, x, 0.667, 0, 0.067, 0.58, 1.19);
    part(freight, latch, x, 0.936, 0, 0.067, 0.047, 1.21);
    part(freight, steel, x, 0.62, 0.594, 0.11, 0.16, 0.043);
  }
  for (const y of [0.36, 0.895]) part(freight, chassis, 0, y, 0.57, 1.21, 0.075, 0.086);
  const id = diqueSign(['MGP', 'REPUESTOS'], '#586462', '#e8d4a9', '#6b766b');
  const label = diquePart(freight, new THREE.PlaneGeometry(0.42, 0.19), new THREE.MeshStandardMaterial({ map: id, roughness: 0.85 }));
  label.position.set(0, 0.66, 0.599);
  freight.rotation.y = Math.PI / 2;
  mergeStatic(freight);
  return freight;
}

function pitMonitor(parent: THREE.Group, course: Course) {
  const s = course.pit.exit - 6;
  const p = course.sampleAt(s);
  const side = course.pit.side;
  const position = diqueEdge(course, p, side * (course.wallHalfAt(s, side) + 1.55));
  const approach = diqueEdge(course, course.sampleAt(s - 4), side * (course.roadHalfAt(s - 4) - 0.2));
  const tower = new THREE.Group();
  tower.name = 'Cámara de boxes y baliza de paso';
  tower.position.set(position.x, DIQUE_GROUND, position.z);
  parent.add(tower);
  part(tower, chassis, 0, 0.07, 0, 0.50, 0.14, 0.48);
  part(tower, steel, 0, 1.65, 0, 0.097, 3.20, 0.099);
  part(tower, chassis, 0, 1.05, 0.05, 0.31, 0.56, 0.22);
  const status = lamp(0xff9e37);
  part(tower, chassis, 0, 2.57, 0, 0.23, 0.26, 0.21);
  part(tower, status, 0, 2.69, 0.121, 0.13, 0.15, 0.043);
  const camera = new THREE.Group();
  camera.position.y = 3.30;
  camera.name = 'Cabezal de seguimiento del carril de boxes';
  tower.add(camera);
  part(camera, steel, 0, 0, 0.22, 0.29, 0.22, 0.43);
  part(camera, chassis, 0, -0.018, 0.449, 0.228, 0.17, 0.066);
  part(camera, standard(0x405879, 0.20, 0.47), 0, -0.018, 0.488, 0.115, 0.086, 0.029);
  mergeStatic(tower, new Set([camera]));
  mergeStatic(camera);
  const neutral = Math.atan2(approach.x - position.x, approach.z - position.z);
  camera.rotation.set(0.28, neutral, 0, 'YXZ');
  let yaw = neutral;
  let pitch = 0.28;
  let carSeen = false;
  return {
    observe(snapshot: RaceSnapshot) {
      const car = nearestCar(snapshot.cars, approach, 7.8);
      carSeen = Boolean(car);
      yaw = car ? Math.atan2(car.x - position.x, car.z - position.z) : neutral;
      pitch = car ? Math.atan2(tower.position.y + camera.position.y - car.y - 0.45,
        Math.hypot(car.x - position.x, car.z - position.z)) : 0.28;
    },
    update(now: number, seconds: number, night: boolean) {
      const blend = 1 - Math.exp(-seconds * 8.5);
      const delta = yaw - camera.rotation.y;
      camera.rotation.y += Math.atan2(Math.sin(delta), Math.cos(delta)) * blend;
      camera.rotation.x += (pitch - camera.rotation.x) * blend;
      status.emissiveIntensity = carSeen ? (night ? 1.85 : 1.20) + Math.sin(now / 125) * 0.25 : night ? 0.40 : 0.16;
    },
  };
}

function garageFans(parent: THREE.Group, course: Course) {
  const fans: THREE.Group[] = [];
  const surround = new THREE.TorusGeometry(0.37, 0.058, 7, 18);
  const backing = new THREE.CircleGeometry(0.387, 18);
  for (const s of course.pit.stalls.filter((_, index) => index % 2 === 1)) {
    const p = course.sampleAt(s);
    const q = diqueEdge(course, p, course.pit.stationOffset - 3.35);
    const vent = new THREE.Group();
    vent.name = 'Extractores de los boxes';
    vent.position.set(q.x, DIQUE_GROUND, q.z);
    vent.rotation.y = Math.atan2(-p.dz, p.dx);
    parent.add(vent);
    diquePart(vent, backing, chassis).position.set(-3.73, 3.37, -2.62);
    diquePart(vent, surround, steel).position.set(-3.73, 3.37, -2.55);
    const rotor = new THREE.Group();
    vent.add(rotor);
    rotor.position.set(-3.73, 3.37, -2.564);
    for (let blade = 0; blade < 5; blade++) {
      const angle = blade * Math.PI * 2 / 5;
      const vane = part(rotor, rim, Math.cos(angle) * 0.178, Math.sin(angle) * 0.178, 0, 0.269, 0.089, 0.046);
      vane.rotation.z = angle + 0.29;
    }
    part(rotor, steel, 0, 0, 0.023, 0.13, 0.13, 0.075);
    mergeStatic(rotor);
    fans.push(rotor);
  }
  return fans;
}

export function buildDiqueYard(parent: THREE.Group, course: Course) {
  const fixed = new THREE.Group();
  fixed.name = 'Patio de repuestos y cámaras del muelle';
  parent.add(fixed);
  workLane(fixed);
  const monitor = pitMonitor(fixed, course);
  const fans = garageFans(fixed, course);
  const vehicle = forklift(fixed);
  const cargo = pallet(fixed);
  const cargoShadow = diquePart(fixed, flat, horizontalShadow());
  cargoShadow.scale.set(1.97, 1, 1.92);
  let night = false;
  let time = 4.2;
  let last: number | undefined;
  let previousX = NaN;
  const wheelOrigin = forkliftYard.start - forkliftYard.forkReach - forkliftYard.withdrawal;
  function update(now: number) {
    const seconds = last === undefined ? 0 : Math.min(Math.max((now - last) / 1000, 0), 0.08);
    last = now;
    time += seconds;
    const pose = sampleDiqueForklift(time);
    vehicle.truck.position.set(pose.x, floor, forkliftYard.z);
    vehicle.forks.position.y = pose.lift;
    if (pose.x !== previousX) {
      vehicle.turnWheels(pose.x - wheelOrigin);
      previousX = pose.x;
    }
    vehicle.shadow.position.set(pose.x - 0.18, floor + 0.009, forkliftYard.z);
    vehicle.beam.position.set(pose.x + 1.74, floor + 0.012, forkliftYard.z);
    vehicle.deckLight.opacity = night ? 0.47 : 0.11;
    vehicle.reverse.emissiveIntensity = pose.speed < -0.07 ? (night ? 2.6 : 1.45) : 0.10;
    vehicle.lenses.emissiveIntensity = night ? 2.65 : 0.54;
    vehicle.beacon.emissiveIntensity = 0.38 + (Math.abs(pose.speed) > 0.035 || pose.lift > 0.01 ? 1.65 : 0.69)
      * Math.pow(0.5 + Math.sin(time * 8) * 0.5, 3);
    cargo.position.set(pose.cargoX, floor + pose.lift, forkliftYard.z);
    cargoShadow.position.set(pose.cargoX, floor + 0.007, forkliftYard.z);
    (cargoShadow.material as THREE.MeshBasicMaterial).opacity = 1 - pose.lift * 0.44;
    for (const [i, fan] of fans.entries()) fan.rotation.z = time * (i ? -7.3 : 9.6);
    monitor.update(now, seconds, night);
  }
  update(0);
  last = undefined;
  return {
    update,
    setNight(enabled: boolean) { night = enabled; },
    observe: monitor.observe,
  };
}
