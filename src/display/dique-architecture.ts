import * as THREE from 'three';
import type { Course } from '../shared/courses';
import { DIQUE_BUILDING_PAD as slabHeight, diqueBuildingFootprint, diqueBuildingPoint, diqueBuildings,
  type DiqueBuilding } from './dique-architecture-layout';
import { DIQUE_GROUND, diquePart, diqueRoadClear, diqueSign } from './dique-geometry';
import { box, canvas2d, standard, texture } from './materials';

const zinc = standard(0x778481, 0.57, 0.48);
const iron = standard(0x474d48, 0.75, 0.29);
const yellow = standard(0xa88042, 0.74, 0.24);
const asphalt = standard(0x565953, 0.89);
const ironPipe = standard(0x586964, 0.63, 0.55);
const pipeGeometry = new THREE.CylinderGeometry(1, 1, 1, 12);
const horizontal = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

function workGlow() {
  const { canvas, context } = canvas2d(64, 64);
  const falloff = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  falloff.addColorStop(0, 'rgba(255,184,104,.7)');
  falloff.addColorStop(0.55, 'rgba(255,186,106,.26)');
  falloff.addColorStop(1, 'rgba(255,176,98,0)');
  context.fillStyle = falloff;
  context.fillRect(0, 0, 64, 64);
  return new THREE.MeshBasicMaterial({ map: texture(canvas), transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, opacity: 0.13 });
}

function apron(parent: THREE.Group, site: DiqueBuilding, paving: THREE.Material, glow: THREE.Material) {
  const { width, depth, apron } = site;
  const front = depth / 2 + apron;
  box(parent, paving, 0, slabHeight / 2, (apron - 0.40) / 2, width + 0.84,
    slabHeight, depth + apron + 0.40, false);
  const wideDrain = site !== diqueBuildings.timing && site !== diqueBuildings.station;
  const drain = wideDrain ? width - 0.37 : 0.85;
  const drainX = wideDrain ? 0 : -width / 2 + 0.89;
  box(parent, iron, drainX, slabHeight + 0.001, front - 0.30, drain, 0.007, 0.14, false);
  for (let x = -drain / 2 + 0.17; x <= drain / 2 - 0.10; x += 0.23) {
    box(parent, zinc, drainX + x, slabHeight + 0.007, front - 0.30, 0.042, 0.012, 0.124, false);
  }
  for (const side of [-1, 1]) {
    const x = side * (width / 2 - 0.24);
    const z = depth / 2 + 0.56;
    box(parent, iron, x, slabHeight + 0.04, z, 0.34, 0.080, 0.32, false);
    box(parent, yellow, x, slabHeight + 0.34, z, 0.15, 0.64, 0.14, false);
    box(parent, iron, x, slabHeight + 0.49, z, 0.157, 0.103, 0.149, false);
  }
  const lamp = diquePart(parent, horizontal, glow, false, 'Luz cálida en el acceso');
  lamp.position.set(0, slabHeight + 0.024, depth / 2 + 0.23);
  lamp.scale.set(Math.min(8, width - 0.41), 1, apron * 1.73);
  if (site === diqueBuildings.depot || site === diqueBuildings.workshop) {
    const depot = site === diqueBuildings.depot;
    const ramp = box(parent, paving, depot ? 3.73 : -1.55, slabHeight + 0.088, depth / 2 + 0.37,
      depot ? 4.10 : 4.38, 0.064, 1.08, false);
    ramp.rotation.x = 0.16;
  }
}

function plaque(parent: THREE.Group, site: DiqueBuilding) {
  const width = Math.min(2.60, site.width * 0.35);
  const x = -site.width / 2 + width * 0.51 + 0.43;
  const z = site.depth / 2 + site.apron * 0.55;
  const panel = new THREE.MeshStandardMaterial({
    map: diqueSign([site.title.toUpperCase(), site.caption.toUpperCase()], '#303d3e', '#ead7ad', '#8d7657'),
    roughness: 0.77,
  });
  for (const side of [-1, 1]) {
    box(parent, iron, x + side * width * 0.43, slabHeight + 0.42, z, 0.053, 0.82, 0.052, false);
  }
  box(parent, zinc, x, slabHeight + 0.86, z, width, width / 3.0 + 0.03, 0.10, false);
  diquePart(parent, new THREE.PlaneGeometry(width - 0.081, width / 3.0 - 0.047), panel)
    .position.set(x, slabHeight + 0.86, z + 0.054);
}

