import * as THREE from 'three';
import { TRACK, WALL_HALF } from '../shared/track';
import { instanceStatic } from './batches';
import { pondMaterials, streamRocks, waterline as WATER_Y } from './infield-water';
import { canvas2d, noiseField, random, standard, texture } from './materials';

const GRASS_Y = -0.141;
const BED_Y = -0.218;
const FRAME = { left: -29, right: 29, top: -16, bottom: 8 };

const waterBanks: [number, number][] = [
  [1.3, -13.32], [0.95, -12.95], [1.03, -11.87], [1.46, -10.91], [2.04, -9.96],
  [2.47, -8.67], [2.88, -7.57], [3.17, -6.48], [3.10, -5.54], [2.75, -4.64], [2.54, -3.67],
  [2.27, -2.88], [1.22, -2.55], [0.50, -1.65], [0.52, -0.72], [1.19, 0.23],
  [2.51, 1.04], [4.49, 1.35], [6.26, 1.16], [7.88, 0.73], [9.13, 0.08],
  [9.37, -0.74], [8.93, -1.62], [7.89, -2.43], [6.31, -2.79], [5.02, -3.10],
  [4.54, -3.99], [4.66, -4.95], [4.76, -5.84], [4.73, -6.70], [4.36, -7.76],
  [3.94, -8.83], [3.38, -9.94], [2.92, -10.87], [2.78, -11.75], [2.41, -12.61], [2.07, -13.22],
];

function u(x: number) { return (x - FRAME.left) / (FRAME.right - FRAME.left); }
function v(z: number) { return (z - FRAME.top) / (FRAME.bottom - FRAME.top); }

function shapeFrom(points: readonly THREE.Vector3[]) {
  const shape = new THREE.Shape(points.map(p => new THREE.Vector2(p.x, -p.z)));
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u(positions.getX(i)), v(positions.getZ(i)));
  return geometry;
}

