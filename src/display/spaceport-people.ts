import * as THREE from 'three';
import type { Course } from '../shared/courses.ts';
import type { RaceSnapshot } from '../shared/protocol.ts';
import { crewHeadGeometry } from './crew-geometry.ts';

export interface SpaceportPerson {
  x: number;
  z: number;
  /** Sole contact height, in world metres. Defaults to the apron at −0.06. */
  y?: number;
  /** Local +Z is forward; yaw rotates around +Y. */
  yaw?: number;
  role: 'scientist' | 'technician' | 'security' | 'visitor' | 'photographer';
  /** A clear, level pedestrian segment. Three short stages are retraced on return. */
  to?: readonly [number, number];
  /** Animation offset in seconds. */
  phase?: number;
}

interface Person {
  placement: SpaceportPerson;
  x: number;
  z: number;
  y: number;
  yaw: number;
  phase: number;
  distance: number;
  scale: number;
  skin: number;
  hair: number;
  shirt: number;
  trousers: number;
  variant: number;
  looking: boolean;
  lookX: number;
  lookZ: number;
}

function makeBatch(parent: THREE.Group, name: string, geometry: THREE.BufferGeometry,
  material: THREE.Material, capacity: number) {
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.name = name;
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // Allocate even empty effects up front: the first flash must not allocate GPU attributes.
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  parent.add(mesh);
  return { mesh, capacity, used: 0, colors: new Int32Array(capacity).fill(-1), colorsChanged: false,
    matrixRange: { start: 0, count: 0 }, colorRange: { start: 0, count: 0 } };
}

type Batch = ReturnType<typeof makeBatch>;

function contactTexture() {
  const size = 16;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const radius = Math.hypot((x + .5) / size * 2 - 1, (y + .5) / size * 2 - 1);
    pixels[(y * size + x) * 4 + 3] = Math.round(Math.max(0, 1 - radius) ** 1.5 * 200);
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.needsUpdate = true;
  return texture;
}

