import * as THREE from 'three';

export const BENCH_SURFACE = -1.60;

export function random(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function canvas2d(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No se pudo crear una textura de la maqueta.');
  return { canvas, context };
}

export function texture(canvas: HTMLCanvasElement) {
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return map;
}

export function standard(color: THREE.ColorRepresentation, roughness = 0.76, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

const boxGeometry = new THREE.BoxGeometry(1, 1, 1);

export function box(
  parent: THREE.Object3D,
  material: THREE.Material,
  x: number, y: number, z: number,
  width: number, height: number, depth: number,
  casts = true,
) {
  const mesh = new THREE.Mesh(boxGeometry, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(width, height, depth);
  mesh.receiveShadow = true;
  mesh.castShadow = casts;
  parent.add(mesh);
  return mesh;
}

export function noiseField(columns: number, rows: number, rng: () => number) {
  const grid = Float32Array.from({ length: columns * rows }, rng);
  return (u: number, v: number) => {
    const x = (u - Math.floor(u)) * columns;
    const y = (v - Math.floor(v)) * rows;
    const left = Math.floor(x);
    const top = Math.floor(y);
    const right = (left + 1) % columns;
    const bottom = (top + 1) % rows;
    const dx = x - left;
    const dy = y - top;
    const a = dx * dx * (3 - 2 * dx);
    const b = dy * dy * (3 - 2 * dy);
    const upper = grid[top * columns + left] * (1 - a) + grid[top * columns + right] * a;
    const lower = grid[bottom * columns + left] * (1 - a) + grid[bottom * columns + right] * a;
    return upper * (1 - b) + lower * b;
  };
}

export function plankMap() {
  const { canvas, context } = canvas2d(1536, 768);
  const rng = random(26);
  const crown = noiseField(5, 9, rng);
  const curl = noiseField(11, 21, rng);
  const figure = noiseField(9, 12, rng);
  const poresAlong = noiseField(83, 166, rng);
  const pores = noiseField(29, 114, rng);
  const image = context.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    const v = y / canvas.height;
    for (let x = 0; x < canvas.width; x++) {
      const u = x / canvas.width;
      const swirl = figure(u + 0.08 * crown(u, v), v);
      const warped = v + 0.128 * crown(u, v) + 0.070 * curl(u, v) + 0.025 * swirl;
      const cathedrals = Math.sin(2 * Math.PI * (warped * 31 + 0.58 * swirl));
      const grain = Math.max(0, cathedrals) ** 8 * (0.36 + 0.64 * curl(u, v));
      const fineGrain = pores(u, warped);
      const streak = Math.sin(2 * Math.PI * (warped * 104 + 0.58 * fineGrain));
      const pinhole = Math.max(0, poresAlong(u, warped) - 0.74);
      const shade = 214 + 27 * (crown(u + 0.08, v) - 0.5) + 16 * (swirl - 0.5)
        - (14 + 21 * swirl) * grain - Math.max(0, streak - 0.58) * 12
        + 9 * (fineGrain - 0.5) - pinhole * 49 + 5 * (rng() - 0.5);
      const i = (y * canvas.width + x) * 4;
      image.data[i] = shade + 10;
      image.data[i + 1] = shade - 12;
      image.data[i + 2] = shade - 39;
      image.data[i + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const map = texture(canvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  return map;
}

export function benchMap() {
  const { canvas, context } = canvas2d(1536, 768);
  const relief = canvas2d(canvas.width, canvas.height);
  const rng = random(3512);
  const oil = noiseField(8, 6, rng);
  const wear = noiseField(33, 77, rng);
  const fibers = noiseField(48, 229, rng);
  const islands = noiseField(108, 113, rng);
  const crust = noiseField(19, 14, rng);
  const image = context.createImageData(canvas.width, canvas.height);
  const roughness = relief.context.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    const v = y / canvas.height;
    for (let x = 0; x < canvas.width; x++) {
      const u = x / canvas.width;
      const stain = oil(u, v);
      const gouge = fibers(u, v + 0.017 * stain);
      const paint = islands(u + gouge * 0.002, v);
      const erosion = wear(u, v) * 0.46 + gouge * 0.14 + paint * 0.23 + crust(u, v) * 0.17;
      const particle = (rng() - 0.5) * 15;
      const scuff = Math.max(0, (erosion - 0.50) * 3.4);
      const carbon = Math.max(0, (0.46 - erosion) * 3.1);
      const grain = 2.2 * Math.sin((v * 224 + 1.6 * stain) * Math.PI * 2) + (gouge - 0.5) * 10;
      const shade = 69 + (stain - 0.5) * 22 + scuff * 38 - carbon * 27 + particle + grain;
      const cold = Math.max(0, (paint - 0.57) * 3.0) * Math.max(0, (0.64 - erosion) * 4.4);
      const oldPaint = Math.max(0, (crust(u + 0.037, v) - 0.74) * 3.7) * Math.max(0, (paint - 0.36) * 1.5);
      const i = (y * canvas.width + x) * 4;
      image.data[i] = shade + 23 - cold * 34 + 21 * oldPaint;
      image.data[i + 1] = shade - 1 + cold * 4 - 10 * oldPaint;
      image.data[i + 2] = shade - 15 + cold * 24 - 3 * oldPaint;
      image.data[i + 3] = 255;
      const sheen = 189 + stain * 16 + carbon * 42 - scuff * 84 + grain * 1.1;
      roughness.data[i] = roughness.data[i + 1] = roughness.data[i + 2] = sheen;
      roughness.data[i + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  relief.context.putImageData(roughness, 0, 0);
  for (let i = 0; i < 4300; i++) {
    const x = rng() * canvas.width;
    const y = rng() * canvas.height;
    const length = 2 + 76 * rng() ** 3;
    const patch = crust(x / canvas.width, y / canvas.height);
    if (patch < 0.39 && i % 5 !== 0) continue;
    context.strokeStyle = i % 4 === 0 ? 'rgba(215,171,119,.27)' : 'rgba(17,15,14,.41)';
    context.lineWidth = 0.24 + rng() * 0.81;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + length, y + (rng() - 0.5) * length * (i % 5 === 0 ? 0.95 : 0.24));
    context.stroke();
  }
  const color = texture(canvas);
  const rough = texture(relief.canvas);
  rough.colorSpace = THREE.NoColorSpace;
  for (const map of [color, rough]) map.wrapS = map.wrapT = THREE.RepeatWrapping;
  return { color, rough };
}

export function gritMap() {
  const { canvas, context } = canvas2d(256, 256);
  const rng = random(413);
  const pixels = context.createImageData(canvas.width, canvas.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const stone = rng();
    const shade = 219 + rng() * 33 - stone * stone * stone * 44;
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = shade;
    pixels.data[i + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  const map = texture(canvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  return map;
}

export function flatSign(canvas: HTMLCanvasElement, width: number, height: number) {
  const map = texture(canvas);
  const material = new THREE.MeshBasicMaterial({ map, toneMapped: false });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  return { panel, map };
}

export function horizontalShadow() {
  const { canvas, context } = canvas2d(64, 64);
  const gradient = context.createRadialGradient(32, 32, 7, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(17, 13, 10, .48)');
  gradient.addColorStop(0.5, 'rgba(17, 13, 10, .32)');
  gradient.addColorStop(1, 'rgba(17, 13, 10, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return new THREE.MeshBasicMaterial({ map: texture(canvas), transparent: true, depthWrite: false });
}