function drawMask(context: CanvasRenderingContext2D, points: readonly THREE.Vector3[]) {
  const { width, height } = context.canvas;
  context.beginPath();
  points.forEach((p, index) => {
    const x = u(p.x) * width;
    const y = (1 - v(p.z)) * height;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.closePath();
}

function ground(parent: THREE.Object3D, water: readonly THREE.Vector3[]) {
  const grass = canvas2d(1536, 640);
  const { width, height } = grass.canvas;
  const rng = random(2437);
  const meadows = noiseField(23, 13, rng);
  const fibers = noiseField(190, 118, rng);
  const pixels = grass.context.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    const t = y / height;
    for (let x = 0; x < width; x++) {
      const s = x / width;
      const clump = meadows(s, t);
      const blade = fibers(s, t) * 0.7 + rng() * 0.3;
      const age = Math.max(0, (clump - 0.55) * 1.8);
      const shade = 15 * clump + 31 * blade;
      const i = (y * width + x) * 4;
      pixels.data[i] = 27 + shade + age * 18;
      pixels.data[i + 1] = 67 + shade + age * 11;
      pixels.data[i + 2] = 29 + shade * 0.57 + age * 9;
      pixels.data[i + 3] = 255;
    }
  }
  grass.context.putImageData(pixels, 0, 0);
  const outline = TRACK.samples.map(p => {
    const offset = -WALL_HALF - 0.88 - 0.10 * Math.sin(p.s / TRACK.length * Math.PI * 12);
    return new THREE.Vector3(p.x - p.dz * offset, 0, p.z + p.dx * offset);
  });
  grass.context.save();
  drawMask(grass.context, outline);
  grass.context.clip();
  for (const [lineWidth, opacity] of [[32, 0.08], [18, 0.10], [8, 0.13], [3, 0.19]]) {
    grass.context.lineWidth = lineWidth;
    grass.context.strokeStyle = `rgba(174,152,94,${opacity})`;
    grass.context.stroke();
  }
  grass.context.restore();

  // Bridge contact stays visible on the turf even in the lightweight renderer.
  for (const [offset, lineWidth, opacity] of [[-3.62, 63, 0.12], [-3.68, 39, 0.13], [-3.75, 22, 0.17]]) {
    grass.context.lineWidth = lineWidth;
    grass.context.lineCap = 'round';
    grass.context.strokeStyle = `rgba(16,22,12,${opacity})`;
    let moving = false;
    grass.context.beginPath();
    for (const p of TRACK.samples) {
      if (p.y < 0.58) { moving = false; continue; }
      const x = u(p.x - p.dz * offset) * width;
      const y = (1 - v(p.z + p.dx * offset)) * height;
      if (moving) grass.context.lineTo(x, y);
      else { grass.context.moveTo(x, y); moving = true; }
    }
    grass.context.stroke();
  }

  grass.context.globalCompositeOperation = 'destination-out';
  drawMask(grass.context, water);
  grass.context.fill();
  for (const [left, right, near, far] of [[-17.20, -10.13, 0.13, 3.14], [1.58, 10.09, 1.56, 4.68]]) {
    const x = u(left) * width;
    const y = (1 - v(far)) * height;
    grass.context.beginPath();
    grass.context.roundRect(x, y, (u(right) - u(left)) * width, (v(far) - v(near)) * height, 14);
    grass.context.fill();
  }
  grass.context.globalCompositeOperation = 'source-over';

  const map = texture(grass.canvas);
  const terrain = new THREE.Mesh(shapeFrom(outline), new THREE.MeshStandardMaterial({ map, bumpMap: map,
    bumpScale: 0.022, roughness: 0.96, alphaTest: 0.49, alphaToCoverage: true }));
  terrain.position.y = GRASS_Y;
  terrain.receiveShadow = true;
  parent.add(terrain);
}

function riverbed(outline: readonly THREE.Vector3[]) {
  const bed = canvas2d(1024, 512);
  const { width, height } = bed.canvas;
  const rng = random(516);
  const stones = noiseField(178, 109, rng);
  const pixels = bed.context.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    const z = THREE.MathUtils.lerp(FRAME.bottom, FRAME.top, y / height);
    for (let x = 0; x < width; x++) {
      const wx = THREE.MathUtils.lerp(FRAME.left, FRAME.right, x / width);
      const reach = Math.hypot((wx - 4.58) / 4.82, (z + 0.72) / 2.30);
      const center = 1 - THREE.MathUtils.smoothstep(reach, 0.39, 0.98);
      const channel = THREE.MathUtils.smoothstep(-z, 3.3, 10.2) * 0.18;
      const fleck = 10 * stones(x / width, y / height) + 7 * rng();
      const i = (y * width + x) * 4;
      pixels.data[i] = 44 - center * 23 - channel * 12 + fleck;
      pixels.data[i + 1] = 92 - center * 22 - channel * 14 + fleck;
      pixels.data[i + 2] = 74 + center * 6 - channel * 6 + fleck * 0.7;
      pixels.data[i + 3] = 255;
    }
  }
  bed.context.putImageData(pixels, 0, 0);
  drawMask(bed.context, outline);
  bed.context.save();
  bed.context.clip();
  for (const [size, opacity] of [[34, 0.20], [21, 0.19], [10, 0.24], [4, 0.25]]) {
    bed.context.strokeStyle = `rgba(174,144,94,${opacity})`;
    bed.context.lineWidth = size;
    bed.context.stroke();
  }
  for (let i = 0; i < 1300; i++) {
    const x = u(0.4 + rng() * 9.05) * width;
    const y = (1 - v(-13.5 + rng() * 15.0)) * height;
    const radius = 0.2 + 1.28 * rng() ** 2;
    bed.context.fillStyle = i % 3 === 0 ? 'rgba(177,151,104,.28)' : 'rgba(32,57,44,.27)';
    bed.context.beginPath();
    bed.context.ellipse(x, y, radius * 1.45, radius, rng() * Math.PI, 0, Math.PI * 2);
    bed.context.fill();
  }
  bed.context.restore();
  return texture(bed.canvas);
}

