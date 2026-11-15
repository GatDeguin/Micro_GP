import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { arcadeLayout, arcadeTrapRadius, type ArcadeEvent, type ArcadeKind, type ArcadeRamp } from '../shared/arcade';
import { CAR_DIMENSIONS } from '../shared/car-dimensions';
import type { Course } from '../shared/courses';
import type { CarView, RaceSnapshot } from '../shared/protocol';
import { box, canvas2d, random, standard, texture } from './materials';

const palette = {
  turbo: { color: 0xffb947, name: 'TURBO' },
  shield: { color: 0x51d6f1, name: 'ESCUDO' },
  oil: { color: 0xaa8be3, name: 'ACEITE' },
  pop: { color: 0xff6451, name: 'PETARDO' },
} satisfies Record<ArcadeKind, { color: number; name: string }>;
const kinds = Object.keys(palette) as ArcadeKind[];
const flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const forward = new THREE.Vector3(0, 0, 1);

function propPosition(course: Course, s: number, offset: number, lift = 0) {
  const p = course.sampleAt(s);
  return new THREE.Vector3(p.x - p.dz * offset, course.heightAt(s, offset) + lift, p.z + p.dx * offset);
}

function trackTransform(course: Course, s: number, offset: number, target: THREE.Object3D) {
  const p = course.sampleAt(s);
  const grade = (course.heightAt(s + 0.20, offset) - course.heightAt(s - 0.20, offset)) / 0.40;
  target.position.copy(propPosition(course, s, offset));
  target.rotation.set(-Math.atan(grade), Math.atan2(p.dx, p.dz), -Math.atan(course.bankAt(s)), 'YXZ');
}

