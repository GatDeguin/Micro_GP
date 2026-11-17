import * as THREE from 'three';

type Surface = 'concrete' | 'plaster' | 'paint' | 'steel' | 'wood' | 'asphalt';
// Repeatable linear data maps: colour is sRGB, height and roughness are data.
// The same physical-size UVs are shared by spatial batches throughout the base.
function maps(kind: Surface) {
  const size = 256, colour = new Uint8Array(size * size * 4);
  const height = new Uint8Array(colour.length), roughness = new Uint8Array(colour.length);
  const hash = (x: number, y: number) => {
    let n = Math.imul(x + 197, 374761393) ^ Math.imul(y + 977, 668265263);
    n = Math.imul(n ^ n >>> 16, 0x85ebca6b);
    n = Math.imul(n ^ n >>> 13, 0xc2b2ae35);
    return ((n ^ n >>> 16) >>> 0) / 4294967296;
  };
  const noise = (u: number, v: number, cells: number) => {
    const xx = u * cells, yy = v * cells, x = Math.floor(xx), y = Math.floor(yy);
    const sx = (xx - x) ** 2 * (3 - 2 * (xx - x)), sy = (yy - y) ** 2 * (3 - 2 * (yy - y));
    const a = hash(x % cells, y % cells), b = hash((x + 1) % cells, y % cells);
    const c = hash(x % cells, (y + 1) % cells), d = hash((x + 1) % cells, (y + 1) % cells);
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4, u = x / size, v = y / size;
    const grain = hash(x, y), broad = noise(u, v, 5) * .65 + noise(u, v, 13) * .35 - .5;
    const pore = Math.max(0, .12 - grain) / .12;
    let c = 242, h = .5, r = .8, warm = 0;
    const stain = Math.max(0, noise(u, v, 7) - .55) * 2.2;
    const scratch = Math.max(0, noise(u * 2, v * .25, 29) - .72) * 3;
    if (kind === 'concrete') { c = 229 + grain * 18 + broad * 10 - pore * 22 - stain * 8; h = .50 + (grain - .5) * .18 - pore * .20; r = .80 + grain * .17 - stain * .08; warm = stain * 4; }
    if (kind === 'plaster') { c = 239 + (grain - .5) * 12 + broad * 11 - stain * 15; h = .5 + (grain - .5) * .14; r = .78 + grain * .16; }
    if (kind === 'paint') { c = 245 + (grain - .5) * 7 + broad * 8 - stain * 14 - scratch * 32; h = .5 + (grain - .5) * .05 - scratch * .06; r = .28 + grain * .15 + stain * .27 + scratch * .30; }
    if (kind === 'steel') { const scratch = hash(x, 0); c = 239 + scratch * 13 + (grain - .5) * 3; h = .5 + (scratch - .5) * .035; r = .24 + scratch * .24; }
    if (kind === 'wood') {
      const ring = Math.sin(u * Math.PI * 22 + Math.sin(v * Math.PI * 2) * .70 + Math.sin(v * Math.PI * 6) * .16);
      c = 222 + ring * 13 + (grain - .5) * 8; h = .5 + ring * .1; r = .67 + grain * .16; warm = 7;
    }
    if (kind === 'asphalt') { c = 232 + (grain - .5) * 29 + broad * 6 - pore * 21; h = .5 + (grain - .5) * .23 - pore * .16; r = .82 + grain * .17; }
    colour.set([c, c - warm * .25, c - warm, 255], i);
    height.set([h * 255, h * 255, h * 255, 255], i);
    roughness.set([255, r * 255, 255, 255], i);
  }
  const make = (pixels: Uint8Array, colorSpace: THREE.ColorSpace) => {
    const map = new THREE.DataTexture(pixels, size, size);
    map.colorSpace = colorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true; map.anisotropy = 8; map.needsUpdate = true;
    map.repeat.setScalar(kind === 'asphalt' ? 2.2 : kind === 'wood' ? .50 : kind === 'concrete' ? .48 : .8);
    return map;
  };
  return { map: make(colour, THREE.SRGBColorSpace), bumpMap: make(height, THREE.NoColorSpace),
    roughnessMap: make(roughness, THREE.NoColorSpace) };
}

