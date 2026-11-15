import * as THREE from 'three';
import { diquePlanPoint, type Course } from '../shared/courses';
import { DIQUE_GROUND, diqueBeam, diquePart, diqueRoadClear, diqueSign, diqueStrip } from './dique-geometry';
import { box, canvas2d, standard, texture } from './materials';

const iron = standard(0x474e4d, 0.64, 0.47);
const zinc = standard(0x99a29c, 0.44, 0.58);
const ochre = standard(0xd09238, 0.61, 0.24);
const pipePaint = standard(0x37666c, 0.48, 0.34);
const valvePaint = standard(0xa94c36, 0.55, 0.30);
const rubber = standard(0x202624, 0.94);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 24);
const up = new THREE.Vector3(0, 1, 0);

function tube(parent: THREE.Object3D, material: THREE.Material, from: THREE.Vector3, to: THREE.Vector3, radius: number) {
  const axis = to.clone().sub(from);
  const mesh = diquePart(parent, cylinder, material);
  mesh.position.copy(from).lerp(to, 0.5);
  mesh.scale.set(radius, axis.length(), radius);
  mesh.quaternion.setFromUnitVectors(up, axis.normalize());
  return mesh;
}

function tankWater(time: { value: number }) {
  const water = new THREE.MeshPhysicalMaterial({
    color: 0x4b7265, metalness: 0.10, roughness: 0.29, clearcoat: 0.59, clearcoatRoughness: 0.23,
  });
  water.onBeforeCompile = shader => {
    shader.uniforms.treatmentTime = time;
    shader.vertexShader = 'varying vec2 tankPosition;\n' + shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n tankPosition = (uv - 0.5) * 6.5;');
    shader.fragmentShader = 'varying vec2 tankPosition; uniform float treatmentTime;\n' + shader.fragmentShader
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        float r = length(tankPosition);
        vec2 tangent = tankPosition / max(r, 0.06);
        vec2 swell = tangent * 0.047 * cos(r * 13.5 - treatmentTime * 2.32)
          + vec2(0.038, 0.021) * cos(dot(tankPosition, vec2(4.2, 9.1)) + treatmentTime * 1.31);
        normal = normalize(normal + mat3(viewMatrix) * vec3(swell.x, 0.0, swell.y));
      `).replace('#include <clearcoat_normal_fragment_maps>', 'clearcoatNormal = normal;')
      .replace('#include <opaque_fragment>', `
        float chop = cos(length(tankPosition) * 18.5 - treatmentTime * 2.65 + tankPosition.x * 0.64);
        float angle = 1.0 - max(0.0, dot(normal, normalize(vViewPosition)));
        outgoingLight += vec3(0.037, 0.059, 0.057) * (0.15 + 0.85 * angle)
          * (0.30 + 0.70 * smoothstep(0.60, 1.0, chop));
        #include <opaque_fragment>
      `);
  };
  water.customProgramCacheKey = () => 'dique-treatment-water';
  return water;
}

function closedConnector(parent: THREE.Group, course: Course, lamp: THREE.Material) {
  const abandoned = course.treatmentDetour!.closedSamples.filter(p => p.s >= 646.8 && p.s <= 658.8);
  const closed = new THREE.Group();
  closed.name = 'Cierre de la antigua curva del malecón';
  parent.add(closed);
  const pavement = standard(0x68615a, 0.94);
  const sleeper = standard(0x8e8071, 0.94);
  const red = standard(0xa23b2c, 0.70);
  const cream = standard(0xd3c0a1, 0.73);
  const ring = (p: typeof abandoned[number], side: number) => {
    const distance = Math.min(p.s - abandoned[0].s, abandoned[abandoned.length - 1].s - p.s);
    const width = THREE.MathUtils.smoothstep(distance, 0, 1.92) * 2.77;
    return new THREE.Vector3(p.x - p.dz * side * width, p.y - 0.103, p.z + p.dx * side * width);
  };
  diquePart(closed, diqueStrip(abandoned, p => ring(p, -1), p => ring(p, 1)), pavement);
  const at = abandoned.find(p => p.s > 651.4)!;
  const barrier = new THREE.Group();
  barrier.position.set(at.x, at.y - 0.12, at.z);
  barrier.rotation.y = Math.atan2(at.dx, at.dz);
  closed.add(barrier);
  for (let i = 0; i < 7; i++) {
    const x = (i - 3) * 0.73;
    box(barrier, sleeper, x, 0.15, 0.04, 0.69, 0.30, 0.55);
    box(barrier, i % 2 === 0 ? red : cream, x, 0.38, 0.04, 0.71, 0.28, 0.24);
  }
  for (const x of [-1.98, 1.98]) {
    box(barrier, iron, x, 0.59, 0.04, 0.18, 0.18, 0.19);
    box(barrier, lamp, x, 0.73, 0.04, 0.14, 0.13, 0.15, false);
  }
  const sign = diqueSign(['CALLE CERRADA', 'ACCESO POR DEPURADORA'], '#463229', '#ffe3a5', '#ce9060');
  const panel = diquePart(barrier, new THREE.PlaneGeometry(2.34, 0.78),
    new THREE.MeshStandardMaterial({ map: sign, emissiveMap: sign, emissive: 0xffbe7c, emissiveIntensity: 0.35 }));
  panel.position.set(0, 0.95, -0.10);
  panel.rotation.y = Math.PI;
}

function badge(parent: THREE.Group, text: readonly string[], x: number, y: number, z: number, width: number,
  yaw = 0) {
  const height = width / 3;
  const map = diqueSign(text, '#243633', '#eee3bf', '#99a58a');
  const mount = new THREE.Group();
  mount.position.set(x, y, z);
  mount.rotation.y = yaw;
  parent.add(mount);
  box(mount, iron, 0, 0, 0, width + 0.09, height + 0.081, 0.087, false);
  diquePart(mount, new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({ map, roughness: 0.80, emissiveMap: map, emissive: 0xffd096,
      emissiveIntensity: 0.25 })).position.z = 0.048;
}

function clarifier(parent: THREE.Group, x: number, z: number, radius: number,
  concrete: THREE.Material, water: THREE.Material, lamp: THREE.Material) {
  const tank = new THREE.Group();
  tank.name = 'Decantador circular con puente barredor';
  tank.position.set(x, 0, z);
  parent.add(tank);
  tube(tank, concrete, new THREE.Vector3(0, 0.07, 0), new THREE.Vector3(0, 0.81, 0), radius);
  const coping = diquePart(tank, new THREE.RingGeometry(radius - 0.28, radius + 0.07, 36).rotateX(-Math.PI / 2), zinc);
  coping.position.y = 0.99;
  const inner = new THREE.CylinderGeometry(radius - 0.26, radius - 0.26, 0.31, 36, 1, true);
  const rim = diquePart(tank, inner, new THREE.MeshStandardMaterial({ color: 0x4f6151, side: THREE.BackSide, roughness: 0.73 }));
  rim.position.y = 0.84;
  diquePart(tank, new THREE.CircleGeometry(radius - 0.28, 36).rotateX(-Math.PI / 2), water).position.y = 0.828;
  const hub = new THREE.Vector3(0, 1.48, 0);
  tube(tank, zinc, new THREE.Vector3(0, 0.82, 0), hub, 0.34);
  for (const yaw of [-0.68, 0.52, 2.8]) {
    const x = Math.sin(yaw) * radius;
    const z = Math.cos(yaw) * radius;
    box(tank, iron, x, 0.57, z, 0.33, 0.92, 0.29).rotation.y = yaw;
    box(tank, lamp, x, 1.08, z, 0.24, 0.12, 0.17, false).rotation.y = yaw;
  }

  const rake = new THREE.Group();
  rake.name = 'Puente barredor giratorio';
  tank.add(rake);
  box(rake, iron, radius * 0.49, 1.24, 0, radius * 0.95, 0.167, 0.69);
  for (const side of [-1, 1]) {
    for (let x = 0.45; x < radius; x += 0.53) box(rake, ochre, x, 1.49, side * 0.30, 0.043, 0.51, 0.046, false);
    box(rake, ochre, radius * 0.50, 1.76, side * 0.30, radius * 0.95, 0.055, 0.054, false);
  }
  box(rake, valvePaint, radius - 0.24, 1.39, 0.02, 0.45, 0.23, 0.40);
  box(rake, rubber, radius - 0.22, 0.99, 0, 0.31, 0.31, 0.32);
  return rake;
}

function filterBed(parent: THREE.Group, x: number, z: number, concrete: THREE.Material, water: THREE.Material) {
  const filter = new THREE.Group();
  filter.name = 'Dos filtros abiertos y pasarela de inspección';
  filter.position.set(x, 0, z);
  parent.add(filter);
  box(filter, concrete, 0, 0.16, 0, 6.11, 0.32, 5.61);
  for (const z of [-2.67, 0, 2.67]) box(filter, concrete, 0, 0.48, z, 6.03, 0.87, 0.23);
  for (const x of [-2.91, 2.91]) box(filter, concrete, x, 0.48, 0, 0.24, 0.87, 5.42);
  for (const z of [-1.34, 1.34]) {
    const surface = diquePart(filter, new THREE.PlaneGeometry(5.56, 2.40).rotateX(-Math.PI / 2), water);
    surface.position.set(0, 0.67, z);
    for (const x of [-1.73, 0, 1.73]) box(filter, iron, x, 0.77, z, 0.068, 0.043, 2.38, false);
    box(filter, zinc, -2.20, 0.87, z, 0.37, 0.051, 2.86, false);
  }
  for (const z of [-2.47, -1.24, 0, 1.24, 2.47]) box(filter, ochre, -2.89, 1.14, z, 0.052, 0.62, 0.054, false);
  box(filter, ochre, -2.89, 1.44, 0, 0.055, 0.052, 5.19, false);
}

function plantGlow() {
  const { canvas, context } = canvas2d(64, 64);
  const falloff = context.createRadialGradient(32, 29, 0, 32, 32, 32);
  falloff.addColorStop(0, 'rgba(255,204,136,.85)');
  falloff.addColorStop(0.44, 'rgba(240,161,81,.39)');
  falloff.addColorStop(1, 'rgba(211,127,54,0)');
  context.fillStyle = falloff;
  context.fillRect(0, 0, 64, 64);
  return new THREE.MeshBasicMaterial({ map: texture(canvas), transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, opacity: 0.35 });
}

function outfallWalk(parent: THREE.Group, course: Course, concrete: THREE.Material, lamp: THREE.Material, glow: THREE.Material) {
  const at = diquePlanPoint(75.1, 129.8);
  if (!diqueRoadClear(course, at.x, at.z, 1.05)) return;
  const walk = new THREE.Group();
  walk.name = 'Mirador de aforo del desagüe';
  walk.position.set(at.x, 0, at.z);
  walk.rotation.y = 0.17;
  parent.add(walk);
  box(walk, concrete, 0, 0.10, 0, 1.65, 0.21, 4.25);
  for (const z of [-1.96, 0, 1.96]) {
    box(walk, ochre, 0.71, 0.75, z, 0.083, 1.09, 0.084);
    box(walk, iron, 0.71, 0.24, z, 0.24, 0.073, 0.23, false);
  }
  for (const y of [0.70, 1.22]) box(walk, ochre, 0.71, y, 0, 0.073, 0.072, 4.0, false);
  box(walk, iron, 0.56, 1.48, 0.05, 0.26, 0.22, 0.45);
  box(walk, lamp, 0.44, 1.45, 0.05, 0.041, 0.135, 0.34, false);
  badge(walk, ['DESAGÜE', 'CONTROL DE CAUDAL'], 0.51, 1.03, -0.65, 1.87, -Math.PI / 2);
  const pool = diquePart(walk, new THREE.PlaneGeometry(1.6, 3.92).rotateX(-Math.PI / 2), glow);
  pool.position.set(0.07, 0.214, 0.09);
}

export function buildDiqueTreatment(parent: THREE.Group, course: Course, concrete: THREE.MeshStandardMaterial) {
  if (!course.treatmentDetour) return undefined;
  const root = new THREE.Group();
  root.name = 'Planta depuradora del riacho';
  const settled = new THREE.Group();
  settled.position.y = DIQUE_GROUND;
  root.add(settled);
  parent.add(root);
  const time = { value: 0 };
  const water = tankWater(time);
  const lamps = new THREE.MeshStandardMaterial({
    color: 0xffd796, emissive: 0xff9d44, emissiveIntensity: 1.6, roughness: 0.48,
  });
  const glow = plantGlow();
  outfallWalk(settled, course, concrete, lamps, glow);
  const tank = diquePlanPoint(55, 116.5);
  const bed = diquePlanPoint(46.2, 123.2);
  const station = diquePlanPoint(56.7, 110.1);
  box(settled, concrete, tank.x, 0.07, tank.z, 8.25, 0.14, 7.55, false);
  box(settled, concrete, bed.x, 0.065, bed.z, 6.76, 0.13, 6.19, false);
  const rake = clarifier(settled, tank.x, tank.z, 3.68, concrete, water, lamps);
  filterBed(settled, bed.x, bed.z, concrete, water);

  const pump = new THREE.Group();
  pump.position.set(station.x, 0, station.z);
  settled.add(pump);
  box(pump, concrete, 0, 0.13, 0, 3.68, 0.26, 1.98);
  for (const x of [-1.05, 0, 1.05]) {
    tube(pump, pipePaint, new THREE.Vector3(x, 0.24, -0.24), new THREE.Vector3(x, 0.80, -0.24), 0.23);
    tube(pump, zinc, new THREE.Vector3(x, 0.79, -0.24), new THREE.Vector3(x, 0.85, -0.24), 0.29);
    tube(pump, pipePaint, new THREE.Vector3(x, 0.89, -0.24), new THREE.Vector3(x, 0.89, 0.94), 0.14);
    const stem = new THREE.Vector3(x, 1.18, 0.48);
    tube(pump, iron, new THREE.Vector3(x, 0.97, 0.48), stem, 0.052);
    diquePart(pump, new THREE.TorusGeometry(0.17, 0.027, 6, 12).rotateX(-Math.PI / 2), valvePaint).position.copy(stem);
  }
  tube(pump, pipePaint, new THREE.Vector3(-1.62, 0.89, 0.96), new THREE.Vector3(1.65, 0.89, 0.96), 0.185);
  const attach = new THREE.Vector3(station.x + 1.54, 0.89, station.z + 0.96);
  tube(settled, pipePaint, attach, new THREE.Vector3(tank.x + 2.34, 0.57, tank.z - 2.18), 0.17);
  badge(settled, ['PLANTA DEPURADORA', 'TRATAMIENTO DEL RIACHO'], tank.x + 3.0, 1.54, tank.z - 2.32, 3.25, Math.PI / 2);
  badge(settled, ['DECANTADOR 01'], tank.x - 2.23, 0.57, tank.z + 3.02, 1.67, -0.32);
  badge(settled, ['FILTRACIÓN 02'], bed.x, 0.70, bed.z + 2.83, 1.70);

  for (const [x, z] of [[60.2, 110.5], [42.1, 119.7], [60.6, 132.0]]) {
    const at = diquePlanPoint(x, z);
    if (!diqueRoadClear(course, at.x, at.z, 0.45)) continue;
    box(settled, iron, at.x, 1.57, at.z, 0.10, 3.13, 0.10);
    box(settled, iron, at.x, 3.13, at.z + 0.16, 0.55, 0.19, 0.43);
    box(settled, lamps, at.x, 3.01, at.z + 0.16, 0.42, 0.062, 0.33, false);
    diquePart(settled, new THREE.PlaneGeometry(4.9, 3.15).rotateX(-Math.PI / 2), glow)
      .position.set(at.x, 0.022, at.z + 0.35);
  }

  const fence = standard(0x6b756b, 0.62, 0.44);
  for (const [from, to, z] of [[38.2, 53.2, 128.7], [39.1, 50.4, 114.3]] as const) {
    let prior: THREE.Vector3 | undefined;
    for (let x = from; x <= to; x += 2.10) {
      const at = diquePlanPoint(x, z);
      if (!diqueRoadClear(course, at.x, at.z, 0.65)) { prior = undefined; continue; }
      box(settled, fence, at.x, 0.61, at.z, 0.088, 1.22, 0.086, false);
      const post = new THREE.Vector3(at.x, 0.78, at.z);
      if (prior) for (const level of [0, 0.38]) {
        const lift = new THREE.Vector3(0, level, 0);
        diqueBeam(settled, fence, prior.clone().add(lift), post.clone().add(lift), 0.046, 0.048, false);
      }
      prior = post;
    }
  }
  closedConnector(root, course, lamps);
  return {
    animated: rake,
    setNight(night: boolean) {
      lamps.emissiveIntensity = night ? 3.3 : 1.35;
      glow.opacity = night ? 0.89 : 0.23;
    },
    update(now: number) {
      time.value = now * 0.001;
      rake.rotation.y = 0.92 + time.value * 0.12;
    },
  };
}