function icon(context: CanvasRenderingContext2D, kind: ArcadeKind) {
  if (kind === 'turbo') {
    context.moveTo(-30, -17);
    context.lineTo(-14, -17);
    context.lineTo(0, 0);
    context.lineTo(-14, 17);
    context.lineTo(-30, 17);
    context.lineTo(-16, 0);
    context.closePath();
    context.moveTo(-2, -17);
    context.lineTo(14, -17);
    context.lineTo(28, 0);
    context.lineTo(14, 17);
    context.lineTo(-2, 17);
    context.lineTo(12, 0);
  } else if (kind === 'shield') {
    context.moveTo(0, -29);
    context.lineTo(25, -19);
    context.quadraticCurveTo(23, 12, 0, 29);
    context.quadraticCurveTo(-23, 12, -25, -19);
  } else if (kind === 'oil') {
    context.moveTo(2, -30);
    context.bezierCurveTo(0, -12, -22, 0, -21, 12);
    context.bezierCurveTo(-23, 36, 24, 32, 21, 9);
    context.quadraticCurveTo(19, -3, 2, -30);
  } else {
    for (let i = 0; i < 16; i++) {
      const angle = i * Math.PI / 8 + Math.PI / 8;
      const radius = i % 2 ? 11 : 28;
      const x = Math.sin(angle) * radius;
      const y = Math.cos(angle) * radius;
      if (i === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
  }
  context.closePath();
}

function itemPlate(kind: ArcadeKind) {
  const { canvas, context } = canvas2d(256, 192);
  const { color, name } = palette[kind];
  const ink = new THREE.Color(color).getStyle();
  context.fillStyle = '#242724';
  context.fillRect(0, 0, 256, 192);
  context.fillStyle = '#323734';
  context.fillRect(12, 12, 232, 168);
  context.strokeStyle = ink;
  context.lineWidth = 6;
  context.strokeRect(12, 12, 232, 168);
  context.fillStyle = ink;
  context.save();
  context.translate(128, 67);
  context.scale(1.50, 1.32);
  context.beginPath();
  icon(context, kind);
  context.fill();
  context.restore();
  context.font = '900 43px Arial, sans-serif';
  context.textAlign = 'center';
  context.fillText(name, 128, 150, 196);
  for (const x of [27, 229]) for (const y of [27, 165]) {
    context.fillStyle = '#1b1e1a';
    context.beginPath();
    context.arc(x, y, 7, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#9c9c8e';
    context.fillRect(x - 4, y - 1, 8, 2);
  }
  return texture(canvas);
}

function rampMap() {
  const { canvas, context } = canvas2d(192, 384);
  context.fillStyle = '#856b56';
  context.fillRect(0, 0, 192, 384);
  context.fillStyle = '#9a8371';
  context.fillRect(17, 8, 158, 370);
  const rng = random(8376);
  for (let i = 0; i < 440; i++) {
    context.fillStyle = i % 4 === 0 ? 'rgba(255,246,218,.16)' : 'rgba(44,39,33,.16)';
    context.fillRect(4 + rng() * 184, rng() * 382, 1 + rng() * 7, 0.6 + rng() * 2.3);
  }
  for (let row = 16; row < 384; row += 17) for (let column = 24; column <= 168; column += 24) {
    const x = column + (row % 2 ? 3 : 0);
    context.strokeStyle = 'rgba(240,224,196,.35)';
    context.beginPath();
    context.moveTo(x - 3, row + 4);
    context.lineTo(x + 5, row - 4);
    context.stroke();
    context.strokeStyle = 'rgba(46,41,37,.52)';
    context.beginPath();
    context.moveTo(x - 4, row + 5);
    context.lineTo(x + 4, row - 3);
    context.stroke();
  }
  context.fillStyle = '#df8132';
  context.fillRect(0, 0, 16, 384);
  context.fillRect(176, 0, 16, 384);
  context.fillRect(0, 0, 192, 28);
  for (let x = -17; x < 192; x += 32) {
    context.fillStyle = '#302a25';
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x + 15, 0);
    context.lineTo(x + 30, 28);
    context.lineTo(x + 15, 28);
    context.fill();
  }
  context.fillStyle = 'rgba(246,232,196,.92)';
  for (const y of [100, 149, 198]) {
    context.beginPath();
    context.moveTo(48, y + 17);
    context.lineTo(96, y - 13);
    context.lineTo(144, y + 17);
    context.lineTo(144, y + 34);
    context.lineTo(96, y + 5);
    context.lineTo(48, y + 34);
    context.fill();
  }
  context.font = '900 39px Arial, sans-serif';
  context.textAlign = 'center';
  context.fillText('SALTO', 96, 296, 147);
  return texture(canvas);
}

function rampMesh(course: Course, ramp: ArcadeRamp, under: boolean) {
  const positions: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  const runs = Math.max(8, Math.ceil(ramp.length / 0.24));
  for (let i = 0; i <= runs; i++) {
    const progress = i / runs;
    const s = ramp.s - ramp.length * (1 - progress);
    const lift = ramp.height * progress ** 1.3 + 0.008;
    const edges = [-1, 1].map(side => propPosition(course, s, ramp.offset + side * ramp.halfWidth, lift));
    if (under) {
      const feet = [-1, 1].map(side => propPosition(course, s, ramp.offset + side * ramp.halfWidth, -0.028));
      for (const p of [edges[0], feet[0], feet[1], edges[1]]) positions.push(p.x, p.y, p.z);
    } else {
      for (const p of edges) positions.push(p.x, p.y, p.z);
      uv.push(0, progress, 1, progress);
    }
    if (i >= runs) continue;
    if (under) {
      const a = i * 4;
      const b = a + 4;
      indices.push(a, b, a + 1, b, b + 1, a + 1, a + 2, b + 2, a + 3, b + 2, b + 3, a + 3);
    } else {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  if (under) {
    const end = runs * 4;
    indices.push(end, end + 1, end + 2, end, end + 2, end + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (!under) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildRamps(root: THREE.Group, course: Course, ramps: readonly ArcadeRamp[]) {
  const deck = new THREE.MeshStandardMaterial({ map: rampMap(), roughness: 0.60, metalness: 0.31,
    color: 0xffffff, emissive: 0xffac52, emissiveIntensity: 0.13 });
  deck.emissiveMap = deck.map;
  const support = standard(0x9d552a, 0.72, 0.32);
  support.side = THREE.DoubleSide;
  for (const ramp of ramps) {
    const top = new THREE.Mesh(rampMesh(course, ramp, false), deck);
    top.name = 'Rampa Arcade · flechas y placa de tracción';
    top.receiveShadow = true;
    const side = new THREE.Mesh(rampMesh(course, ramp, true), support);
    side.name = 'Rampa Arcade · costillas y bastidor de chapa';
    side.receiveShadow = true;
    root.add(side, top);
  }
}

function slickMap() {
  const size = 128;
  const { canvas, context } = canvas2d(size, size);
  const oil = context.createRadialGradient(58, 60, 6, 64, 64, 59);
  oil.addColorStop(0, '#22212b');
  oil.addColorStop(0.65, '#242631');
  oil.addColorStop(0.80, 'rgba(62,64,91,.93)');
  oil.addColorStop(0.91, 'rgba(82,73,123,.73)');
  oil.addColorStop(1, 'rgba(85,79,117,0)');
  context.fillStyle = oil;
  context.beginPath();
  for (let i = 0; i < 91; i++) {
    const angle = i / 90 * Math.PI * 2;
    const radius = 57 + 4.7 * Math.sin(angle * 3 + 0.4) + 3.1 * Math.cos(angle * 7);
    const x = 64 + Math.cos(angle) * radius;
    const y = 64 + Math.sin(angle) * radius * 0.85;
    if (i === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.fill();
  for (let i = 0; i < 3; i++) {
    context.strokeStyle = ['#766589a6', '#5c829caf', '#916b4da6'][i];
    context.lineWidth = 1.7;
    context.beginPath();
    context.ellipse(64, 62, 44 - i * 4.2, 27 - i * 3.6, 0.43, 3.72, 5.9);
    context.stroke();
  }
  return texture(canvas);
}

function radialMap(stops: readonly [number, string][]) {
  const { canvas, context } = canvas2d(64, 64);
  const fill = context.createRadialGradient(31, 31, 1, 32, 32, 31.5);
  for (const [radius, color] of stops) fill.addColorStop(radius, color);
  context.fillStyle = fill;
  context.fillRect(0, 0, 64, 64);
  return texture(canvas);
}

function padMap() {
  const { canvas, context } = canvas2d(96, 96);
  context.strokeStyle = 'rgba(235,224,186,.75)';
  context.lineWidth = 5;
  for (const [x, y] of [[9, 9], [87, 9], [9, 87], [87, 87]]) {
    const dx = x < 48 ? 18 : -18;
    const dy = y < 48 ? 18 : -18;
    context.beginPath();
    context.moveTo(x, y + dy);
    context.lineTo(x, y);
    context.lineTo(x + dx, y);
    context.stroke();
  }
  return texture(canvas);
}

function alignedGeometry(source: THREE.BufferGeometry, transform: THREE.Matrix4) {
  return source.clone().applyMatrix4(transform);
}

function pickupModels(root: THREE.Group, course: Course, layout: ReturnType<typeof arcadeLayout>) {
  const movement = new THREE.Object3D();
  const base = new RoundedBoxGeometry(0.93, 0.235, 0.74, 1, 0.040).translate(0, 0.145, 0);
  const band = new RoundedBoxGeometry(0.88, 0.103, 0.69, 1, 0.028).translate(0, 0.255, 0);
  const plates = new THREE.PlaneGeometry(0.69, 0.505).rotateX(-Math.PI / 2).rotateY(Math.PI).translate(0, 0.314, 0);
  const front = new THREE.PlaneGeometry(0.68, 0.19).rotateY(Math.PI).translate(0, 0.148, -0.372);
  const lid = mergeGeometries([plates, front]);
  plates.dispose();
  front.dispose();
  const pad = flat.clone().scale(1.52, 1, 1.24).translate(0, 0.019, 0);
  const matrices = layout.pickups.map(item => {
    trackTransform(course, item.s, item.offset, movement);
    movement.updateMatrix();
    return movement.matrix.clone();
  });
  const parts = matrices.map(m => alignedGeometry(pad, m));
  const paint = mergeGeometries(parts);
  const padMaterial = new THREE.MeshStandardMaterial({ map: padMap(), transparent: true, depthWrite: false,
    color: 0xf3e6c9, emissive: 0x8f7852, emissiveIntensity: 0.15, roughness: 0.89 });
  const padMesh = new THREE.Mesh(paint, padMaterial);
  padMesh.name = 'Marcas de apoyo de las cajas Arcade';
  root.add(padMesh);
  for (const part of parts) part.dispose();
  pad.dispose();

  const casing = new THREE.InstancedMesh(base, standard(0x3c403d, 0.63, 0.44), layout.pickups.length);
  casing.name = 'Cajas metálicas Arcade';
  casing.receiveShadow = true;
  root.add(casing);
  const groups = kinds.flatMap(kind => {
    const ids = layout.pickups.flatMap((item, i) => item.kind === kind ? [i] : []);
    if (!ids.length) return [];
    const color = palette[kind].color;
    const rest = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.20,
      metalness: 0.24, roughness: 0.43 });
    const map = itemPlate(kind);
    const note = new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xe0e4d5,
      emissiveIntensity: 0.56, roughness: 0.65 });
    const shell = new THREE.InstancedMesh(band, rest, ids.length);
    const labels = new THREE.InstancedMesh(lid, note, ids.length);
    shell.name = 'Carril de color · ' + palette[kind].name;
    labels.name = 'Identificación de caja · ' + palette[kind].name;
    root.add(shell, labels);
    return [{ ids, shell, labels }];
  });
  function write(mesh: THREE.InstancedMesh, ids: readonly number[], available: readonly boolean[]) {
    let count = 0;
    for (const i of ids) {
      if (available[i] === false) continue;
      mesh.setMatrixAt(count++, matrices[i]);
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }
  const indices = layout.pickups.map((_, i) => i);
  let previous = '';
  return (available: readonly boolean[]) => {
    const key = indices.map(i => available[i] === false ? '0' : '1').join('');
    if (key === previous) return;
    previous = key;
    write(casing, indices, available);
    for (const { ids, shell, labels } of groups) {
      write(shell, ids, available);
      write(labels, ids, available);
    }
  };
}

function createHazards(root: THREE.Group, course: Course) {
  const slick = new THREE.MeshPhysicalMaterial({
    map: slickMap(), transparent: true, depthWrite: false, roughness: 0.33, clearcoat: 0.86,
    clearcoatRoughness: 0.20, color: 0xc9baed, emissive: 0x222030, emissiveIntensity: 0.38,
  });
  const marker = new THREE.MeshStandardMaterial({
    color: 0xf36541, emissive: 0xff3c21, emissiveIntensity: 0.73, roughness: 0.42, metalness: 0.22,
  });
  const dark = standard(0x47302a, 0.72, 0.29);
  const glow = radialMap([[0, 'rgba(255,102,61,.74)'], [0.4, 'rgba(250,66,44,.29)'], [1, 'rgba(198,35,24,0)']]);
  const light = new THREE.MeshBasicMaterial({ map: glow, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending });
  const discGeometry = new THREE.CylinderGeometry(0.28, 0.33, 0.102, 12);
  const stainWidth = arcadeTrapRadius.oil * 2;
  const hazardWidth = arcadeTrapRadius.pop * 2;
  const pool = Array.from({ length: 12 }, () => {
    const group = new THREE.Group();
    const stain = new THREE.Mesh(flat, slick);
    stain.name = 'Charco de aceite iridiscente';
    stain.scale.set(stainWidth * 1.06, 1, stainWidth * 1.18);
    stain.position.y = 0.015;
    const toy = new THREE.Group();
    toy.name = 'Baliza de petardo de utilería';
    const disc = new THREE.Mesh(discGeometry, dark);
    disc.position.y = 0.068;
    toy.add(disc);
    box(toy, marker, 0, 0.13, 0, 0.22, 0.085, 0.21, false);
    const halo = new THREE.Mesh(flat, light);
    halo.position.y = 0.018;
    halo.scale.setScalar(hazardWidth);
    toy.add(halo);
    group.add(stain, toy);
    group.visible = false;
    root.add(group);
    return { group, stain, toy, id: -1 };
  });
  return (state: NonNullable<RaceSnapshot['arcade']>, tick: number) => {
    marker.emissiveIntensity = 0.69 + 0.86 * (0.5 + 0.5 * Math.sin(tick * 0.12)) ** 3;
    light.opacity = 0.29 + 0.18 * Math.sin(tick * 0.12 + 0.35);
    for (const [i, prop] of pool.entries()) {
      const hazard = state.hazards[i];
      prop.group.visible = Boolean(hazard);
      if (!hazard) continue;
      const at = prop.group.position;
      if (hazard.id === prop.id && hazard.x === at.x && hazard.y === at.y && hazard.z === at.z
        && prop.toy.visible === (hazard.kind === 'pop')) continue;
      prop.id = hazard.id;
      const road = course.locate(hazard.x, hazard.z, { y: hazard.y });
      trackTransform(course, road.s, road.offset, prop.group);
      prop.group.position.set(hazard.x, hazard.y, hazard.z);
      prop.stain.visible = hazard.kind === 'oil';
      prop.toy.visible = hazard.kind === 'pop';
    }
  };
}

function carAccents(root: THREE.Group) {
  const shield = new THREE.MeshBasicMaterial({ color: 0x55cfe9, transparent: true,
    opacity: 0.63, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const exhaust = new THREE.MeshBasicMaterial({ color: 0xffb95b, transparent: true, opacity: 0.68,
    depthWrite: false, blending: THREE.AdditiveBlending });
  const core = new THREE.MeshBasicMaterial({ color: 0x8bddff, transparent: true, opacity: 0.81,
    depthWrite: false, blending: THREE.AdditiveBlending });
  const jet = new THREE.ConeGeometry(0.085, 1.0, 7, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -0.5);
  const arcs = mergeGeometries([0, Math.PI].map(angle =>
    new THREE.RingGeometry(0.95, 1, 24, 1, angle + 0.20, Math.PI - 0.61).rotateX(-Math.PI / 2)));
  const cars = CAR_DIMENSIONS.map(dimensions => {
    const group = new THREE.Group();
    const screen = new THREE.Group();
    screen.name = 'Escudo del autito';
    const ring = new THREE.Mesh(arcs, shield);
    ring.scale.set(dimensions.halfWidth + 0.17, 1, Math.max(dimensions.front, dimensions.rear) + 0.14);
    ring.position.y = 0.24;
    screen.add(ring);
    const rim = ring.clone();
    rim.scale.multiplyScalar(0.96);
    rim.position.y = 0.42;
    screen.add(rim);

    const jets = new THREE.Group();
    jets.name = 'Chispas de escape del turbo';
    jets.position.set(dimensions.halfWidth * 0.50, 0.17, -dimensions.rear + 0.02);
    const flame = new THREE.Mesh(jet, exhaust);
    const inner = new THREE.Mesh(jet, core);
    inner.scale.set(0.64, 0.64, 0.48);
    jets.add(flame, inner);
    group.visible = false;
    group.add(screen, jets);
    root.add(group);
    return { group, screen, jets };
  });
  return (views: readonly CarView[], tick: number) => {
    shield.opacity = 0.48 + 0.13 * Math.cos(tick * 0.21);
    for (const [slot, accent] of cars.entries()) {
      const car = views[slot];
      const effect = car?.arcade;
      accent.group.visible = !!effect && car.active !== false && (effect.shield || effect.turbo);
      if (!accent.group.visible || !effect) continue;
      accent.group.position.set(car.x, car.y, car.z);
      accent.group.rotation.y = car.yaw;
      accent.screen.visible = effect.shield;
      accent.jets.visible = effect.turbo;
      accent.jets.scale.z = 0.30 + 0.19 * Math.sin(tick * 1.42 + slot);
    }
  };
}

function bursts(root: THREE.Group) {
  const dust = radialMap([[0, '#c1b19aaf'], [0.46, '#a89b8470'], [0.74, '#9b907446'], [1, '#756c6000']]);
  const fire = radialMap([[0, '#fff9cfff'], [0.26, '#ffe293ed'], [0.58, '#ff921bb9'], [1, '#f4521a00']]);
  const sparks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.023, 0.023, 1),
    new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: false, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false }), 96);
  sparks.name = 'Chispas breves de Arcade';
  sparks.count = 0;
  sparks.frustumCulled = false;
  sparks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  root.add(sparks);
  const ring = new THREE.RingGeometry(0.92, 1, 26).rotateX(-Math.PI / 2);
  const flashes = Array.from({ length: 6 }, () => {
    const fog = new THREE.Sprite(new THREE.SpriteMaterial({ map: dust, transparent: true, depthWrite: false }));
    const hot = new THREE.Sprite(new THREE.SpriteMaterial({ map: fire, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false }));
    const shock = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: 0xfc9967, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    fog.name = 'Humo de escena del modo Arcade';
    hot.name = 'Fogonazo de petardo de utilería';
    shock.name = 'Anillo de destello de utilería';
    fog.visible = hot.visible = shock.visible = false;
    root.add(fog, hot, shock);
    return { fog, hot, shock };
  });
  const effects = new Map<number, ArcadeEvent>();
  let previousTick = -1;
  let previousHeat = -1;
  let previousReplay = false;
  const marker = new THREE.Object3D();
  const velocity = new THREE.Vector3();
  const tint = new THREE.Color();
  return (state: RaceSnapshot, tick: number, replaying: boolean) => {
    if (state.heat !== previousHeat || tick < previousTick || replaying !== previousReplay) effects.clear();
    previousHeat = state.heat;
    previousTick = tick;
    previousReplay = replaying;
    for (const event of state.arcade?.events ?? []) {
      if (event.frame <= tick && event.frame > tick - 55) effects.set(event.id, event);
    }
    for (const [id, event] of effects) if (event.frame <= tick - 55) effects.delete(id);
    let count = 0;
    let used = 0;
    for (const event of effects.values()) {
      if (used >= flashes.length) break;
      const age = (tick - event.frame) / 60;
      const boom = event.kind === 'explosion';
      const dusty = boom || event.kind === 'land' || event.kind === 'jump' || event.kind === 'slip';
      const flash = dusty ? flashes[used++] : undefined;
      const force = THREE.MathUtils.clamp(event.strength, 0.14, 1.3);
      if (flash) {
        flash.fog.visible = age < (boom ? 0.90 : 0.43);
        flash.fog.position.set(event.x + age * 0.31, event.y + 0.20 + age * (boom ? 1.54 : 0.31), event.z);
        flash.fog.scale.setScalar((boom ? 0.52 : 0.32) + age * (boom ? 3.1 : 2.35));
        flash.fog.material.opacity = Math.max(0, (boom ? 0.64 - age * 0.68 : 0.43 - age * 1.04) * force);
        flash.hot.visible = boom && age < 0.23;
        flash.hot.position.set(event.x, event.y + 0.38 + age * 1.25, event.z);
        flash.hot.scale.setScalar((0.49 + age * 3.8) * force);
        flash.hot.material.opacity = Math.max(0, 1 - age * 4.40);
        flash.shock.visible = boom && age < 0.30;
        flash.shock.position.set(event.x, event.y + 0.061, event.z);
        flash.shock.scale.setScalar(0.43 + age * 4.6);
        flash.shock.material.opacity = Math.max(0, (0.74 - age * 2.44) * force);
      }
      if (age > 0.35 || event.kind === 'slip') continue;
      const total = boom ? 18 : event.kind === 'land' ? 7 : 8;
      for (let i = 0; i < total && count < 96; i++) {
        const angle = i * 2.39996 + event.id * 0.71;
        const reach = (boom ? 2.7 : 1.34) * (0.62 + (i % 7) * 0.12) * force;
        const rise = (boom ? 3.2 : 1.64) * (0.38 + (i % 5) * 0.16);
        const color = boom ? (i % 4 === 0 ? 0xffe3a0 : 0xff9149)
          : event.kind === 'block' ? palette.shield.color : event.kind === 'land' ? 0xc2a17d : 0xffc998;
        marker.position.set(event.x + Math.cos(angle) * reach * age,
          event.y + 0.10 + Math.max(0, age * (rise - 4.7 * age)), event.z + Math.sin(angle) * reach * age);
        velocity.set(Math.cos(angle) * reach, rise - age * 9.4, Math.sin(angle) * reach).normalize();
        marker.quaternion.setFromUnitVectors(forward, velocity);
        marker.scale.set(1, 1, Math.max(0.013, (1 - age / 0.36) * (boom ? 0.30 : 0.11)));
        marker.updateMatrix();
        sparks.setMatrixAt(count, marker.matrix);
        sparks.setColorAt(count++, tint.setHex(color).multiplyScalar(1 - age * 2.61));
      }
    }
    for (let i = used; i < flashes.length; i++) {
      const { fog, hot, shock } = flashes[i];
      fog.visible = hot.visible = shock.visible = false;
    }
    sparks.count = count;
    if (count > 0) {
      sparks.instanceMatrix.needsUpdate = true;
      sparks.instanceColor!.needsUpdate = true;
    }
  };
}

export function buildArcadeScene(parent: THREE.Group, course: Course) {
  const root = new THREE.Group();
  root.name = 'Arcade · cajas, rampas y efectos de utilería';
  root.visible = false;
  parent.add(root);
  const layout = arcadeLayout(course);
  buildRamps(root, course, layout.ramps);
  const pickups = pickupModels(root, course, layout);
  const hazards = createHazards(root, course);
  const accents = carAccents(root);
  const effects = bursts(root);
  return {
    update(snapshot: RaceSnapshot, cars: readonly CarView[], tick: number, _dt: number, replaying: boolean) {
      const arcade = snapshot.arcade;
      root.visible = arcade !== undefined;
      if (!arcade) return;
      pickups(arcade.available);
      hazards(arcade, tick);
      accents(cars, tick);
      effects(snapshot, tick, replaying);
    },
  };
}