function shoreline(parent: THREE.Object3D, outline: readonly THREE.Vector3[]) {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const rng = random(632);
  const count = outline.length;
  const bank = outline.map((p, i) => {
    const tangent = outline[(i + 1) % count].clone().sub(outline[(i + count - 1) % count]).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
    const rim = 0.19 + 0.08 * (1 + Math.sin(i * 0.67)) + rng() * 0.13;
    const shelf = p.clone().addScaledVector(normal, rim * 0.43);
    const outer = p.clone().addScaledVector(normal, rim);
    positions.push(p.x, WATER_Y - 0.026, p.z, shelf.x, GRASS_Y + 0.049, shelf.z, outer.x, GRASS_Y + 0.003, outer.z);
    const dark = new THREE.Color(0x51533b).multiplyScalar(0.76 + rng() * 0.36);
    const gravel = new THREE.Color(0xa68c65).multiplyScalar(0.64 + rng() * 0.42);
    const grass = new THREE.Color(p.z < -10.5 ? 0x998259 : 0x636e3f).multiplyScalar(0.72 + rng() * 0.44);
    colors.push(dark.r, dark.g, dark.b, gravel.r, gravel.g, gravel.b, grass.r, grass.g, grass.b);
    const a = i * 3;
    const b = ((i + 1) % count) * 3;
    indices.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
    return { p, outer, normal };
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const rim = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.92 }));
  rim.receiveShadow = true;
  parent.add(rim);

  const stone = new THREE.IcosahedronGeometry(1, 1);
  const vertices = stone.getAttribute('position');
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i);
    const y = vertices.getY(i);
    const z = vertices.getZ(i);
    const edge = 1 + 0.135 * Math.sin(4.1 * x + 1.6 * y) * Math.cos(3.4 * z - 2.1 * y);
    vertices.setXYZ(i, x * edge, y * edge, z * edge);
  }
  const deposits = bank.flatMap(({ p, outer }, i) => {
    const density = Math.sin(i * 0.49) + 0.62 * Math.cos(i * 0.81);
    if (density < -0.73 && rng() < 0.77) return [];
    const size = 0.040 + rng() ** 2 * 0.22;
    const center = p.clone().lerp(outer, 0.25 + rng() * 0.83);
    const small = center.clone().lerp(p, 0.4);
    small.x += (rng() - 0.5) * 0.22;
    small.z += (rng() - 0.5) * 0.22;
    return density > 0.70 ? [{ center, size }, { center: small, size: size * 0.51 }] : [{ center, size }];
  });
  const stones = new THREE.InstancedMesh(stone, standard(0xc0b6a1, 0.69), deposits.length);
  const pose = new THREE.Object3D();
  const palette = [0xb0a895, 0x9a8871, 0xbba37a, 0x797c72, 0xc6b89e];
  deposits.forEach(({ center, size }, i) => {
    pose.position.copy(center);
    pose.position.y = GRASS_Y + size * 0.32;
    pose.scale.set(size * (0.82 + rng() * 0.79), size * (0.43 + rng() * 0.27), size);
    pose.rotation.set((rng() - 0.5) * 0.56, rng() * Math.PI, (rng() - 0.5) * 0.36);
    pose.updateMatrix();
    stones.setMatrixAt(i, pose.matrix);
    stones.setColorAt(i, new THREE.Color(palette[i % palette.length]).multiplyScalar(0.70 + rng() * 0.51));
  });
  stones.receiveShadow = true;
  parent.add(stones);

  const wet = new THREE.MeshPhysicalMaterial({ color: 0x777064, roughness: 0.37, clearcoat: 0.25 });
  for (const [x, z, radius] of streamRocks) {
    const rock = new THREE.Mesh(stone, wet);
    rock.position.set(x, WATER_Y + radius * 0.10, z);
    rock.scale.set(radius, radius * 0.72, radius * 1.19);
    rock.rotation.set(0.18, rng() * Math.PI, -0.13);
    rock.castShadow = rock.receiveShadow = true;
    parent.add(rock);
  }
  return bank;
}