/** Eight draw calls, shared low-poly parts, no per-frame vectors, arrays or color allocations. */
export function buildSpaceportPeople(parent: THREE.Group, course: Course, placements: readonly SpaceportPerson[]) {
  const group = new THREE.Group();
  group.name = 'Spaceport · científicos, técnicos y visitantes';
  group.userData.course = course.id;
  group.userData.peopleCount = placements.length;
  parent.add(group);

  const skins = [0xd9a582, 0xa66f51, 0x744c38, 0xe9bf9c, 0xbf8663];
  const hairs = [0x342a28, 0x68503c, 0x302d2d, 0xb8ada0, 0x947348];
  const shirts = [0x477a91, 0xb96946, 0x75895c, 0xe1c583, 0x784e6a, 0x57677b];
  const people: Person[] = placements.map((placement, i) => {
    const { x, z, y = -.06, yaw = 0, phase = i * 1.731, to } = placement;
    if (![x, z, y, yaw, phase, ...(to ?? [])].every(Number.isFinite)) {
      throw new RangeError(`Spaceport person ${i} has a non-finite placement`);
    }
    return { placement, x, z, y, yaw, phase, distance: to ? Math.hypot(to[0] - x, to[1] - z) : 0,
      scale: .94 + (i % 5) * .022, skin: skins[i % skins.length], hair: hairs[(i * 3) % hairs.length],
      shirt: placement.role === 'scientist' ? 0xe5e7df : placement.role === 'technician' ? 0x3b6273
        : placement.role === 'security' ? 0x283e53 : shirts[i % shirts.length],
      trousers: i % 3 === 0 ? 0x5d6466 : 0x2f424e, variant: i % 3, looking: false, lookX: x, lookZ: z };
  });

  const surface = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .81 });
  const screenMaterial = new THREE.MeshBasicMaterial({ color: 0xb8b8b8, toneMapped: false });
  const count = people.length;
  // Capacities include every role's maximum simultaneous pose, including handheld props.
  const boxes = makeBatch(group, 'People · uniforms and equipment', new THREE.BoxGeometry(1, 1, 1), surface, count * 42);
  const limbs = makeBatch(group, 'People · articulated sleeves and legs', new THREE.CylinderGeometry(.42, .5, 1, 6), surface, count * 12);
  const heads = makeBatch(group, 'People · faces', crewHeadGeometry(), surface, count);
  const hands = makeBatch(group, 'People · hands', new THREE.SphereGeometry(.5, 6, 3), surface, count * 2);
  const torsos = makeBatch(group, 'People · fitted jackets', new THREE.CylinderGeometry(.5, .41, 1, 8), surface, count);
  const hats = makeBatch(group, 'People · hair and safety helmets', new THREE.SphereGeometry(.5, 12, 3, 0, Math.PI * 2, 0, Math.PI / 2), surface, count);
  const screens = makeBatch(group, 'People · tablet screens and camera flashes', new THREE.BoxGeometry(1, 1, 1), screenMaterial, count * 2);
  const shadows = makeBatch(group, 'People · sole contact shadows', new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: 0xffffff, map: contactTexture(), transparent: true, opacity: .62,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), count);
  const batches = [boxes, limbs, heads, hands, torsos, hats, screens, shadows];
  // Detail follows the existing close/compact quality switch. Retain the
  // original far silhouettes and 25k crowd budget for four small viewports.
  const detailedGeometry = [limbs, heads, hands, torsos, hats].map(batch => batch.mesh.geometry);
  const compactGeometry = [new THREE.CylinderGeometry(.42, .5, 1, 4), new THREE.SphereGeometry(.5, 6, 4),
    new THREE.SphereGeometry(.5, 4, 2), new THREE.CylinderGeometry(.5, .41, 1, 5),
    new THREE.SphereGeometry(.5, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2)];
  const lodBatches = [limbs, heads, hands, torsos, hats];
  const root = new THREE.Object3D();
  const part = new THREE.Object3D();
  const matrix = new THREE.Matrix4();
  const direction = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();
  const dark = 0x273039;
  let detail = true;
  let startedAt: number | undefined;
  let lastRender: number | undefined;

  function write(batch: Batch, hex: number) {
    const slot = batch.used++;
    if (slot >= batch.capacity) throw new RangeError(`${batch.mesh.name}: instance capacity exceeded`);
    part.updateMatrix();
    batch.mesh.setMatrixAt(slot, matrix.multiplyMatrices(root.matrix, part.matrix));
    if (batch.colors[slot] !== hex) {
      batch.mesh.setColorAt(slot, color.setHex(hex));
      batch.colors[slot] = hex;
      batch.colorsChanged = true;
    }
  }

  function shape(batch: Batch, x: number, y: number, z: number, sx: number, sy: number, sz: number,
    hex: number, rx = 0, ry = 0, rz = 0) {
    part.position.set(x, y, z);
    part.rotation.set(rx, ry, rz);
    part.scale.set(sx, sy, sz);
    write(batch, hex);
  }

  function bone(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number,
    diameter: number, hex: number) {
    direction.set(x2 - x1, y2 - y1, z2 - z1);
    const length = direction.length();
    part.position.set((x1 + x2) * .5, (y1 + y2) * .5, (z1 + z2) * .5);
    part.quaternion.setFromUnitVectors(up, direction.multiplyScalar(1 / Math.max(length, .00001)));
    part.scale.set(diameter, length + diameter * .12, diameter);
    write(limbs, hex);
  }

  function pose(person: Person, time: number, dt: number) {
    const { placement, skin, shirt, trousers, variant } = person;
    const role = placement.role;
    const clock = time + person.phase;
    let heading = placement.yaw ?? 0;
    let stride = 0;
    let gait = 0;
    let walking = 0;
    if (person.distance > .05 && placement.to) {
      const walkTime = person.distance / (3 * .56);
      const stageTime = walkTime + .65;
      const legTime = stageTime * 3 + 1.8;
      const cycle = ((clock % (legTime * 2)) + legTime * 2) % (legTime * 2);
      const returning = cycle >= legTime;
      const leg = cycle % legTime;
      const stage = Math.min(2, Math.floor(leg / stageTime));
      const within = leg - stage * stageTime;
      const p = THREE.MathUtils.clamp(within / walkTime, 0, 1);
      const smooth = p * p * (3 - 2 * p);
      const progress = (stage + smooth) / 3;
      const fraction = returning ? 1 - progress : progress;
      person.x = placement.x + (placement.to[0] - placement.x) * fraction;
      person.z = placement.z + (placement.to[1] - placement.z) * fraction;
      walking = Math.sin(p * Math.PI);
      gait = progress * person.distance * 9.8;
      stride = Math.sin(gait) * walking;
      heading = Math.atan2(placement.to[0] - placement.x, placement.to[1] - placement.z) + (returning ? Math.PI : 0);
    }
    if (person.looking && walking < .1) heading = Math.atan2(person.lookX - person.x, person.lookZ - person.z);
    const turn = Math.atan2(Math.sin(heading - person.yaw), Math.cos(heading - person.yaw));
    person.yaw += turn * (1 - Math.exp(-dt * 5.5));
    root.position.set(person.x, person.y, person.z);
    root.rotation.set(0, person.yaw, 0);
    root.scale.setScalar(person.scale);
    root.updateMatrix();

    const settle = Math.sin(clock * 1.65) * .005 + Math.abs(stride) * .013;
    const chestY = 1.035 + settle;
    const headY = 1.459 + settle;
    const working = 1 - walking;
    const pointing = role === 'scientist' ? Math.max(0, Math.sin(clock * .53) - .55) / .45 * working : 0;
    const radio = role === 'security' ? THREE.MathUtils.smoothstep(Math.sin(clock * .64), -.2, .5) : 0;
    const phone = role === 'visitor' && variant !== 1;
    const camera = role === 'photographer';
    const cameraY = 1.405 + settle - walking * .32;

    shape(shadows, 0, .008, .015, .69, .57, 1, 0xffffff, -Math.PI / 2);
    shape(torsos, 0, chestY, 0, .43, .43, .275, shirt);
    shape(boxes, 0, .771 + settle, 0, .325, .16, .235, trousers);
    shape(boxes, 0, .824 + settle, 0, .342, .035, .247, dark);
    shape(boxes, 0, 1.309 + settle, 0, .11, .105, .11, skin);
    shape(heads, 0, headY, .003, .246, .28, .239, skin);
    shape(boxes, 0, headY - .009, .126, .047, .049, .055, skin);
    const hardhat = role === 'technician';
    const cap = role === 'security';
    shape(hats, 0, headY + .065, -.011, hardhat ? .29 : .253, hardhat ? .25 : .20,
      hardhat ? .285 : .248, hardhat ? 0xe3bd53 : cap ? 0x344b5c : person.hair);
    if (hardhat || cap) shape(boxes, 0, headY + .071, .07, hardhat ? .31 : .235, .024, .25,
      hardhat ? 0xf1c95e : 0x344b5c);
    if (detail) {
      shape(boxes, 0, headY - .075, .112, .070, .011, .014, 0x8c6252);
      shape(boxes, 0, chestY + .02, .141, .013, .31, .013, dark);
      shape(boxes, .074, .826 + settle, .134, .055, .035, .018, 0x9babad);
      shape(boxes, -.09, chestY + .08, .151, .090, .080, .014, hardhat ? 0x244c5c : 0x738e9a);
      shape(boxes, -.09, chestY + .10, .162, .064, .022, .006, 0xe1dccc);
      if (hardhat) {
        shape(boxes, 0, headY + .183, -.01, .047, .036, .21, 0xf1cb68);
        shape(boxes, 0, chestY - .06, -.144, .31, .045, .014, 0xe0e5ce);
      }
    }
    for (let side = -1; side <= 1; side += 2) {
      const glasses = role === 'scientist' || hardhat;
      shape(boxes, side * .058, headY + .025, .115, glasses ? .079 : .022, glasses ? .042 : .014,
        .018, glasses ? 0x617f89 : 0x343438);

      const footLift = Math.max(0, side * Math.cos(gait)) * walking * .11;
      const footX = side * .118;
      const footZ = side * stride * .21;
      const kneeY = .409 + footLift * .48 + settle * .45;
      const kneeZ = footZ * .48 + .035;
      bone(side * .108, .727 + settle, 0, footX, kneeY, kneeZ, .145, trousers);
      bone(footX, kneeY, kneeZ, footX, .105 + footLift, footZ, .108, trousers);
      shape(boxes, footX, .061 + footLift, footZ + .035, .133, .122, .239, dark);
      if (detail) {
        shape(boxes, footX, .014 + footLift, footZ + .04, .141, .026, .25, 0x161f22);
        shape(boxes, footX, .12 + footLift, footZ + .018, .066, .014, .085, 0x627175);
        shape(boxes, side * .10, 1.248 + settle, .08, .075, .032, .11, shirt, -.12, 0, side * -.25);
      }

      let elbowX = side * .255;
      let elbowY = .991 + settle;
      let elbowZ = -.04 - side * stride * .12;
      let handX = side * .253;
      let handY = .801 + settle;
      let handZ = .015 - side * stride * .23;
      if (role === 'scientist') {
        elbowX = side * .253;
        elbowY = 1.039 + settle;
        elbowZ = .105;
        handX = side < 0 ? -.135 : .075 + pointing * .265;
        handY = 1.059 + settle + (side > 0 ? .022 * Math.sin(clock * 3.1) + pointing * .19 : 0);
        handZ = .321 + (side > 0 ? pointing * .115 : 0);
      } else if (role === 'technician') {
        elbowY = .978 + settle;
        elbowZ = .105;
        handX = side * .145;
        handY = .934 + settle + (side > 0 ? Math.sin(clock * 2.7) * .018 : 0);
        handZ = .312;
      } else if (camera || phone) {
        elbowX = side * .268;
        elbowY = (camera ? 1.19 : 1.08) + settle - walking * .13;
        elbowZ = .16;
        handX = side * (camera ? .113 : .066);
        handY = camera ? cameraY - .018 : 1.267 + settle - walking * .23;
        handZ = camera ? .283 : .316;
      } else if (role === 'security' && side > 0) {
        elbowY += radio * .19;
        elbowZ += radio * .13;
        handX -= radio * .10;
        handY += radio * .59;
        handZ += radio * .12;
      } else if ((role === 'security' || role === 'visitor') && side < 0) {
        const wave = Math.max(0, Math.sin(clock * .75) - .45) / .55 * working;
        elbowY += wave * .12;
        elbowZ += wave * .12;
        handX -= wave * .055;
        handY += wave * .43;
        handZ += wave * .25;
      }
      bone(side * .204, 1.195 + settle, 0, elbowX, elbowY, elbowZ, .125, shirt);
      bone(elbowX, elbowY, elbowZ, handX, handY, handZ, .104, shirt);
      shape(hands, handX, handY, handZ, .085, .095, .083, hardhat ? 0x8a8473 : skin);

      if (role === 'technician') {
        shape(boxes, side * .108, chestY, .133, .123, .36, .028, 0xdca24a);
        shape(boxes, side * .108, chestY - .062, .151, .125, .039, .012, 0xdce7cf);
      } else if (role === 'scientist') {
        shape(boxes, side * .075, 1.166 + settle, .135, .071, .16, .024, 0xf2f2e7, 0, 0, side * -.21);
      } else if (role === 'security') {
        shape(boxes, side * .155, 1.237 + settle, .005, .092, .028, .19, 0x8c9c9f);
      }

      if (side > 0 && role === 'security') {
        shape(boxes, handX, handY + .027, handZ + .022, .065, .119, .046, dark);
        shape(boxes, handX + .021, handY + .109, handZ + .022, .012, .083, .012, dark);
      }
      if (side > 0 && role === 'technician') {
        // The grip and tool move together; the tip touches the sample held in the other hand.
        shape(boxes, handX, handY, handZ, .069, .075, .087, 0x315c63);
        bone(handX, handY, handZ + .035, -.105, .947 + settle, .359, .025, 0xb6c4c4);
      }
    }

    if (role === 'scientist') {
      shape(boxes, 0, .842 + settle, .009, .369, .173, .263, shirt);
      shape(boxes, -.126, 1.108 + settle, .155, .062, .075, .013, 0x6395a2);
      shape(boxes, -.02, 1.059 + settle, .345, .269, .036, .184, 0x354a57, -.3);
      shape(screens, -.02, 1.079 + settle, .338, .227, .007, .145, variant === 0 ? 0xb5d4bc : 0x78bbd0, -.3);
    } else if (role === 'technician') {
      shape(boxes, -.142, .952 + settle, .348, .122, .047, .112, 0x96a7aa);
      shape(boxes, -.19, .812 + settle, -.02, .098, .137, .13, 0x596766);
    } else if (role === 'security') {
      shape(boxes, -.09, 1.129 + settle, .147, .046, .063, .016, 0xd9be67);
      shape(boxes, -.18, .795 + settle, -.015, .096, .114, .12, dark);
    } else if (camera) {
      shape(boxes, 0, cameraY, .312, .237, .143, .118, 0x25343b);
      shape(limbs, 0, cameraY, .425, .115, .151, .115, 0x384955, Math.PI / 2);
      shape(limbs, 0, cameraY, .504, .105, .015, .105, 0x82a7b4, Math.PI / 2);
      shape(boxes, -.068, cameraY + .1, .323, .074, .058, .061, 0xb8c5c5);
      // A small emissive surface only; no light or bloom-producing particle cloud.
      const flash = ((clock % 11.7) + 11.7) % 11.7;
      if (detail && person.looking && walking < .1 && flash > 2.1 && flash < 2.175) {
        shape(screens, -.068, cameraY + .1, .358, .08, .046, .016, 0xf2f4e5);
      }
      bone(-.105, cameraY - .06, .27, -.11, 1.025 + settle, .16, .017, dark);
      bone(.105, cameraY - .06, .27, .11, 1.025 + settle, .16, .017, dark);
    } else if (phone) {
      const phoneY = 1.277 + settle - walking * .23;
      shape(boxes, 0, phoneY, .325, .087, .151, .021, 0x34404a, -.13);
      shape(screens, 0, phoneY, .312, .066, .123, .006, 0x94c6ce, -.13);
    } else {
      shape(boxes, 0, 1.051 + settle, -.193, .28, .325, .15, 0xa7865e);
      for (let side = -1; side <= 1; side += 2) {
        shape(boxes, side * .122, 1.104 + settle, .14, .031, .277, .021, 0x6d624e);
      }
    }
  }

  function render(time: number, dt: number) {
    for (let b = 0; b < batches.length; b++) {
      batches[b].used = 0;
      batches[b].colorsChanged = false;
    }
    for (let i = 0; i < people.length; i++) pose(people[i], time, dt);
    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b];
      const { mesh } = batch;
      mesh.count = batch.used;
      if (!batch.used) continue;
      batch.matrixRange.count = batch.used * 16;
      // The renderer clears ranges after uploading; reinsert the same objects next frame.
      mesh.instanceMatrix.updateRanges[0] = batch.matrixRange;
      mesh.instanceMatrix.updateRanges.length = 1;
      mesh.instanceMatrix.needsUpdate = true;
      if (batch.colorsChanged && mesh.instanceColor) {
        batch.colorRange.count = Math.max(batch.colorRange.count, batch.used * 3);
        mesh.instanceColor.updateRanges[0] = batch.colorRange;
        mesh.instanceColor.updateRanges.length = 1;
        mesh.instanceColor.needsUpdate = true;
      }
    }
  }

  render(0, 0);
  return {
    update(nowMs: number) {
      if (!Number.isFinite(nowMs)) return;
      startedAt ??= nowMs;
      const elapsed = lastRender === undefined ? 1000 / 30 : nowMs - lastRender;
      // Compact views keep every person, with less frequent skeletal buffer updates.
      if (elapsed >= 0 && elapsed < (detail ? 1000 / 30 : 1000 / 12)) return;
      const dt = THREE.MathUtils.clamp(elapsed / 1000, 0, .2);
      render(Math.max(0, (nowMs - startedAt) / 1000), dt);
      lastRender = nowMs;
    },
    observe(snapshot: RaceSnapshot) {
      for (let p = 0; p < people.length; p++) {
        const person = people[p];
        if (person.placement.role !== 'photographer') continue;
        person.looking = false;
        let closest = 20 * 20;
        for (let c = 0; c < snapshot.cars.length; c++) {
          const car = snapshot.cars[c];
          if (car.active === false || !Number.isFinite(car.y) || Math.abs(car.y - person.y) > 1.2) continue;
          const distance = (car.x - person.x) ** 2 + (car.z - person.z) ** 2;
          if (!(distance < closest)) continue;
          closest = distance;
          person.lookX = car.x;
          person.lookZ = car.z;
          person.looking = true;
        }
      }
    },
    setDetail(enabled: boolean) {
      if (detail === enabled) return;
      detail = enabled;
      for (let i = 0; i < lodBatches.length; i++) lodBatches[i].mesh.geometry = (enabled ? detailedGeometry : compactGeometry)[i];
      // Updating immediately prevents one frame of close accessories on the
      // compact mesh, and makes re-entering chase deterministic.
      render(lastRender === undefined || startedAt === undefined ? 0 : Math.max(0, (lastRender - startedAt) / 1000), 0);
    },
    setNight(night: boolean) { screenMaterial.color.setScalar(night ? .95 : .72); },
  };
}
