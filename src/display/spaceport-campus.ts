import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Course } from '../shared/courses';
import type { SpaceportPerson } from './spaceport-people';
import { canvas2d, random, texture } from './materials';
import { buildIndustrialFacade } from './industrial-facades';
import { roundedServicePath, SPACEPORT_BUILDINGS, SPACEPORT_SERVICE_LOOP, SPACEPORT_SERVICE_ROADS } from './spaceport-campus-layout';

interface PropWriter {
  box(x: number, y: number, z: number, w: number, h: number, d: number, color: number, rotation?: THREE.Quaternion): void;
  cylinder(x: number, y: number, z: number, radius: number, height: number, color: number, rotation?: THREE.Quaternion): void;
  sphere(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number): void;
  pipe(a: THREE.Vector3, b: THREE.Vector3, radius: number, color: number): void;
  part(geometry: THREE.BufferGeometry, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, rotation?: THREE.Quaternion): void;
  finish(): void;
}
type PartFactory = (parent: THREE.Object3D, material: THREE.MeshStandardMaterial, name: string, cell?: number,
  concrete?: THREE.MeshStandardMaterial) => PropWriter;

const palette = { navy: 0x243f50, wall: 0xc4c6bc, trim: 0x748991, glass: 0x335b6b, black: 0x19292e,
  concrete: 0x858d89, paving: 0xaaa99b, warm: 0xd7a568, white: 0xe5e5cf, orange: 0xd87d33, grass: 0x526d52 };
const p = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const up = new THREE.Vector3(0, 1, 0);
const circle = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const sphere = new THREE.SphereGeometry(1, 8, 5);

