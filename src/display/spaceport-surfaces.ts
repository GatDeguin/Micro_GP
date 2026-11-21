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
    if (kind === 'asphalt') {
      const chip = smoothChip(noise(u, v, 102));
      c = 219 + (grain - .5) * 34 + broad * 12 - pore * 21 + chip * 38;
      h = .5 + (grain - .5) * .14 - pore * .13 + chip * .18;
      r = .86 + grain * .13 - chip * .23;
    }
    colour.set([c, c - warm * .25, c - warm, 255], i);
    height.set([h * 255, h * 255, h * 255, 255], i);
    roughness.set([255, r * 255, 255, 255], i);
  }
  const make = (pixels: Uint8Array, colorSpace: THREE.ColorSpace) => {
    const map = new THREE.DataTexture(pixels, size, size);
    map.colorSpace = colorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true; map.anisotropy = 8; map.needsUpdate = true;
    map.repeat.setScalar(kind === 'asphalt' ? .52 : kind === 'wood' ? .50 : kind === 'concrete' ? .48 : .8);
    return map;
  };
  return { map: make(colour, THREE.SRGBColorSpace), bumpMap: make(height, THREE.NoColorSpace),
    roughnessMap: make(roughness, THREE.NoColorSpace) };
}

function smoothChip(value: number) {
  return THREE.MathUtils.smoothstep(value, .63, .91);
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

/** Outdoor reflection probes in linear HDR. Wide cloud and roof shapes remain
 * legible on curved paint after prefiltering. Night has its own luminaires. */
export function exteriorEnvironment(renderer: THREE.WebGLRenderer, port: boolean, night: boolean) {
  const width = 256, height = 128, pixels = new Float32Array(width * height * 4);
  const sun = new THREE.Vector3(port ? -143 : -145, port ? 96 : 88, port ? 172 : 168).normalize();
  const smooth = THREE.MathUtils.smoothstep;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const phi = x / width * Math.PI * 2, theta = y / height * Math.PI;
    // Equirect UV.y is asin(direction.y) / PI + .5. DataTexture row 0
    // is the southern hemisphere (flipY=false), not the sky.
    const dx = -Math.sin(theta) * Math.cos(phi), dy = -Math.cos(theta), dz = -Math.sin(theta) * Math.sin(phi);
    const horizon = Math.exp(-Math.abs(dy) * 5), sky = smooth(dy, -.12, .1);
    const towardSun = Math.max(0, dx * sun.x + dy * sun.y + dz * sun.z);
    const sunspot = Math.pow(towardSun, 215) * 9 + Math.pow(towardSun, 22) * .55;
    const cloud = smooth(Math.sin(phi * 3 + dy * 7) + .24 * Math.sin(phi * 11 - dy * 18), .20, .84)
      * smooth(dy, .06, .24) * (1 - smooth(dy, .42, .62));
    const roofs = (1 - smooth(dy, .055 + .045 * Math.sin(phi * 5), .12 + .045 * Math.sin(phi * 5)))
      * smooth(dy, -.31, -.09) * smooth(Math.sin(phi * 6) + .29 * Math.cos(phi * 13), -.24, .18);
    const lightRow = smooth(Math.cos(phi * 4 + .77), .91, .99)
      * smooth(dy, .035, .095) * (1 - smooth(dy, .135, .21));
    const highLights = Math.pow(Math.max(0, Math.cos(phi * 3 + .56)), 24)
      * Math.exp(-((dy - .38) ** 2) * 350);
    const i = (y * width + x) * 4;
    if (night) {
      const warm = (port ? 4 : 2.5) * (lightRow + .65 * highLights);
      const cool = 1.8 * Math.pow(Math.max(0, Math.cos(phi * 3 - 1)), 26) * Math.exp(-((dy - .19) ** 2) * 320);
      pixels.set([.026 + .030 * horizon + warm + cool * .52, .045 + .047 * horizon + warm * .59 + cool * .78,
        .088 + .062 * horizon + warm * .27 + cool, 1], i);
    } else {
      const open = 1 - .80 * roofs;
      const whiteLight = .96 * cloud + .42 * lightRow;
      pixels.set([open * (.14 + .19 * horizon + .28 * sky + whiteLight) + sunspot,
        open * (.12 + .20 * horizon + .48 * sky + .94 * whiteLight) + sunspot * .83,
        open * (.105 + .16 * horizon + .75 * sky + .86 * whiteLight) + sunspot * .62, 1], i);
    }
  }
  const source = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat, THREE.FloatType);
  source.mapping = THREE.EquirectangularReflectionMapping; source.needsUpdate = true;
  const generator = new THREE.PMREMGenerator(renderer);
  try { return generator.fromEquirectangular(source); }
  finally { generator.dispose(); source.dispose(); }
}