function reedBlade() {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const width = 0.048 * (1 - t) ** 0.62 + 0.001;
    const bend = 0.42 * t ** 2.4;
    positions.push(-width, t, bend, 0, t, bend - width * 0.48, width, t, bend);
    if (i < 5) {
      const a = i * 3;
      indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function pondPlants(parent: THREE.Object3D, bank: ReturnType<typeof shoreline>) {
  const roots = bank.filter(({ p }, i) => (i % 7 === 1 || i % 17 === 3) && p.z > -10.1 && p.z < 0.95);
  const pose = new THREE.Object3D();
  const rng = random(4027);
  const reedMaterial = standard(0x9da56b, 0.88);
  reedMaterial.side = THREE.DoubleSide;
  const reeds = new THREE.InstancedMesh(reedBlade(), reedMaterial, roots.length * 8);
  const stem = new THREE.CylinderGeometry(0.010, 0.016, 1, 5).translate(0, 0.5, 0);
  const seedHead = new THREE.CapsuleGeometry(0.044, 0.129, 3, 7);
  const stalks = new THREE.InstancedMesh(stem, standard(0x777b3e, 0.91), Math.ceil(roots.length / 4) * 2);
  const heads = new THREE.InstancedMesh(seedHead, standard(0x714a30, 0.91), stalks.count);
  const blades = [0x6c893e, 0x83a34e, 0x9ba357, 0x566832, 0xa6a268];
  roots.forEach(({ outer, normal }, i) => {
    const size = 0.73 + rng() * 0.65;
    for (let j = 0; j < 8; j++) {
      pose.position.copy(outer).addScaledVector(normal, (rng() - 0.16) * 0.32);
      pose.position.x += (rng() - 0.5) * 0.25;
      pose.position.z += (rng() - 0.5) * 0.25;
      pose.position.y = GRASS_Y;
      pose.rotation.set((rng() - 0.5) * 0.47, rng() * Math.PI * 2, (rng() - 0.5) * 0.47);
      pose.scale.set(0.75 + rng() * 0.76, size * (0.29 + rng() * 0.49), 0.56 + rng() * 0.52);
      pose.updateMatrix();
      reeds.setMatrixAt(i * 8 + j, pose.matrix);
      reeds.setColorAt(i * 8 + j, new THREE.Color(blades[(i + j) % blades.length]));
    }
    if (i % 4 !== 0) return;
    for (let j = 0; j < 2; j++) {
      const index = i / 2 + j;
      const height = size * (0.60 + rng() * 0.37);
      pose.position.copy(outer).addScaledVector(normal, 0.11 + j * 0.16);
      pose.position.y = GRASS_Y;
      pose.rotation.set(0.11 - j * 0.16, 0, 0.05 + j * 0.07);
      pose.scale.set(1, height, 1);
      pose.updateMatrix();
      stalks.setMatrixAt(index, pose.matrix);
      const tip = new THREE.Vector3(0, 0.91, 0).applyMatrix4(pose.matrix);
      pose.position.copy(tip);
      pose.scale.setScalar(0.78 + rng() * 0.34);
      pose.updateMatrix();
      heads.setMatrixAt(index, pose.matrix);
    }
  });
  reeds.receiveShadow = stalks.receiveShadow = heads.receiveShadow = true;
  parent.add(reeds, stalks, heads);

  const leaf = new THREE.Shape();
  leaf.moveTo(0, 0);
  leaf.absarc(0, 0, 1, 0.26, Math.PI * 2 - 0.28, false);
  leaf.closePath();
  const pads = [[1.53, -1.92, 0.22], [1.83, -1.62, 0.15], [2.05, -2.04, 0.20], [7.84, -0.98, 0.27],
    [7.62, -0.57, 0.18], [8.17, -0.77, 0.18], [8.61, -1.10, 0.21], [4.96, -2.22, 0.19]];
  const lilies = new THREE.InstancedMesh(new THREE.ShapeGeometry(leaf, 10).rotateX(-Math.PI / 2), standard(0x7e9741, 0.65), pads.length);
  for (const [i, [x, z, radius]] of pads.entries()) {
    pose.position.set(x, WATER_Y + 0.006, z);
    pose.rotation.set(0, rng() * Math.PI * 2, 0);
    pose.scale.set(radius, 1, radius * (0.73 + rng() * 0.20));
    pose.updateMatrix();
    lilies.setMatrixAt(i, pose.matrix);
    lilies.setColorAt(i, new THREE.Color().setRGB(0.62 + rng() * 0.30, 0.71 + rng() * 0.25, 0.57));
  }
  parent.add(lilies);

  const petal = new THREE.SphereGeometry(0.070, 8, 5);
  const pale = standard(0xf0c9b7, 0.76);
  const heart = standard(0xe9b94f, 0.76);
  const seed = new THREE.SphereGeometry(0.034, 8, 5);
  for (const [x, z] of [[1.53, -1.92], [7.84, -0.98]]) {
    const center = new THREE.Mesh(seed, heart);
    center.position.set(x, WATER_Y + 0.038, z);
    parent.add(center);
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3;
      const piece = new THREE.Mesh(petal, pale);
      piece.position.set(x + Math.cos(angle) * 0.067, WATER_Y + 0.030, z + Math.sin(angle) * 0.067);
      piece.scale.set(1.1, 0.29, 0.60);
      piece.rotation.y = -angle;
      parent.add(piece);
    }
  }
}

function fish(parent: THREE.Object3D) {
  const ivory = standard(0xe6c996, 0.62);
  const vermilion = standard(0xe27a43, 0.58);
  const gold = standard(0xe3ac4e, 0.60);
  const paleFin = ivory.clone();
  const orangeFin = vermilion.clone();
  paleFin.side = orangeFin.side = THREE.DoubleSide;
  const body = new THREE.SphereGeometry(1, 14, 8);
  const tail = new THREE.Shape();
  tail.moveTo(0, 0.012);
  tail.lineTo(-0.103, 0.148);
  tail.lineTo(0, 0.098);
  tail.lineTo(0.104, 0.145);
  tail.closePath();
  const fin = new THREE.ShapeGeometry(tail).rotateX(-Math.PI / 2);
  const swimmers = [ivory, gold, ivory, vermilion, ivory].map((material, index) => {
    const group = new THREE.Group();
    parent.add(group);
    const mesh = new THREE.Mesh(body, material);
    mesh.scale.set(0.083 + index % 2 * 0.013, 0.021, 0.224);
    group.add(mesh);
    const caudal = new THREE.Mesh(fin, index % 2 ? paleFin : orangeFin);
    caudal.position.set(0, 0.006, -0.185);
    group.add(caudal);
    for (const [offset, z, width] of [[-0.026, 0.075, 0.046], [0.030, -0.054, 0.040]]) {
      const blotch = new THREE.Mesh(body, material === ivory ? vermilion : ivory);
      blotch.position.set(offset, 0.014, z);
      blotch.scale.set(width, 0.010, 0.062);
      group.add(blotch);
    }
    return { group, caudal };
  });
  return (time: number) => {
    for (const [i, { group, caudal }] of swimmers.entries()) {
      const angle = time * (0.36 + i * 0.034) + i * Math.PI * 0.45;
      const rx = 1.95 + (i % 3) * 0.38;
      const rz = 0.79 + (i % 3) * 0.18;
      group.position.set(4.65 + Math.cos(angle) * rx, -0.184 + Math.sin(time * 0.8 + i) * 0.004, -0.74 + Math.sin(angle) * rz);
      group.rotation.y = Math.atan2(-Math.sin(angle) * rx, Math.cos(angle) * rz);
      caudal.rotation.y = Math.sin(time * 12 + i * 1.8) * 0.31;
    }
  };
}

export function buildInfield(parent: THREE.Object3D) {
  const garden = new THREE.Group();
  garden.name = 'Pradera, laguna y arroyo de la Ese Alta';
  parent.add(garden);
  const outline = new THREE.CatmullRomCurve3(waterBanks.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal')
    .getPoints(144).slice(0, -1);
  ground(garden, outline);
  const geometry = shapeFrom(outline);
  const materials = pondMaterials(riverbed(outline));
  const depth = new THREE.Mesh(geometry, materials.bed);
  depth.position.y = BED_Y;
  depth.receiveShadow = true;
  garden.add(depth);
  const water = new THREE.Mesh(geometry, materials.water);
  water.position.y = WATER_Y;
  water.receiveShadow = true;
  water.renderOrder = 2;
  garden.add(water);
  const bank = shoreline(garden, outline);
  pondPlants(garden, bank);
  instanceStatic(garden);
  const swim = fish(garden);
  swim(0);

  return {
    captureReflections(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
      materials.capture(renderer, scene, water);
    },
    update(now: number) {
      const time = now / 1000;
      materials.update(time);
      swim(time);
    },
  };
}