function pumpDischarge(parent: THREE.Group, course: Course, site: DiqueBuilding, concrete: THREE.Material) {
  const end = diqueBuildingPoint(site, 9.56, 0.82);
  if (!diqueRoadClear(course, end.x, end.z, 0.65)) return;
  const axis = new THREE.Vector3(0, 1, 0);
  const direction = new THREE.Vector3();
  function tube(a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material) {
    direction.subVectors(b, a);
    const pipe = diquePart(parent, pipeGeometry, material);
    pipe.position.copy(a).lerp(b, 0.5);
    pipe.scale.set(radius, direction.length() + 0.015, radius);
    pipe.quaternion.setFromUnitVectors(axis, direction.normalize());
  }
  for (const [z, radius] of [[0.49, 0.18], [1.02, 0.24]]) {
    const a = new THREE.Vector3(2.99, 0.60, z);
    const shoulder = new THREE.Vector3(6.78, 0.60, z);
    const slope = new THREE.Vector3(7.24, 0.51, z);
    const bank = new THREE.Vector3(9.15, -0.39, z);
    const outlet = new THREE.Vector3(9.55, -0.79, z);
    const run = new THREE.CurvePath<THREE.Vector3>();
    run.add(new THREE.LineCurve3(a, shoulder));
    run.add(new THREE.QuadraticBezierCurve3(shoulder, new THREE.Vector3(7.04, 0.60, z), slope));
    run.add(new THREE.LineCurve3(slope, bank));
    run.add(new THREE.QuadraticBezierCurve3(bank, new THREE.Vector3(9.44, -0.53, z), outlet));
    diquePart(parent, new THREE.TubeGeometry(run, 24, radius, 12, false), ironPipe);
    for (const x of [3.19, 5.24, 6.94]) {
      tube(new THREE.Vector3(x, 0.60, z), new THREE.Vector3(x + 0.10, 0.60, z), radius + 0.058, zinc);
    }
  }
  for (const x of [4.4, 6.60]) {
    box(parent, concrete, x, 0.124, 0.76, 0.36, 0.25, 1.25, false);
    box(parent, iron, x, 0.34, 0.76, 0.17, 0.28, 0.94, false);
  }
}

function fallback(parent: THREE.Group, site: DiqueBuilding, concrete: THREE.Material, window: THREE.Material) {
  const height = site === diqueBuildings.depot ? 4.0 : site === diqueBuildings.workshop ? 3.1 : 2.35;
  const { width, depth } = site;
  box(parent, concrete, 0, height / 2, 0, width - 0.22, height, depth - 0.24, true);
  box(parent, iron, 0, height + 0.08, 0, width, 0.22, depth, true);
  if (site === diqueBuildings.timing) {
    box(parent, window, -0.40, 1.68, depth / 2 - 0.10, width * 0.66, 0.73, 0.060, false);
  } else {
    const door = Math.min(3.74, width * 0.48);
    box(parent, asphalt, -width * 0.13, height * 0.39, depth / 2 - 0.10, door, height * 0.76, 0.064, false);
    box(parent, window, width * 0.29, height * 0.67, depth / 2 - 0.10, 1.12, 0.48, 0.064, false);
    box(parent, window, -width * 0.13, height * 0.86, depth / 2 - 0.065, 0.85, 0.09, 0.12, false);
  }
}

export function buildDiqueArchitecture(parent: THREE.Group, course: Course, concrete: THREE.MeshStandardMaterial,
  asset?: THREE.Object3D) {
  const paving = concrete.clone();
  paving.color.setHex(0x9a9386);
  const glow = workGlow();
  const timingGlow = glow.clone();
  timingGlow.opacity = 0.09;
  const fallbackLight = new THREE.MeshStandardMaterial({
    color: 0xc5a778, emissive: 0xcb834b, emissiveIntensity: 0.47, roughness: 0.49,
  });
  const luminous = new Map<THREE.MeshStandardMaterial, number>([[fallbackLight, fallbackLight.emissiveIntensity]]);
  const authored = new THREE.Group();
  authored.name = 'Edificios del puerto y del circuito';
  parent.add(authored);
  for (const site of Object.values(diqueBuildings)) {
    if (!diqueBuildingFootprint(site).every(p => diqueRoadClear(course, p.x, p.z, 0.38))) continue;
    const group = new THREE.Group();
    group.name = site.title;
    group.position.set(site.x, DIQUE_GROUND, site.z);
    group.rotation.y = site.yaw;
    authored.add(group);
    apron(group, site, paving, site === diqueBuildings.timing ? timingGlow : glow);
    if (site === diqueBuildings.pumps) pumpDischarge(group, course, site, paving);
    const shell = new THREE.Group();
    shell.position.y = slabHeight;
    group.add(shell);
    const art = asset?.getObjectByName(site.model);
    if (!art) {
      plaque(group, site);
      fallback(shell, site, concrete, fallbackLight);
      continue;
    }
    art.position.set(0, 0, 0);
    shell.add(art);
    art.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (material.transparent) object.castShadow = false;
        if (material instanceof THREE.MeshStandardMaterial && material.emissive.getHex() !== 0) {
          luminous.set(material, material.emissiveIntensity);
          object.castShadow = false;
        }
      }
    });
  }
  return {
    setNight(night: boolean) {
      for (const [material, intensity] of luminous) material.emissiveIntensity = intensity * (night ? 1.95 : 0.70);
      glow.opacity = night ? 0.52 : 0.13;
      timingGlow.opacity = night ? 0.24 : 0.09;
    },
  };
}