export function createSpaceportSurfaces() {
  const material = (kind: Surface, metalness: number, bumpScale: number) => new THREE.MeshStandardMaterial({
    ...maps(kind), color: 0xffffff, vertexColors: true, roughness: 1, metalness, bumpScale,
  });
  const concrete = material('concrete', 0, .027), plaster = material('plaster', 0, .009);
  const paint = new THREE.MeshPhysicalMaterial({ ...maps('paint'), color: 0xffffff, vertexColors: true,
    metalness: .18, roughness: 1, bumpScale: .004, clearcoat: .28, clearcoatRoughness: .34 });
  const steel = material('steel', .82, .003);
  const wood = material('wood', 0, .010), asphalt = material('asphalt', .02, .008);
  const rubber = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: .96, metalness: 0 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: .12,
    metalness: .24, envMapIntensity: 1.9, clearcoat: .75, clearcoatRoughness: .10 });
  const routes = new Map<number, THREE.MeshStandardMaterial>();
  for (const color of [0x858d89, 0xaaa99b, 0x777e78]) routes.set(color, concrete);
  routes.set(0xc4c6bc, plaster);
  for (const color of [0x243f50, 0x223c52, 0xe5e5cf, 0xe1e1d5, 0xd87d33, 0xd76c35, 0x398fa9]) routes.set(color, paint);
  for (const color of [0x748991, 0x64747b, 0xb8c4c6]) routes.set(color, steel);
  routes.set(0xd7a568, wood);
  for (const color of [0x19292e, 0x233036, 0x1c2b35]) routes.set(color, rubber);
  routes.set(0x335b6b, glass);
  return { concrete, plaster, paint, steel, wood, rubber, glass, asphalt, routes };
}

/** Static outdoor reflection probe; generated/filtered only when first needed. */
export function spaceportEnvironment(renderer: THREE.WebGLRenderer) {
  const width = 256, height = 128, pixels = new Float32Array(width * height * 4);
  const sun = new THREE.Vector3(-110, 115, 160).normalize();
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const phi = x / width * Math.PI * 2, theta = y / height * Math.PI;
    // Equirect UV.y is asin(direction.y) / PI + .5. DataTexture row 0
    // is the southern hemisphere (flipY=false), not the sky.
    const dx = -Math.sin(theta) * Math.cos(phi), dy = -Math.cos(theta), dz = -Math.sin(theta) * Math.sin(phi);
    const horizon = Math.exp(-Math.abs(dy) * 5), sky = Math.max(0, dy);
    const sunspot = Math.pow(Math.max(0, dx * sun.x + dy * sun.y + dz * sun.z), 180) * 3.4;
    const cloud = Math.max(0, Math.sin(phi * 3 + dy * 7)) * sky * .16;
    const buildings = dy < .08 && dy > -.28 && (Math.sin(phi * 9) > .25) ? .18 : 0;
    const i = (y * width + x) * 4;
    pixels[i] = Math.max(.04, (dy > 0 ? .42 + horizon * .18 + cloud : .13 + horizon * .14) + sunspot - buildings);
    pixels[i + 1] = Math.max(.05, (dy > 0 ? .57 + horizon * .15 + cloud : .14 + horizon * .17) + sunspot * .91 - buildings);
    pixels[i + 2] = Math.max(.06, (dy > 0 ? .76 + horizon * .07 + cloud : .15 + horizon * .18) + sunspot * .72 - buildings);
    pixels[i + 3] = 1;
  }
  const source = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat, THREE.FloatType);
  source.mapping = THREE.EquirectangularReflectionMapping; source.needsUpdate = true;
  const generator = new THREE.PMREMGenerator(renderer);
  try { return generator.fromEquirectangular(source); }
  finally { generator.dispose(); source.dispose(); }
}