function campusSky(parent: THREE.Group) {
  const sky = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: { night: { value: 0 } },
    vertexShader: `varying vec3 direction; void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec3 direction;uniform float night;
      void main(){vec3 d=normalize(direction);float h=smoothstep(-.06,.80,d.y);
        vec3 day=mix(vec3(.72,.68,.56),vec3(.16,.34,.49),h);
        vec3 dark=mix(vec3(.055,.105,.15),vec3(.009,.022,.055),h);
        vec2 q=d.xz/(.22+max(0.,d.y));
        float cloud=sin(q.x*4.3+q.y*2.7)+.51*sin(q.x*8.1-q.y*3.1)+.25*sin(q.x*14.3+q.y*7.1);
        float cover=smoothstep(.13,.89,cloud)*smoothstep(.025,.16,d.y)*(1.-smoothstep(.62,.90,d.y));
        vec3 sunDir=normalize(vec3(-145.,88.,168.));
        float light=max(0.,dot(d,sunDir));
        day=mix(day,mix(vec3(.61,.67,.71),vec3(1.03,.93,.78),smoothstep(.37,.98,light)),cover*.63);
        day+=vec3(.22,.11,.035)*pow(light,16.)+vec3(1.0,.62,.29)*pow(light,420.);
        dark+=cover*vec3(.021,.030,.043);
        gl_FragColor=vec4(mix(day,dark,night),1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 14), sky);
  dome.name = 'Cielo costero y nubes lejanas'; dome.renderOrder = -1000; dome.frustumCulled = false;
  dome.onBeforeRender = (_renderer, _scene, camera) => {
    dome.position.copy(camera.position);
    dome.scale.setScalar((camera as THREE.PerspectiveCamera).far * .88);
    dome.updateMatrixWorld();
  };
  parent.add(dome);
  return sky;
}

function roadRibbon(parent: THREE.Group, source: THREE.MeshStandardMaterial) {
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  for (const road of SPACEPORT_SERVICE_ROADS) {
    const points = roundedServicePath(road.points);
    const edge = (i: number) => {
      const before = points[Math.max(0, i - 1)], after = points[Math.min(points.length - 1, i + 1)];
      const dx = after[0] - before[0], dz = after[1] - before[1], length = Math.hypot(dx, dz);
      return [-dz / length * road.width / 2, dx / length * road.width / 2];
    };
    for (let i = 1; i < points.length; i++) {
      const [ax, az] = points[i - 1], [bx, bz] = points[i];
      const [anx, anz] = edge(i - 1), [bnx, bnz] = edge(i);
      const at = positions.length / 3;
      for (const [x, z] of [[ax + anx, az + anz], [ax - anx, az - anz], [bx + bnx, bz + bnz], [bx - bnx, bz - bnz]]) {
        positions.push(x, -.037, z); uv.push(x, z);
      }
      indices.push(at, at + 2, at + 1, at + 1, at + 2, at + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const material = source.clone(); material.vertexColors = false; material.color.setHex(0x61676a);
  const mesh = new THREE.Mesh(geometry, material); mesh.receiveShadow = true;
  mesh.name = 'Red conectada de caminos de servicio'; parent.add(mesh);
}

function siteLabels(parent: THREE.Group, labels: { text: string; x: number; y: number; z: number; width: number; yaw?: number }[]) {
  if (typeof document === 'undefined') return;
  const { canvas, context } = canvas2d(1024, 1024);
  context.fillStyle = '#203747'; context.fillRect(0, 0, 1024, 1024);
  labels.forEach((label, index) => {
    const y = index * 64;
    context.fillStyle = '#50b6c3'; context.fillRect(0, y + 57, 1024, 3);
    context.fillStyle = '#e6e6d6'; context.textAlign = 'center'; context.font = '600 36px Arial';
    context.fillText(label.text, 512, y + 42, 980);
  });
  const material = new THREE.MeshStandardMaterial({ map: texture(canvas), roughness: .7,
    emissive: 0x536572, emissiveIntensity: .14 });
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  labels.forEach(({ x, y, z, width, yaw = 0 }, i) => {
    const height = Math.max(.65, width / 16), at = positions.length / 3;
    const dx = Math.cos(yaw) * width / 2, dz = -Math.sin(yaw) * width / 2;
    positions.push(x - dx, y - height / 2, z - dz, x + dx, y - height / 2, z + dz,
      x - dx, y + height / 2, z - dz, x + dx, y + height / 2, z + dz);
    uv.push(0, 1 - (i + 1) / 16, 1, 1 - (i + 1) / 16, 0, 1 - i / 16, 1, 1 - i / 16);
    indices.push(at, at + 1, at + 2, at + 2, at + 1, at + 3);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material); mesh.name = 'Directorio y carteles del centro'; parent.add(mesh);
}

export function buildSpaceportCampus(parent: THREE.Group, course: Course, batch: PartFactory,
  materials: { metal: THREE.MeshStandardMaterial; concrete: THREE.MeshStandardMaterial; roadway: THREE.MeshStandardMaterial;
    steel?: THREE.MeshStandardMaterial; paint?: THREE.MeshStandardMaterial }) {
  const group = new THREE.Group(); group.name = 'Campus habitado y paisaje del centro espacial'; parent.add(group);
  const d = batch(group, materials.metal, 'Arquitectura y equipamiento del campus', 52, materials.concrete);
  const landscapeMaterial = materials.concrete.clone(); landscapeMaterial.roughness = .96;
  const vegetation = batch(group, landscapeMaterial, 'Dunas, arbustos y vegetación costera', 65);
  const plantMaterial = landscapeMaterial.clone();
  const wind = { value: 0 };
  plantMaterial.onBeforeCompile = shader => {
    shader.uniforms.campusWind = wind;
    shader.vertexShader = 'uniform float campusWind;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nfloat sway = smoothstep(.08, 1.5, position.y); transformed.x += sin(campusWind * 1.7 + position.z * .43 + position.x * .19) * .095 * sway; transformed.z += cos(campusWind * 1.3 + position.x * .31) * .055 * sway;');
  };
  plantMaterial.customProgramCacheKey = () => 'campus-plants-wind-v1';
  const plants = batch(group, plantMaterial, 'Plantas y arbustos al viento', 65);
  const people: SpaceportPerson[] = [];
  const labels: Parameters<typeof siteLabels>[1] = [];
  const windows: { x: number; y: number; z: number; w: number; h: number; yaw?: number }[] = [];
  const bulbs: THREE.Vector3[] = [];
  const sky = campusSky(group);
  roadRibbon(group, materials.roadway);

  function person(role: SpaceportPerson['role'], x: number, z: number, yaw = 0, y = -.06, to?: [number, number]) {
    people.push({ role, x, z, yaw, y, to, phase: people.length * 1.713 });
  }
  function railing(ax: number, az: number, bx: number, bz: number, y = 0, height = 1.2) {
    const length = Math.hypot(bx - ax, bz - az), n = Math.ceil(length / 3.2);
    for (let i = 0; i <= n; i++) {
      const x = THREE.MathUtils.lerp(ax, bx, i / n), z = THREE.MathUtils.lerp(az, bz, i / n);
      d.box(x, y + height / 2, z, .085, height, .085, palette.trim);
      d.box(x, y + .04, z, .24, .08, .24, palette.concrete);
    }
    for (const lift of [.36, height]) d.pipe(p(ax, y + lift, az), p(bx, y + lift, bz), .045, palette.trim);
  }
  function walkway(ax: number, az: number, bx: number, bz: number, width = 2.4, base = 0) {
    const length = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az);
    const q = new THREE.Quaternion().setFromAxisAngle(up, yaw);
    d.box((ax + bx) / 2, base - .012, (az + bz) / 2, width, .12, length, palette.paving, q);
    for (let s = 2.5; s < length; s += 2.5) {
      d.box(THREE.MathUtils.lerp(ax, bx, s / length), base + .05, THREE.MathUtils.lerp(az, bz, s / length), width, .006, .025, palette.trim, q);
    }
  }
  function bollard(x: number, z: number) {
    d.cylinder(x, .40, z, .11, .86, palette.orange); d.cylinder(x, .56, z, .115, .15, palette.white);
  }
  function bench(x: number, z: number, base = 0) {
    for (const dx of [-.8, .8]) d.box(x + dx, base + .24, z, .1, .50, .58, palette.trim);
    d.box(x, base + .53, z, 2.0, .12, .65, palette.warm); d.box(x, base + .90, z - .26, 2.0, .52, .09, palette.warm);
  }
  function pole(x: number, z: number, height = 5) {
    d.box(x, height / 2, z, .12, height, .12, palette.trim);
    d.box(x, height, z, .8, .12, .37, palette.white); bulbs.push(p(x, height - .08, z));
  }

  // Buildings have foundations, framed glazing, accessible entrances, roof plant
  // and loading faces. Their public and technical sides face the appropriate road.
  for (const site of SPACEPORT_BUILDINGS) {
    const { x, z, width: w, depth: depth, height: h, style } = site;
    const front = z + depth / 2;
    const service = new THREE.Group(); service.position.set(x, 0, z); group.add(service);
    buildIndustrialFacade(service, w, depth, h, materials.paint ?? materials.metal, materials.steel ?? materials.metal,
      site.id === 'avionics' || site.id === 'instrumentation');
    d.box(x, -.065, z, w + 3, .15, depth + 3, palette.concrete);
    const shell = new RoundedBoxGeometry(w, h, depth, 2, .18);
    d.part(shell, x, h / 2, z, 1, 1, 1, style === 'warehouse' ? palette.navy : palette.wall);
    shell.dispose();
    d.box(x, .36, front + .08, w + .12, .72, .22, palette.navy);
    d.box(x, h + .18, z, w + .65, .36, depth + .65, palette.white);
    d.box(x, h + .58, z - depth / 2, w, .8, .18, palette.trim);
    d.box(x, h + .58, front, w, .8, .18, palette.trim);
    for (const side of [-1, 1]) d.box(x + side * w / 2, h + .58, z, .18, .8, depth, palette.trim);
    // Architectural scale: waterproof plinths, panel joints, roof drains and
    // anchored downpipes. Kept inside each existing foundation footprint.
    for (const side of [-1, 1]) {
      const wallX = x + side * (w / 2 + .07);
      d.box(wallX, .28, z, .16, .55, depth, palette.navy);
      for (let zz = z - depth / 2 + 3; zz < front - 1; zz += 5.8) {
        d.box(wallX, h * .53, zz, .025, h - 1.0, .034, palette.trim);
      }
      const drainZ = z - depth / 2 + .55;
      d.pipe(p(wallX + side * .19, .32, drainZ), p(wallX + side * .19, h + .3, drainZ), .065, palette.trim);
      d.pipe(p(wallX + side * .19, .32, drainZ), p(wallX + side * .55, .08, drainZ), .065, palette.trim);
      for (let yy = 1.3; yy < h; yy += 2.6) d.box(wallX + side * .14, yy, drainZ, .29, .055, .22, palette.navy);
      d.box(wallX + side * .45, .025, drainZ, .7, .025, 1.05, palette.black);
      for (let i = 0; i < 7; i++) d.box(wallX + side * .45, .043, drainZ + (i - 3) * .13, .62, .025, .028, palette.trim);
    }
    // A front emergency station, door hardware and real louver fins give each
    // building a serviced facade without blocking its protected access path.
    const serviceX = x + w * .40;
    d.box(serviceX, 1.40, front + .22, .62, .88, .26, palette.orange);
    d.box(serviceX, 1.40, front + .36, .49, .74, .025, palette.white);
    d.box(serviceX + .17, 1.40, front + .39, .024, .19, .04, palette.trim);
    d.box(serviceX, 2.04, front + .18, .65, .28, .06, palette.navy);
    const grilleX = x - w * .39;
    d.box(grilleX, h * .60, front + .12, 1.4, 1.2, .13, palette.black);
    for (let i = 0; i < 8; i++) d.box(grilleX, h * .60 + (i - 3.5) * .13, front + .22, 1.3, .045, .16, palette.trim);
    if (site.id === 'instrumentation' || site.id === 'crew' || site.id === 'laboratory') {
      // Small solar strings occupy the clear half of the roof, beside HVAC.
      const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -.16);
      for (let i = 0; i < 3; i++) {
        const xx = x + (i - 1) * 3.0, zz = z + depth * .22;
        for (const dx of [-1.15, 1.15]) for (const dz of [-1, 1]) {
          const top = 1.01 + dz * Math.sin(.16) - .05 * Math.cos(.16), leg = top - .36;
          d.box(xx + dx, h + .36 + leg / 2, zz + dz, .08, leg, .08, palette.trim);
        }
        d.box(xx, h + 1.01, zz, 2.65, .10, 3.5, palette.trim, tilt);
        d.box(xx, h + 1.07, zz, 2.48, .025, 3.3, palette.glass, tilt);
        for (let j = 0; j < 5; j++) d.box(xx + (j - 2) * .48, h + 1.095, zz, .02, .018, 3.24, palette.trim, tilt);
      }
    }
    if (style === 'warehouse') {
      for (const dx of [-10, 0, 10]) {
        d.box(x + dx, 2.9, front + .06, 7.6, 5.8, .17, palette.black);
        d.box(x + dx, 4.55, front + .18, 7.35, 2.3, .11, palette.trim);
        for (let y = 3.45; y < 5.8; y += .27) d.box(x + dx, y, front + .25, 7.3, .035, .02, palette.navy);
        d.box(x + dx, .40, front + 1.4, 7.7, .8, 2.8, palette.concrete);
        d.box(x + dx, .30, front + 2.9, 6.8, .60, .15, palette.black);
        for (const side of [-1, 1]) bollard(x + dx + side * 4.1, front + 3.3);
        d.box(x + dx, 6.15, front + .52, 8.6, .18, 1.5, palette.white);
        d.box(x + dx - 1.8, 1.3, front + .65, 1.2, 1.0, 1.1, palette.warm);
      }
      for (let dx = -w / 2 + 2; dx < w / 2; dx += 2.8) d.box(x + dx, h * .57, z - depth / 2 - .03, .065, h * .86, .07, palette.trim);
      d.box(x - 14, 1.05, front + .14, 1.7, 2.1, .12, palette.white);
    } else {
      const floors = style === 'office' && h > 10 ? 3 : h > 7.5 ? 2 : 1;
      const bays = Math.floor(w / 4.4);
      for (let floor = 0; floor < floors; floor++) for (let i = 0; i < bays; i++) {
        const xx = x + (i - (bays - 1) / 2) * 4.3, yy = 2.6 + floor * 3.4;
        if (floor === 0 && Math.abs(xx - x) < 3) continue;
        d.box(xx, yy, front + .10, 3.7, 2.25, .20, palette.trim);
        d.box(xx, yy, front + .22, 3.37, 1.96, .04, palette.glass);
        d.box(xx, yy, front + .25, .08, 1.98, .045, palette.white);
        windows.push({ x: xx, y: yy + .43, z: front + .255, w: 3.0, h: .045 });
        if (style === 'lab') {
          d.box(xx, yy - .47, front + .28, 2.7, .07, .04, palette.white);
          for (const dx of [-.7, .7]) d.box(xx + dx, yy - .17, front + .29, .38, .46, .02, 0x71a8a1);
        }
      }
      d.box(x, 1.65, front + .11, 3.2, 3.3, .17, palette.navy);
      for (const side of [-1, 1]) {
        if (site.id !== 'reception' && site.id !== 'laboratory') {
          d.box(x + side * .72, 1.65, front + .23, 1.35, 3.0, .04, palette.glass);
          d.box(x + side * .13, 1.32, front + .29, .04, .55, .04, palette.white);
        }
        d.box(x + side * 3.9, 1.73, front + 2.3, .13, 3.46, .13, palette.trim);
      }
      d.box(x, 3.58, front + 1.2, 8.4, .20, 3.3, palette.navy);
      d.box(x, .015, front + 2.4, 8.8, .16, 5.1, palette.paving);
      for (const side of [-1, 1]) bollard(x + side * 3.3, front + 4.7);
      walkway(x, front + 5.0, x < -140 ? -174 : -75.8, front + 5.0);
    }
    if (x < -140) {
      // The street-facing east elevation stays legible from the race camera;
      // entrances use the protected west promenade, away from the racing lane.
      const q = new THREE.Quaternion().setFromAxisAngle(up, Math.PI / 2);
      for (let zz = z - depth / 2 + 3.2; zz < front - 1.5; zz += 4.1) {
        d.box(x + w / 2 + .12, 2.7, zz, 3.4, 2.1, .20, palette.trim, q);
        d.box(x + w / 2 + .24, 2.7, zz, 3.05, 1.77, .045, palette.glass, q);
        d.box(x + w / 2 + .29, 2.7, zz, .07, 1.8, .04, palette.white, q);
        windows.push({ x: x + w / 2 + .28, y: 3.2, z: zz, w: 2.8, h: .045, yaw: Math.PI / 2 });
      }
      labels.push({ text: site.label, x: x + w / 2 + .30, y: h - .85, z, width: depth - 2.5, yaw: Math.PI / 2 });
    }
    if (site.id === 'laboratory' || site.id === 'mission' || site.id === 'reception') {
      const q = new THREE.Quaternion().setFromAxisAngle(up, -Math.PI / 2);
      for (let zz = z - depth / 2 + 3; zz < front - 1; zz += 4.3) {
        for (let yy = 2.7; yy < h - 1.4; yy += 3.4) {
          d.box(x - w / 2 - .10, yy, zz, 3.2, 2.05, .20, palette.trim, q);
          d.box(x - w / 2 - .23, yy, zz, 2.9, 1.74, .04, palette.glass, q);
          d.box(x - w / 2 - .28, yy, zz, .07, 1.78, .04, palette.white, q);
          windows.push({ x: x - w / 2 - .27, y: yy + .48, z: zz, w: 2.65, h: .045, yaw: -Math.PI / 2 });
        }
      }
      d.pipe(p(x - w / 2 - .20, .2, z - depth / 2 + .35),
        p(x - w / 2 - .20, h - .3, z - depth / 2 + .35), .065, palette.trim);
    }
    for (let i = 0; i < (w > 25 ? 3 : 2); i++) {
      const xx = x - w * .28 + i * w * .24;
      d.box(xx, h + .75, z - depth * .18, 3.0, 1.1, 3.8, palette.trim);
      d.cylinder(xx, h + 1.36, z - depth * .18, 1.05, .15, palette.black);
      d.pipe(p(xx, h + .2, z), p(xx, h + .2, front - 2), .13, palette.trim);
    }
    labels.push({ text: site.label, x, y: h - .65, z: front + .28, width: w * .84 });
  }
  // The mission annex is physically connected to the original control building.
  d.box(-40, 5.0, -114, 4.8, .35, 3.6, palette.trim);
  d.box(-40, 6.35, -114, 4.8, 2.4, 3.2, palette.glass);
  d.box(-40, 7.7, -114, 5, .3, 3.6, palette.white);
  for (const x of [-42, -40, -38]) d.box(x, 6.35, -112.36, .07, 2.4, .07, palette.trim);

  // Kerbs, pedestrian paths and lane paint give every arrival a destination.
  walkway(-76, -305, -76, -18, 2.5);
  walkway(-76, -18, 100, -18, 2.4);
  walkway(-174, -153, -174, 22, 2.6);
  walkway(-174, 22, -84, 22, 2.6);
  for (let i = 0; i < 4; i++) d.box(-84 + i * .5, .06 + i * .12, 22, .55, .12, 2.6, palette.concrete);
  for (const z of [-140, -112, -82, -54, -22]) { pole(-177, z); bench(-177, z + 4); }
  // Protected observation terrace faces the new courtyard bend.
  d.box(-138.1, .04, -132.5, 3.2, .20, 19, palette.paving);
  railing(-136.65, -142, -136.65, -123, .14, 1.2);
  walkway(-138.1, -123, -138.1, -116.5, 2.3);
  walkway(-138.1, -116.5, -150, -116.5, 2.3);
  for (const z of [-140, -124]) pole(-139, z, 4.5);
  d.box(-138.4, .65, -137, 1.1, 1.02, .7, palette.navy);
  d.box(-138.4, 1.18, -137, 1.25, .12, .8, palette.warm);
  for (const side of [-1, 1]) {
    d.box(-128 + side * 5.6, 2.35, -170, .30, 4.7, .30, palette.trim);
    d.box(-128 + side * 5.6, .10, -170, .90, .20, .90, palette.concrete);
    bulbs.push(p(-128 + side * 5.6, 5.0, -170));
  }
  d.box(-128, 4.65, -170, 12, .7, .30, palette.navy);
  labels.push({ text: 'CAMPUS / PRUEBAS DE PRECISIÓN', x: -128, y: 4.65, z: -170.17, width: 11.4, yaw: Math.PI });
  for (const road of SPACEPORT_SERVICE_ROADS) {
    const points = roundedServicePath(road.points);
    let carried = 0;
    for (let i = 1; i < points.length; i++) {
      const [ax, az] = points[i - 1], [bx, bz] = points[i], length = Math.hypot(bx - ax, bz - az);
      const dx = (bx - ax) / length, dz = (bz - az) / length;
      const q = new THREE.Quaternion().setFromAxisAngle(up, Math.atan2(dx, dz));
      for (const side of [-1, 1]) {
        d.box((ax + bx) / 2 - dz * side * (road.width / 2 + .16), -.005,
          (az + bz) / 2 + dx * side * (road.width / 2 + .16), .26, .18, length + .08, palette.concrete, q);
      }
      for (let at = carried; length > 4 && at < length; at += 7) {
        d.box(ax + dx * at, -.023, az + dz * at, .10, .015, Math.min(2.2, length - at), palette.white, q);
      }
      carried = (carried + 7 - length % 7) % 7;
    }
  }
  for (const [x, z] of [[-70, -64], [-70, -148], [-18, -24], [67, -110]]) {
    for (let i = -3; i <= 3; i++) d.box(x + i * .65, -.019, z, .4, .02, 6.8, palette.white);
  }
  // Parking and logistics staging bays, kept clear of the race and through lanes.
  for (const [x, z, w, depth] of [[-113, -61, 22, 13], [-102, -190, 39, 13], [145, -76, 12, 24], [-94, -300, 16, 19]]) {
    d.box(x, -.061, z, w, .03, depth, palette.paving);
    for (let xx = x - w / 2 + 2.5; xx < x + w / 2; xx += 3.2) d.box(xx, -.038, z, .08, .01, depth - 2, palette.white);
  }
  for (const [x, z] of [[-121, -192], [-84, -192], [141, -87], [141, -66]]) {
    for (let i = 0; i < 3; i++) {
      d.box(x, .10 + i * .85, z, 2.5, .18, 1.7, palette.warm);
      d.box(x, .53 + i * .85, z, 2.15, .68, 1.40, i % 2 ? palette.navy : palette.white);
      for (const dx of [-.75, .75]) d.box(x + dx, .53 + i * .85, z + .71, .08, .68, .025, palette.trim);
    }
  }
  for (const [x, z] of [[-81, -231], [-122, -227], [144, -115]]) {
    for (let i = 0; i < 4; i++) {
      d.cylinder(x + i * .80, .42, z, .32, .90, i % 2 ? palette.orange : palette.navy);
      for (const y of [.14, .68]) d.cylinder(x + i * .80, y, z, .335, .045, palette.trim);
    }
  }

  // Security perimeter and a real access road under the tall rear bridge.
  railing(-124, -310, -115, -310, 0, 2.4);
  railing(-99, -310, -80, -310, 0, 2.4);
  railing(-124, -310, -124, -335, 0, 2.4);
  for (const z of [-335, -327, -319]) pole(-99.5, z, 5.5);
  d.box(-112.7, .75, -314, .60, 1.5, .60, palette.orange);
  const barrier = new THREE.Group(); barrier.position.set(-112.7, 1.35, -314); group.add(barrier);
  const gateParts = batch(barrier, materials.metal, 'Barrera de acceso articulada');
  gateParts.box(3.1, 0, 0, 6.2, .17, .14, palette.white);
  for (let x = .5; x < 6; x += .85) gateParts.box(x, 0, .075, .40, .18, .018, palette.orange);
  gateParts.finish();
  d.box(-100, 1.25, -314, .38, 2.5, .38, palette.trim);
  labels.push({ text: 'BASE ESPACIAL / ACCESO AUTORIZADO', x: -107, y: 5.8, z: -311.8, width: 18 });
  for (const x of [-117, -97]) d.box(x, 2.7, -312, .20, 5.7, .20, palette.trim);
  d.box(-107, 5.8, -312, 20.5, 1.2, .25, palette.navy);

  // Public terrace is outside the racing line, with a separate pedestrian bridge.
  d.box(-28, .22, 20, 108, .56, 14, palette.concrete);
  walkway(-78, 22, 20, 22, 3.0, .50);
  railing(-82, 12.8, 26, 12.8, .50, 1.2);
  railing(-82, 27.2, 26, 27.2, .50, 1.2);
  for (const x of [-70, -54, 2, 18]) {
    bench(x, 22, .50); pole(x + 5, 25, 4.5);
    d.cylinder(x + 3.1, 1.04, 22.3, .37, 1.05, palette.navy);
    d.cylinder(x + 3.1, 1.59, 22.3, .40, .07, palette.trim);
  }
  for (const x of [-68, 8]) {
    for (const dx of [-6, 6]) for (const z of [17, 25]) d.box(x + dx, 2.4, z, .14, 3.8, .14, palette.trim);
    d.box(x, 4.4, 21, 14, .15, 10, palette.white);
    d.box(x, 4.17, 26.02, 14, .38, .12, palette.navy);
  }
  labels.push({ text: 'MIRADOR / ZONA DE VISITANTES', x: -28, y: 1.18, z: 27.32, width: 23 });
  d.box(-19, 4.9, 0, 3.3, .30, 18, palette.navy);
  for (const x of [-20.6, -17.4]) railing(x, -9, x, 9, 5.05, 1.2);
  for (const z of [-8.5, 8.5]) for (const x of [-20.4, -17.6]) d.box(x, 2.4, z, .22, 4.8, .22, palette.trim);
  for (const side of [-1, 1]) {
    const steps = side < 0 ? 21 : 19;
    for (let i = 0; i < steps; i++) {
      const y = 4.8 - i * .24, z = side * (9.2 + i * .48);
      d.box(-19, y, z, 3.3, .23, .55, palette.concrete);
    }
    for (const x of [-20.6, -17.4]) {
      d.pipe(p(x, 6.1, side * 8.7), p(x, side < 0 ? 1.3 : 1.8, side * (9.3 + (steps - 1) * .48)), .055, palette.trim);
    }
  }
  // Cable trays, launch exclusion fence and field instruments occupy the scale
  // between the large tower and human work, without becoming racing obstacles.
  railing(-7, -220, 64, -220, 0, 2.2);
  railing(64, -220, 64, -145, 0, 2.2);
  for (let x = -4; x < 60; x += 8) {
    d.box(x, 1.05, -219.95, 1.1, .65, .05, palette.orange);
    d.box(x, 1.05, -219.91, .13, .40, .02, palette.black);
  }
  for (const [x, z] of [[-50, -278], [-23, -244], [4, -225]]) {
    d.box(x, .12, z, 3.6, .35, 3.1, palette.concrete);
    d.box(x, .95, z, 2.2, 1.35, 1.35, palette.navy);
    d.cylinder(x, 2.8, z, .055, 3.4, palette.white);
    d.pipe(p(x - .8, 3.9, z), p(x + .8, 3.9, z), .04, palette.trim);
    d.sphere(x + .85, 3.9, z, .14, .14, .14, palette.orange);
  }
  for (const [x, z] of [[-76, -300], [-76, -244], [-75, -187], [-75, -135], [-75, -58], [95, -20], [150, -48], [150, -127]]) pole(x, z);

  const rng = random(71234);
  const roadClear = (x: number, z: number, radius: number) => !course.samples.some((point, i) => i % 8 === 0 && point.y < 4
    && Math.hypot(point.x - x, point.z - z) < course.wallHalfAt(point.s, 1) + radius + 1.1);
  function bush(x: number, z: number, scale: number, base = 0) {
    if (!roadClear(x, z, scale)) return;
    for (let i = 0; i < 3; i++) {
      const angle = i * Math.PI * 2 / 3;
      plants.sphere(x + Math.cos(angle) * scale * .3, base + .4 * scale, z + Math.sin(angle) * scale * .3,
        .7 * scale, .55 * scale, .7 * scale, [0x596f4e, 0x687b50, 0x465c46][i]);
    }
    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI / 2;
      plants.pipe(p(x, base + .05, z), p(x + Math.cos(angle) * scale * .7, base + scale * 1.2, z + Math.sin(angle) * scale * .7), .025 * scale, 0x8e945d);
    }
  }
  for (let i = 0; i < 64; i++) {
    const side = i % 2 ? -1 : 1;
    const x = side < 0 ? -194 + rng() * 4 : 218 + rng() * 13, z = -12 - rng() * 347;
    vegetation.sphere(x, -.03, z, 3 + rng() * 5, .35 + rng() * .70, 4 + rng() * 7, 0xb5aa87);
    bush(x + 1.5, z, .5 + rng() * .6);
  }
  // Small coastal vegetation and stone clusters break up the large bare plinth.
  // Keep all dressing away from racing, service roads and occupied aprons.
  const grass = new THREE.BufferGeometry();
  grass.setAttribute('position', new THREE.Float32BufferAttribute([
    -.24, 0, 0, .24, 0, 0, .10, 1, .04,
    0, 0, -.22, 0, 0, .22, -.09, .83, .06,
    -.16, 0, -.16, .16, 0, .16, .18, .72, -.10,
  ], 3));
  grass.computeVertexNormals();
  const serviceClear = (x: number, z: number) => SPACEPORT_SERVICE_ROADS.every(road => road.points.every((b, i) => {
    if (!i) return true; const a = road.points[i - 1], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = THREE.MathUtils.clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz), 0, 1);
    return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz) > road.width * .5 + 2;
  }));
  for (const [cx, cz] of [[123, -284], [151, -220], [12, -315], [14, -53], [-20, -345], [180, -340]]) {
    for (let i = 0; i < 58; i++) {
      const angle = rng() * Math.PI * 2, radius = Math.sqrt(rng()) * 15;
      const x = cx + Math.cos(angle) * radius, z = cz + Math.sin(angle) * radius;
      if (!roadClear(x, z, 1.1) || !serviceClear(x, z)) continue;
      if (SPACEPORT_BUILDINGS.some(b => Math.abs(x - b.x) < b.width * .5 + 4 && Math.abs(z - b.z) < b.depth * .5 + 4)) continue;
      const size = .24 + rng() * .54;
      plants.part(grass, x, -.065, z, size, size, size, i % 3 ? 0x7d8957 : 0xb2a46b,
        new THREE.Quaternion().setFromAxisAngle(up, angle));
      if (i % 4 === 0) vegetation.sphere(x + .4, -.03, z + .2, .18 + rng() * .3, .10 + rng() * .12, .25, 0x8c8876);
    }
  }
  grass.dispose();
  for (const [x, z] of [[-121, -36], [-121, -41], [-85, -45], [-78, -78], [-78, -90], [-62, -119], [-62, -124], [-83, -214], [-83, -222], [-87, 25], [31, 20], [58, -54], [67, -80]]) {
    vegetation.box(x, .11, z, 3.3, .3, 3.3, palette.concrete); bush(x, z, 1.2);
  }
  // The racing street passes a working rover checkout pad, instead of an empty
  // strip between instrument and crew buildings. Its entire 8×10 m apron is
  // separated from the track by >4 m; staff enter from the west promenade.
  d.box(-145, -.025, -53, 8, .13, 10, palette.paving);
  walkway(-174, -53, -149, -53, 2.1);
  railing(-140.8, -58, -140.8, -48, .04, 1.1);
  for (const z of [-57.5, -48.5]) {
    vegetation.box(-145, .21, z, 6.0, .34, 1.0, palette.concrete);
    for (const x of [-147, -145, -143]) bush(x, z, .42, .36);
  }
  // Six-wheel test rover: suspended chassis, steering hubs, solar deck,
  // instrument mast and a camera pointed toward its calibration target.
  const wheelQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  d.box(-145.8, .90, -54.9, 1.60, .45, 2.25, palette.white);
  d.box(-145.8, 1.16, -54.9, 2.05, .075, 2.5, palette.trim);
  d.box(-145.8, 1.21, -54.9, 1.94, .03, 2.38, palette.glass);
  for (const dx of [-.66, 0, .66]) d.box(-145.8 + dx, 1.235, -54.9, .025, .015, 2.38, palette.trim);
  for (const side of [-1, 1]) for (const dz of [-.84, 0, .84]) {
    d.pipe(p(-145.8 + side * .55, .74, -54.9), p(-145.8 + side * 1.05, .40, -54.9 + dz), .055, palette.trim);
    d.cylinder(-145.8 + side * 1.08, .40, -54.9 + dz, .35, .25, palette.black, wheelQ);
    d.cylinder(-145.8 + side * 1.22, .40, -54.9 + dz, .18, .025, palette.trim, wheelQ);
  }
  d.cylinder(-145.8, 1.79, -55.55, .075, 1.10, palette.trim);
  d.box(-145.8, 2.35, -55.55, .64, .24, .32, palette.white);
  for (const dx of [-.19, .19]) d.cylinder(-145.8 + dx, 2.35, -55.36, .085, .055, palette.black, circle);
  // Diagnostic cart, tether and checker target are tied to this task.
  for (const dx of [-.53, .53]) for (const dz of [-.30, .30]) {
    d.cylinder(-142.6 + dx, .17, -52 + dz, .12, .07, palette.black, wheelQ);
    d.box(-142.6 + dx, .62, -52 + dz, .06, .85, .06, palette.trim);
  }
  d.box(-142.6, 1.07, -52, 1.35, .08, .83, palette.trim);
  d.box(-142.6, 1.54, -52.27, 1.05, .63, .10, palette.navy);
  d.box(-142.6, 1.54, -52.205, .93, .50, .025, palette.glass);
  for (let i = 0; i < 4; i++) d.box(-142.91, 1.35 + i * .11, -52.185, .25 + i * .12, .025, .01, palette.white);
  for (const [a, b] of [[[-145, .78, -53.8], [-145, .06, -53.8]], [[-145, .06, -53.8], [-144.4, .06, -52.4]], [[-144.4, .06, -52.4], [-142.6, .06, -51.8]],
    [[-142.6, .06, -51.8], [-142.6, 1.06, -51.8]]] as const) d.pipe(p(a[0], a[1], a[2]), p(b[0], b[1], b[2]), .025, palette.black);
  d.box(-145.8, .65, -51.65, .06, 1.2, .06, palette.trim);
  d.box(-145.8, 1.25, -51.65, 1.24, .94, .06, palette.white);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) if ((i + j) % 2) {
    d.box(-145.8 + (i - 1.5) * .29, 1.25 + (j - 1) * .29, -51.69, .29, .29, .025, palette.black);
  }
  labels.push({ text: 'ENSAYO ROVER', x: -140.72, y: .64, z: -49.6, width: 2.6, yaw: Math.PI / 2 });
  d.box(-140.8, .64, -49.6, .12, .72, 2.8, palette.navy);
  person('scientist', -143.0, -50.9, Math.PI, .04);
  person('technician', -144.2, -54.6, -Math.PI / 2, .04);
  person('scientist', -148, -51.8, .8, .04);
  person('technician', -163, -53, Math.PI / 2, .05, [-151, -53]);
  // Low distant coastal terrain remains visible from chase cameras, while the
  // raised plinth keeps the toy-diorama boundary legible from the overview.
  for (let i = 0; i < 24; i++) {
    const x = -250 + i * 27;
    vegetation.sphere(x, -4, -431 - rng() * 25, 27 + rng() * 24, 3 + rng() * 7, 22, 0x84907c);
  }
  const coastMaterial = new THREE.MeshStandardMaterial({ color: 0x608d91, roughness: .35, metalness: .28 });
  const coast = new THREE.Mesh(new THREE.PlaneGeometry(10000, 5000), coastMaterial);
  coast.rotation.x = -Math.PI / 2; coast.position.set(45, -4.5, -2880);
  coast.name = 'Mar al fondo de la base'; coast.receiveShadow = false; group.add(coast);
  const plainMaterial = new THREE.MeshStandardMaterial({ color: 0xa69a7b, roughness: 1 });
  const coastalPlain = new THREE.Mesh(new THREE.PlaneGeometry(10000, 10000), plainMaterial);
  coastalPlain.rotation.x = -Math.PI / 2; coastalPlain.position.y = -4.6;
  coastalPlain.name = 'Llanura costera hasta el horizonte'; group.add(coastalPlain);
  // Blend distant ground and sea into the same linear horizon as the sky.
  // This hides far-plane cutoffs in chase, overview and split-screen cameras
  // without fogging nearby models or adding an offscreen render pass.
  const horizon = { value: new THREE.Color().setRGB(.72, .68, .56) };
  for (const mesh of [coast, coastalPlain]) {
    const far = { value: 1000 };
    mesh.onBeforeRender = (_renderer, _scene, camera) => { far.value = (camera as THREE.PerspectiveCamera).far; };
    mesh.material.onBeforeCompile = shader => {
      shader.uniforms.campusHorizon = horizon; shader.uniforms.campusFar = far;
      shader.fragmentShader = 'uniform vec3 campusHorizon; uniform float campusFar;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>',
        'outgoingLight = mix(outgoingLight, campusHorizon, smoothstep(campusFar * .35, campusFar * .82, length(vViewPosition)));\n#include <opaque_fragment>');
    };
    mesh.material.customProgramCacheKey = () => 'campus-coastal-horizon-v1';
  }

  person('security', -110.5, -313.0, -.8); person('security', -99.8, -319, 1.1);
  person('security', -114, -308, .7, .10); person('security', 63, -216, -1.2);
  for (const [x, z] of [[-99, -67], [-97.2, -66.5], [-103, -68], [-52, -108], [-55, -107]]) person('scientist', x, z, .5, .10);
  person('scientist', -111, -68, .5);
  person('scientist', -76, -90, 0, .05, [-76, -72]);
  person('technician', -76, -181, 0, .05, [-76, -163]);
  person('security', -76, -43, 0, .05, [-76, -26]);
  for (const [x, z] of [[-95, -20], [-93, -19], [-97, -22], [-90, -21]]) person('visitor', x, z, 2.2, .10);
  for (const x of [-114, -101, -92]) person('technician', x, -197.3, Math.PI, .80);
  for (const [x, z] of [[-81.7, -192.2], [142, -88], [146, -67]]) person('technician', x, z, Math.PI);
  for (const [i, s] of course.pit.stalls.entries()) {
    const f = course.frameAt!(s, course.pit.stationOffset);
    person('technician', f.x - .8, f.z - 4.85, Math.PI, .02);
    person(i % 2 ? 'scientist' : 'technician', f.x + 2.6, f.z - 1.1, Math.PI, .02);
  }
  for (const [x, z] of [[-57, -91.3], [-93, -180.3], [113, -120.3], [50, -164.3], [25, -204.3]]) person('technician', x, z, Math.PI, .05);
  for (const [i, x] of [-72, -66, -58, -48, -38, -32, -8, -3, 7, 14, 21].entries()) {
    person(i % 3 === 0 ? 'photographer' : 'visitor', x, i % 3 === 0 ? 13.7 : 14.5 + (i % 2) * 1.6, Math.PI, .52);
  }
  person('visitor', -19, .3, 1.0, 5.06);
  person('visitor', -44, 22, Math.PI / 2, .52, [-31, 22]);
  person('scientist', -6, -224, .2); person('technician', -8, -224, -.5);
  for (const site of SPACEPORT_BUILDINGS.filter(site => site.x < -140)) {
    const front = site.z + site.depth / 2;
    person('scientist', site.x - 1.2, front + 2.2, 1, .10);
    person('technician', site.x + 1.4, front + 2.6, -1, .10);
  }
  person('scientist', -174, -132, 0, .05, [-174, -108]);
  person('visitor', -174, -37, 0, .05, [-174, -16]);
  person('photographer', -137.4, -128.4, Math.PI / 2, .14);
  person('visitor', -138.5, -132, Math.PI / 2, .14);
  person('security', -174, 13, .4, .05);

  d.finish(); vegetation.finish(); plants.finish(); siteLabels(group, labels);
  const glow = new THREE.MeshStandardMaterial({ color: 0xe2cf9e, emissive: 0xffbd75, emissiveIntensity: .22, roughness: .5 });
  const glassLights = new THREE.InstancedMesh(boxGeometry, glow, windows.length);
  glassLights.name = 'Ventanas ocupadas y luminarias interiores';
  const matrix = new THREE.Matrix4(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion();
  windows.forEach((w, i) => glassLights.setMatrixAt(i, matrix.compose(p(w.x, w.y, w.z), rotation.setFromAxisAngle(up, w.yaw ?? 0), scale.set(w.w, w.h, .035))));
  glassLights.computeBoundingSphere(); group.add(glassLights);
  const lamps = new THREE.InstancedMesh(sphere, glow, bulbs.length);
  bulbs.forEach((v, i) => lamps.setMatrixAt(i, matrix.compose(v, rotation, scale.set(.20, .045, .10))));
  lamps.computeBoundingSphere(); group.add(lamps);
  const serviceLane = roundedServicePath(SPACEPORT_SERVICE_LOOP, 8, true);
  const vehicleLane = serviceLane.map(([x, z], i) => {
    const n = serviceLane.length - 1, before = serviceLane[(i + n - 1) % n], after = serviceLane[(i + 1) % n];
    const dx = after[0] - before[0], dz = after[1] - before[1], length = Math.hypot(dx, dz);
    return [x + dz / length * 1.8, -.045, z - dx / length * 1.8] as [number, number, number];
  });
  const fleet = {
    placements: [
      { kind: 'truck' as const, position: [-103, -.045, -191.9] as [number, number, number], yaw: 0 },
      { kind: 'truck' as const, position: [-113.5, -.045, -191.9] as [number, number, number], yaw: 0 },
      { kind: 'pickup' as const, position: [-119, -.045, -61] as [number, number, number], yaw: 0 },
      { kind: 'pickup' as const, position: [-112.5, -.045, -61] as [number, number, number], yaw: 0 },
      { kind: 'pickup' as const, position: [145, -.045, -76] as [number, number, number], yaw: Math.PI },
      { kind: 'security' as const, position: [-94, -.045, -300] as [number, number, number], yaw: Math.PI },
    ],
    routes: [
      { kind: 'truck' as const, points: vehicleLane, speedMps: 3.0, pauseMs: 3200, phase: 0 },
      { kind: 'pickup' as const, points: vehicleLane, speedMps: 3.0, pauseMs: 3200, phase: .52 },
    ],
  };
  return {
    people, fleet,
    setNight(value: boolean) {
      sky.uniforms.night.value = value ? 1 : 0; glow.emissiveIntensity = value ? 2.2 : .22;
      coastMaterial.color.setHex(value ? 0x1c3748 : 0x608d91);
      plainMaterial.color.setHex(value ? 0x637078 : 0xa69a7b);
      if (value) horizon.value.setRGB(.055, .105, .15);
      else horizon.value.setRGB(.72, .68, .56);
    },
    setDetail(_detail: boolean) {},
    update(now: number) {
      wind.value = now * .001;
      // Visitors can observe the checkpoint raising its empty service barrier;
      // moving fleet stays on its own marked campus loop, away from the racetrack.
      const cycle = (now * .001) % 26;
      const opening = THREE.MathUtils.smoothstep(cycle, 4, 6) * (1 - THREE.MathUtils.smoothstep(cycle, 13, 15));
      barrier.rotation.z = opening * Math.PI * .44;
      coastMaterial.roughness = .34 + Math.sin(now * .00043) * .025;
    },
  };
}
