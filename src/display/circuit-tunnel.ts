import * as THREE from 'three';
import { TRACK, wallHalfAt } from '../shared/track';
import { box, canvas2d, noiseField, random, standard, texture } from './materials';

function concreteTexture() {
  const { canvas, context } = canvas2d(192, 192);
  const rng = random(129);
  const stain = noiseField(12, 10, rng);
  const pixels = context.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const grain = 161 + 26 * stain(x / canvas.width, y / canvas.height) + 37 * (rng() - 0.5);
      const i = (y * canvas.width + x) * 4;
      pixels.data[i] = grain + 9;
      pixels.data[i + 1] = grain + 5;
      pixels.data[i + 2] = grain - 3;
      pixels.data[i + 3] = 255;
    }
  }
  context.putImageData(pixels, 0, 0);
  const map = texture(canvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(0.46, 0.63);
  return map;
}

function profile(inside: number, archClearance: number, flatClearance: number, flatten: number) {
  const outside = inside + 0.38;
  const height = THREE.MathUtils.lerp(archClearance, flatClearance, flatten);
  const crown = (radius: number, rise: number, y: number) => Array.from({ length: 31 }, (_, i) => {
    const across = i / 15 - 1;
    return new THREE.Vector2(radius * across, y + rise * (1 - flatten) * Math.sqrt(1 - across * across));
  });
  return [new THREE.Vector2(-outside, -0.228), ...crown(outside, 0.79, height + 0.15),
    new THREE.Vector2(outside, -0.228), new THREE.Vector2(inside, -0.228),
    ...crown(inside, 0.48, height).reverse(), new THREE.Vector2(-inside, -0.228)];
}

function vaultGeometry(sections: readonly { distance: number; shape: THREE.Vector2[] }[]) {
  const positions: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  const count = sections[0].shape.length;
  for (const { distance, shape } of sections) {
    let span = 0;
    for (let i = 0; i <= count; i++) {
      const point = shape[i % count];
      positions.push(point.x, point.y, distance);
      if (i > 0) span += point.distanceTo(shape[i - 1]);
      uv.push(span, distance);
    }
  }
  const ring = count + 1;
  for (let i = 0; i < sections.length - 1; i++) {
    for (let j = 0; j < count; j++) {
      const a = i * ring + j;
      const b = a + 1;
      indices.push(a, a + ring, b, b, a + ring, b + ring);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function plaqueMaterial() {
  const { canvas, context } = canvas2d(384, 80);
  context.fillStyle = '#272421';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#c3a565';
  context.lineWidth = 4;
  context.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
  context.fillStyle = '#e9d7a7';
  context.font = '800 48px Arial, sans-serif';
  context.textAlign = 'center';
  context.fillText('TÚNEL', canvas.width / 2, 58);
  const plate = standard(0xffffff, 0.71);
  plate.map = texture(canvas);
  return plate;
}

function hazardMaterial() {
  const { canvas, context } = canvas2d(64, 128);
  context.fillStyle = '#403a30';
  context.fillRect(0, 0, 64, 128);
  context.strokeStyle = '#c9a850';
  context.lineWidth = 14;
  for (let y = -38; y < canvas.height + 65; y += 31) {
    context.beginPath();
    context.moveTo(0, y + 58);
    context.lineTo(64, y);
    context.stroke();
  }
  const plate = standard(0xffffff, 0.82);
  plate.map = texture(canvas);
  return plate;
}

export function buildTunnel(parent: THREE.Object3D) {
  const { from, archTo, taperTo, to, clearance, archClearance } = TRACK.tunnel;
  const center = TRACK.sampleAt((from + to) / 2);
  const width = wallHalfAt(center.s, 1) + 0.14;
  const depth = to - from;
  const tunnel = new THREE.Group();
  tunnel.name = 'Túnel bajo del Taller';
  tunnel.position.set(center.x, center.y, center.z);
  tunnel.rotation.y = Math.atan2(center.dx, center.dz);
  parent.add(tunnel);

  const concrete = concreteTexture();
  const shell = standard(0x9b9588, 0.91);
  shell.map = concrete;
  shell.bumpMap = concrete;
  shell.bumpScale = 0.025;
  const stone = standard(0xc2b598, 0.86);
  stone.map = concrete;
  const arch = profile(width, archClearance, clearance, 0);
  const flat = profile(width, archClearance, clearance, 1);
  const stations = [from, archTo, (archTo + taperTo) / 2, taperTo, to];
  const mid = (from + to) / 2;
  const shapes = [arch, arch, profile(width, archClearance, clearance, 0.5), flat, flat];
  const body = new THREE.Mesh(vaultGeometry(stations.map((s, i) => ({ distance: s - mid, shape: shapes[i] }))), shell);
  body.castShadow = body.receiveShadow = true;
  tunnel.add(body);

  const lip = new THREE.ExtrudeGeometry(new THREE.Shape(arch), { depth: 0.21, bevelEnabled: false });
  const sign = new THREE.PlaneGeometry(2.23, 0.282);
  const stripe = new THREE.PlaneGeometry(0.27, 0.96);
  const plate = plaqueMaterial();
  const warnings = hazardMaterial();
  const hardware = standard(0x665f51, 0.58, 0.31);
  const frame = new THREE.Mesh(lip, [stone, shell]);
  frame.position.z = -depth / 2;
  frame.scale.set(1.02, 1.015, 1);
  frame.castShadow = frame.receiveShadow = true;
  tunnel.add(frame);
  const join = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(flat)), stone);
  join.position.z = depth / 2;
  join.receiveShadow = true;
  tunnel.add(join);
  box(tunnel, shell, 0, clearance + 0.197, depth / 2 - 0.024, 2 * (width + 0.38), 0.098, 0.048, false);
  const face = new THREE.Mesh(sign, plate);
  face.position.set(0, archClearance + 0.685, -depth / 2 - 0.016);
  face.rotation.y = Math.PI;
  face.receiveShadow = true;
  tunnel.add(face);
  for (const side of [-1, 1]) {
    const caution = new THREE.Mesh(stripe, warnings);
    caution.position.set(side * (width + 0.22), 1.04, face.position.z);
    caution.rotation.y = face.rotation.y;
    caution.receiveShadow = true;
    tunnel.add(caution);
    box(tunnel, hardware, side * (width + 0.25), 0.061, -depth / 2 + 0.12, 0.36, 0.12, 0.23);
  }

  const tube = new THREE.MeshBasicMaterial({ color: 0xffdc96, toneMapped: false });
  const lightAt = (archTo + from) / 2 - mid;
  const length = archTo - from;
  for (const side of [-1, 1]) {
    box(tunnel, hardware, side * 2.60, archClearance + 0.10, lightAt, 0.16, 0.089, length - 0.73, false);
    box(tunnel, tube, side * 2.60, archClearance + 0.059, lightAt, 0.11, 0.023, length - 0.93, false);
  }
  const lamp = new THREE.PointLight(0xffd4a2, 13, 5.3, 2);
  lamp.position.set(0, archClearance - 0.28, lightAt + 0.65);
  tunnel.add(lamp);
}
