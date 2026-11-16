import * as THREE from 'three';
import type { RaceSnapshot } from '../shared/protocol.ts';
import { SPACEPORT_BUILDINGS } from './spaceport-campus-layout.ts';

const palette = { navy: 0x243f50, trim: 0x748991, glass: 0x335b6b, black: 0x19292e,
  concrete: 0x858d89, warm: 0xd7a568, white: 0xe5e5cf, orange: 0xd87d33 };
const smooth = (value: number, low: number, high: number) => THREE.MathUtils.smoothstep(value, low, high);

export interface SpaceportActivityOptions {
  /** Cloned once; the activity never modifies a campus material. */
  material?: THREE.MeshStandardMaterial;
}

/** A reversible delivery cycle: the same pallet stays supported at both ends. */
export function spaceportForkliftPose(seconds: number) {
  const t = THREE.MathUtils.euclideanModulo(seconds, 44);
  const outbound = smooth(t, 3, 14), inbound = smooth(t, 26, 37);
  const fork = .94 + .25 * smooth(t, 0, 3) - 1.03 * smooth(t, 14, 18)
    + 1.03 * smooth(t, 22, 26) - .25 * smooth(t, 37, 41);
  return { z: -194.7 + 9.5 * (outbound - inbound), fork,
    palletBase: Math.max(t < 3 || t > 37 ? .8 : .02, fork - .14) };
}

/** Six small, related systems, fourteen draws; no lights or extra render passes. */
export function buildSpaceportActivity(parent: THREE.Group, options: SpaceportActivityOptions = {}) {
  const group = new THREE.Group(); group.name = 'Spaceport · vida cotidiana y viento costero'; parent.add(group);
  const surface = options.material?.clone() ?? new THREE.MeshStandardMaterial({ roughness: .79 });
  surface.color.setHex(0xffffff); surface.vertexColors = false;
  const cloth = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .95, side: THREE.DoubleSide });
  const glow = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(.5, .5, 1, 8);
  const sphere = new THREE.SphereGeometry(.5, 8, 5);
  const cone = new THREE.CylinderGeometry(.86, 1, 1, 8, 1, true);
  const root = new THREE.Object3D(), part = new THREE.Object3D();
  const matrix = new THREE.Matrix4(), direction = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();
  let detail = true, startedAt: number | undefined, lastRender: number | undefined;

  function batch(name: string, geometry: THREE.BufferGeometry, capacity: number, material: THREE.Material = surface) {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.name = name; mesh.count = 0; mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    group.add(mesh);
    return { mesh, capacity, used: 0, colors: new Int32Array(capacity).fill(-1), colorChanged: false,
      matrixRange: { start: 0, count: 0 }, colorRange: { start: 0, count: 0 } };
  }
  type Batch = ReturnType<typeof batch>;
  const fixed = batch('Activity · fixed rails, pallets and supports', box, 280);
  const posts = batch('Activity · grounded poles and collars', cylinder, 60);
  const ground = batch('Activity · shoreline hummocks', sphere, 10);
  const fans = batch('Activity · HVAC rotors', box, 90);
  const lift = batch('Activity · forklift and cargo', box, 100);
  const wheels = batch('Activity · forklift wheels and driver', cylinder, 30);
  const heads = batch('Activity · forklift operator', sphere, 2);
  const doors = batch('Activity · sliding entrance leaves', box, 18);
  const socks = batch('Activity · windsocks', cone, 18, cloth);
  const cameras = batch('Activity · tracking camera heads', box, 18);
  const reeds = batch('Activity · bending coastal reeds', cylinder, 120);
  const foam = batch('Activity · wave crests', box, 44);
  const indicators = batch('Activity · work and access indicators', box, 10, glow);
  const flagGeometry = new THREE.PlaneGeometry(2.2, 1.15, 10, 3);
  // The pole edge is x=0, so all cloth motion vanishes at its attachment.
  flagGeometry.translate(1.1, -.575, 0);
  const flags = batch('Activity · coastal flags', flagGeometry, 3, cloth);
  const flagRest = new Float32Array(flagGeometry.attributes.position.array);
  const dynamic = [fans, lift, wheels, heads, doors, socks, cameras, reeds, foam, indicators, flags];
  const hvac = SPACEPORT_BUILDINGS.flatMap(site => Array.from({ length: site.width > 25 ? 3 : 2 }, (_, i) =>
    ({ x: site.x - site.width * .28 + i * site.width * .24,
      y: site.height + 1.47, z: site.z - site.depth * .18 })));
  const entries = SPACEPORT_BUILDINGS.filter(site => site.id === 'reception' || site.id === 'laboratory');
  const windSites = [
    { x: -108, y: 7.56, z: -37, height: 4.2, flag: true },
    { x: -46, y: 13.36, z: -124, height: 4.4, flag: true },
    { x: -31, y: 6.36, z: -260, height: 4.8, flag: false },
  ];
  const cameraSites = [
    { x: -100, y: 2.45, z: -313.85, yaw: 0, target: 0, tracking: false },
    { x: -81.5, y: 11.1, z: -73, yaw: .7, target: .7, tracking: false },
    { x: -44, y: 14.6, z: -117, yaw: -.6, target: -.6, tracking: false },
  ];
  const tufts = Array.from({ length: 10 }, (_, i) => ({
    x: -95 + i * 30, z: -464 - (i % 3) * 5.5, y: -3.65,
  }));

  function origin(x = 0, y = 0, z = 0, yaw = 0) {
    root.position.set(x, y, z); root.rotation.set(0, yaw, 0); root.updateMatrix();
  }
  function write(b: Batch, hex: number) {
    const slot = b.used++;
    if (slot >= b.capacity) throw new RangeError(`${b.mesh.name}: instance capacity exceeded`);
    part.updateMatrix(); b.mesh.setMatrixAt(slot, matrix.multiplyMatrices(root.matrix, part.matrix));
    if (b.colors[slot] !== hex) {
      b.mesh.setColorAt(slot, color.setHex(hex)); b.colors[slot] = hex; b.colorChanged = true;
    }
  }
  function shape(b: Batch, x: number, y: number, z: number, sx: number, sy: number, sz: number,
    hex: number, rx = 0, ry = 0, rz = 0) {
    part.position.set(x, y, z); part.rotation.set(rx, ry, rz); part.scale.set(sx, sy, sz); write(b, hex);
  }
  function beam(b: Batch, ax: number, ay: number, az: number, bx: number, by: number, bz: number,
    width: number, hex: number) {
    direction.set(bx - ax, by - ay, bz - az);
    const length = direction.length();
    part.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    part.quaternion.setFromUnitVectors(up, direction.multiplyScalar(1 / Math.max(.00001, length)));
    part.scale.set(width, length, width); write(b, hex);
  }
  function finish(b: Batch, isStatic = false) {
    b.mesh.count = b.used;
    b.matrixRange.count = b.used * 16;
    b.mesh.instanceMatrix.updateRanges[0] = b.matrixRange; b.mesh.instanceMatrix.updateRanges.length = 1;
    b.mesh.instanceMatrix.needsUpdate = true;
    if (b.colorChanged && b.mesh.instanceColor) {
      b.colorRange.count = Math.max(b.colorRange.count, b.used * 3);
      b.mesh.instanceColor.updateRanges[0] = b.colorRange; b.mesh.instanceColor.updateRanges.length = 1;
      b.mesh.instanceColor.needsUpdate = true;
    }
    if (isStatic) { b.mesh.computeBoundingSphere(); b.mesh.frustumCulled = true; }
  }
  function pallet(b: Batch, x: number, y: number, z: number, loaded: boolean) {
    for (const dx of [-.55, 0, .55]) shape(b, x + dx, y + .06, z, .14, .12, 1.2, palette.warm);
    for (let i = 0; i < 5; i++) shape(b, x, y + .19, z - .48 + i * .24, 1.45, .10, .19, palette.warm);
    if (!loaded) return;
    shape(b, x, y + .66, z, 1.30, .84, 1.07, palette.white);
    for (const dx of [-.44, .44]) {
      shape(b, x + dx, y + .66, z + .542, .055, .84, .018, palette.navy);
      shape(b, x + dx, y + 1.085, z, .055, .018, 1.07, palette.navy);
      shape(b, x + dx, y + .66, z - .542, .055, .84, .018, palette.navy);
    }
    shape(b, x, y + .76, z + .554, .41, .20, .012, palette.orange);
  }

  origin();
  for (const site of hvac) {
    for (let j = -2; j <= 2; j++) {
      shape(fixed, site.x + j * .35, site.y + .08, site.z, .035, .025, 1.8, palette.white);
    }
  }
  for (const site of entries) {
    const z = site.z + site.depth / 2;
    shape(fixed, site.x, 3.23, z + .35, 6.1, .16, .17, palette.trim);
    shape(fixed, site.x, .11, z + .34, 6.1, .035, .21, palette.trim);
    shape(fixed, site.x, 3.40, z + .36, .36, .15, .19, palette.black);
  }
  for (const site of windSites) {
    shape(fixed, site.x, site.y + .09, site.z, .75, .18, .75, palette.trim);
    shape(posts, site.x, site.y + site.height / 2, site.z, .10, site.height, .10, palette.white);
    shape(posts, site.x, site.y + site.height - .14, site.z, .16, .19, .16, palette.trim);
  }
  // The existing checkpoint post is reused; these two are attached to roof slabs.
  for (let i = 1; i < cameraSites.length; i++) {
    const site = cameraSites[i], base = i === 1 ? 9.76 : 13.36;
    shape(fixed, site.x, base + .06, site.z, .62, .12, .62, palette.trim);
    shape(posts, site.x, (site.y + base) / 2, site.z, .10, site.y - base, .10, palette.trim);
  }
  // Stock remains in the free eastern portion of the warehouse apron.
  for (const [x, z, count] of [[-89, -185.8, 2], [-86.8, -185.8, 3]]) {
    for (let level = 0; level < count; level++) pallet(fixed, x, -.03 + level * 1.10, z, true);
  }
  for (const x of [-97, -93.6]) shape(fixed, x, -.022, -190.1, .085, .016, 10.3, palette.orange);
  shape(fixed, -95.3, -.022, -183.9, 3.5, .016, .085, palette.orange);
  for (const tuft of tufts) shape(ground, tuft.x, -4.25, tuft.z, 4.7, 1.5, 3.3, 0x84907c);
  for (const b of [fixed, posts, ground]) finish(b, true);

  function render(time: number, dt: number) {
    for (const b of dynamic) { b.used = 0; b.colorChanged = false; }
    origin();
    for (let i = 0; i < hvac.length; i++) {
      const site = hvac[i], angle = time * (2.1 + i % 3 * .3) + i;
      for (let blade = 0; blade < 3; blade++) {
        const a = angle + blade * Math.PI * 2 / 3;
        shape(fans, site.x + Math.sin(a) * .48, site.y, site.z + Math.cos(a) * .48,
          .28, .045, .85, palette.trim, 0, a);
      }
      shape(fans, site.x, site.y + .02, site.z, .27, .08, .27, palette.white, 0, angle);
    }

    // Forklift local +Z points into dock three. Wheels, mast, carriage and cargo
    // share a transform; the cargo never snaps or passes through its support.
    const cycle = spaceportForkliftPose(time);
    origin(-95.3, -.03, cycle.z, Math.PI);
    shape(lift, 0, .58, -.06, 1.48, .48, 2.05, palette.orange);
    shape(lift, 0, .93, -.72, 1.40, .40, .55, palette.orange);
    shape(lift, 0, 1.05, -.15, .70, .13, .65, palette.black);
    shape(lift, 0, 1.28, -.34, .58, .45, .13, palette.black);
    for (const side of [-1, 1]) {
      for (const z of [-.70, .72]) {
        shape(wheels, side * .75, .31, z, .65, .25, .65, palette.black, 0, 0, Math.PI / 2);
        shape(wheels, side * .89, .31, z, .34, .035, .34, palette.trim, 0, 0, Math.PI / 2);
        // Hub markers make reversing wheel rotation visible without extra geometry.
        shape(lift, side * .912, .31, z, .018, .045, .28, palette.warm,
          -(cycle.z + 194.7) / .325);
      }
      shape(lift, side * .67, 1.59, -.60, .075, 1.44, .075, palette.trim);
      shape(lift, side * .67, 1.59, .68, .075, 1.44, .075, palette.trim);
      shape(lift, side * .49, 1.44, 1.04, .12, 2.45, .15, palette.black);
      shape(lift, side * .49, cycle.fork + .50, 1.13, .08, .87, .10, palette.trim);
      shape(lift, side * .40, cycle.fork, 1.91, .13, .065, 1.85, palette.trim);
    }
    shape(lift, 0, 2.35, 0, 1.49, .14, 1.59, palette.orange);
    shape(lift, 0, cycle.fork + .28, 1.15, 1.1, .10, .10, palette.trim);
    shape(lift, 0, .45 + cycle.fork * .40, .99, .07, .65 + cycle.fork * .80, .07, palette.white);
    pallet(lift, 0, cycle.palletBase + .03, 2.2, true);
    // Seated operator: feet touch the footwell; hands reach the steering wheel.
    shape(lift, 0, 1.37, -.20, .43, .49, .26, palette.navy);
    shape(heads, 0, 1.77, -.14, .25, .29, .25, 0xc79570);
    shape(heads, 0, 1.89, -.14, .31, .17, .31, 0xe5bc53);
    for (const side of [-1, 1]) {
      beam(wheels, side * .11, 1.16, -.14, side * .16, 1.13, .26, .14, palette.navy);
      beam(wheels, side * .16, 1.13, .26, side * .16, .91, .40, .12, palette.navy);
      shape(lift, side * .16, .88, .45, .15, .12, .25, palette.black);
      beam(wheels, side * .24, 1.51, -.15, side * .25, 1.28, .15, .11, palette.navy);
      beam(wheels, side * .25, 1.28, .15, side * .17, 1.39, .36, .09, 0xc79570);
      shape(lift, side * .10, 1.37, -.062, .10, .43, .018, palette.orange);
      shape(lift, side * .10, 1.29, -.049, .10, .04, .009, palette.white);
    }
    beam(wheels, 0, 1.0, .57, 0, 1.39, .36, .065, palette.trim);
    shape(wheels, 0, 1.39, .36, .40, .035, .40, palette.black, -.50);
    shape(indicators, 0, 2.48, -.42, .15, .17, .15,
      Math.sin(time * 8) > .1 ? 0xffb344 : 0x8b5f2d);

    origin();
    for (let i = 0; i < entries.length; i++) {
      const site = entries[i], phase = (time + i * 7) % 22;
      const opening = smooth(phase, 2, 3.4) * (1 - smooth(phase, 9.5, 11));
      const front = site.z + site.depth / 2;
      for (const side of [-1, 1]) {
        const x = site.x + side * (.72 + opening * 1.42);
        shape(doors, x, 1.65, front + .30, 1.35, 3, .06, palette.glass);
        shape(doors, x - side * .59, 1.65, front + .342, .055, 3, .045, palette.white);
        shape(doors, x, .19, front + .342, 1.35, .07, .045, palette.trim);
        shape(doors, x, 3.11, front + .342, 1.35, .07, .045, palette.trim);
      }
      shape(indicators, site.x, 3.40, front + .46, .13, .045, .015,
        opening > .01 ? 0x81d9bb : 0x597c85);
    }

    const wind = .48 + Math.sin(time * .17) * .25;
    const gust = .62 + Math.sin(time * .71) * .16 + Math.sin(time * 1.83) * .07;
    for (let i = 0; i < windSites.length; i++) {
      const site = windSites[i]; origin(site.x, site.y + site.height - .18, site.z, wind);
      let x = 0, y = 0, z = 0;
      for (let s = 0; s < 6; s++) {
        const nextX = x + .43, nextY = y - (1 - gust) * .07 - s * .012;
        const nextZ = Math.sin(time * 2.1 - s * .65) * .035 * (s + 1);
        beam(socks, x, y, z, nextX, nextY, nextZ, .30 * .86 ** s,
          s % 2 ? palette.white : palette.orange);
        x = nextX; y = nextY; z = nextZ;
      }
      if (site.flag) shape(flags, 0, -.70, 0, 1, 1, 1, i ? 0x5d96a8 : 0xdedac2);
    }
    const positions = flagGeometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = flagRest[i * 3], y = flagRest[i * 3 + 1];
      positions.setXYZ(i, x, y - .07 * x * (1 - gust),
        Math.sin(x * 3.1 - time * 3.3 + y * .55) * x * .09 * gust);
    }
    positions.needsUpdate = true; flagGeometry.computeVertexNormals();

    for (let i = 0; i < cameraSites.length; i++) {
      const site = cameraSites[i];
      const target = site.tracking ? site.target : (i - 1) * .35 + Math.sin(time * .20 + i * 2) * .70;
      site.yaw += Math.atan2(Math.sin(target - site.yaw), Math.cos(target - site.yaw)) * (1 - Math.exp(-dt * 2));
      origin(site.x, site.y, site.z, site.yaw);
      shape(cameras, 0, 0, 0, .18, .22, .18, palette.trim);
      shape(cameras, 0, .13, .22, .49, .28, .74, palette.white);
      shape(cameras, 0, .13, .60, .26, .18, .03, palette.black);
      shape(cameras, 0, .13, .62, .12, .105, .015, palette.glass);
      shape(cameras, 0, .29, .31, .55, .04, .74, palette.trim);
      shape(indicators, .18, .12, .603, .033, .033, .025, 0x72bb9a);
    }

    origin();
    for (let i = 0; i < tufts.length; i++) {
      const tuft = tufts[i];
      for (let s = 0; s < 6; s++) {
        const angle = s * 2.4, x = tuft.x + Math.sin(angle) * .38, z = tuft.z + Math.cos(angle) * .31;
        const height = .85 + (s % 3) * .24, bend = Math.sin(time * 1.9 + i + s * .2) * .12 + gust * .20;
        const tipX = x + Math.cos(wind) * bend, tipZ = z - Math.sin(wind) * bend;
        beam(reeds, x, tuft.y, z, tipX, tuft.y + height, tipZ, .035, 0x859057);
        beam(reeds, tipX, tuft.y + height, tipZ, tipX + .05, tuft.y + height + .21, tipZ,
          .085, 0xb4aa76);
      }
    }
    for (let i = 0; i < 44; i++) {
      const phase = (time * .11 + i * .618) % 1;
      const fade = Math.sin(phase * Math.PI) ** 2;
      shape(foam, -110 + (i * 43 % 320), -4.455, -490 - (i % 5) * 26 + phase * 9,
        (4 + i % 7) * Math.max(.001, fade), .012, .001 + fade * .16, 0xa3bcba, 0, .06 * Math.sin(i));
    }
    for (const b of dynamic) finish(b);
  }

  render(0, 0);
  return {
    update(nowMs: number) {
      if (!Number.isFinite(nowMs)) return;
      startedAt ??= nowMs;
      const elapsed = lastRender === undefined ? 1000 / 30 : nowMs - lastRender;
      if (elapsed >= 0 && elapsed < (detail ? 1000 / 30 : 1000 / 12)) return;
      render(Math.max(0, (nowMs - startedAt) / 1000), THREE.MathUtils.clamp(elapsed / 1000, 0, .2));
      lastRender = nowMs;
    },
    setNight(night: boolean) { glow.color.setScalar(night ? 1 : .65); },
    setDetail(enabled: boolean) { detail = enabled; },
    observe(snapshot: RaceSnapshot) {
      for (const site of cameraSites) {
        site.tracking = false;
        let distance = 85 ** 2;
        for (const car of snapshot.cars) {
          if (car.active === false || !Number.isFinite(car.x + car.z)) continue;
          const d = (car.x - site.x) ** 2 + (car.z - site.z) ** 2;
          if (d >= distance) continue;
          distance = d; site.target = Math.atan2(car.x - site.x, car.z - site.z); site.tracking = true;
        }
      }
    },
  };
}
