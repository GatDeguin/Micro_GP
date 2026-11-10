import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { instanceStatic } from './batches';
import { canvas2d, standard } from './materials';

const panoramas = new WeakMap<THREE.WebGLRenderer, THREE.WebGLRenderTarget>();

export function disposeCollectorBackdrop(renderer: THREE.WebGLRenderer) {
  panoramas.get(renderer)?.dispose();
  panoramas.delete(renderer);
}
const displayWidth = 6.30;
const shelves = [0.86, 2.13, 3.40];

function paneMap() {
  const { canvas, context } = canvas2d(256, 192);
  // Soft reflections of a shop window and long ceiling fixtures in the cabinet glass.
  context.translate(119, 110);
  context.rotate(-0.42);
  const bands = context.createLinearGradient(-140, 0, 140, 0);
  bands.addColorStop(0, 'rgba(225,235,247,0)');
  bands.addColorStop(0.25, 'rgba(225,235,247,0)');
  bands.addColorStop(0.30, 'rgba(225,235,247,0.18)');
  bands.addColorStop(0.38, 'rgba(225,235,247,0.12)');
  bands.addColorStop(0.46, 'rgba(225,235,247,0)');
  bands.addColorStop(0.56, 'rgba(225,235,247,0)');
  bands.addColorStop(0.58, 'rgba(255,231,199,0.19)');
  bands.addColorStop(0.61, 'rgba(255,231,199,0.07)');
  bands.addColorStop(0.63, 'rgba(255,231,199,0)');
  bands.addColorStop(1, 'rgba(255,231,199,0)');
  context.fillStyle = bands;
  context.fillRect(-140, -170, 280, 340);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

function bayMap() {
  const { canvas, context } = canvas2d(96, 96);
  const gradient = context.createLinearGradient(0, 0, 0, 96);
  gradient.addColorStop(0, '#8a6951');
  gradient.addColorStop(0.24, '#685043');
  gradient.addColorStop(0.68, '#42353a');
  gradient.addColorStop(1, '#33272a');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 96, 96);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

function caseRoom(hdr: boolean) {
  const room = new THREE.Group();
  const cube = new THREE.BoxGeometry();
  const panel = new THREE.PlaneGeometry();
  const wheel = new THREE.CylinderGeometry(1, 1, 1, 14).rotateZ(Math.PI / 2);
  const plaster = standard(0x574b48, 0.92);
  const walnut = standard(0x503325, 0.54);
  const shelf = standard(0x836346, 0.48);
  const bronze = standard(0xb28a61, 0.44, 0.4);
  const rubber = standard(0x191b1d, 0.8);
  const alloy = standard(0xc9b9a9, 0.36, 0.4);
  const glazing = standard(0x34404b, 0.23, 0.23);
  const plate = standard(0x332c2b, 0.72);
  const ivory = standard(0xe5d4b4, 0.69);
  const headlights = new THREE.MeshBasicMaterial({ color: 0xe6d2ad });
  const taillights = new THREE.MeshBasicMaterial({ color: 0xb83127 });
  const lamp = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xffdfb1).multiplyScalar(hdr ? 2.6 : 0.95),
  });
  const backing = new THREE.MeshBasicMaterial({ map: bayMap() });
  const reflections = new THREE.MeshBasicMaterial({
    map: paneMap(), transparent: true, depthWrite: false, opacity: 0.78,
  });
  const glass = new THREE.MeshBasicMaterial({
    color: 0xbad2df, transparent: true, depthWrite: false, opacity: 0.036,
  });

  function mesh(parent: THREE.Group, material: THREE.Material, geometry: THREE.BufferGeometry,
    x: number, y: number, z: number, width = 1, height = 1, depth = 1) {
    const part = new THREE.Mesh(geometry, material);
    part.position.set(x, y, z);
    part.scale.set(width, height, depth);
    parent.add(part);
    return part;
  }

  function box(parent: THREE.Group, material: THREE.Material, x: number, y: number, z: number,
    width: number, height: number, depth: number) {
    return mesh(parent, material, cube, x, y, z, width, height, depth);
  }

  const models = [
    { color: 0x16858b, stripe: 0xf2e6c8, length: 1.53, height: 0.35, cabin: 0.78, wing: false },
    { color: 0xc53630, stripe: 0xe5e0d8, length: 1.77, height: 0.29, cabin: 0.76, wing: true },
    { color: 0xe0a02e, stripe: 0x25282d, length: 1.83, height: 0.21, cabin: 0.74, wing: true },
    { color: 0x2e619d, stripe: 0xefc386, length: 1.63, height: 0.34, cabin: 0.91, wing: false },
    { color: 0xcfc6ae, stripe: 0x597051, length: 1.71, height: 0.25, cabin: 0.78, wing: false },
    { color: 0x784b83, stripe: 0xe0a35c, length: 1.82, height: 0.23, cabin: 0.69, wing: true },
  ].map(spec => {
    const model = new THREE.Group();
    const paint = standard(spec.color, 0.31, 0.08);
    const livery = standard(spec.stripe, 0.47);
    const body = new RoundedBoxGeometry(0.79, 0.26, spec.length, 1, 0.072);
    const canopy = new RoundedBoxGeometry(0.61, spec.height, spec.cabin, 1, 0.09);
    mesh(model, paint, body, 0, 0.27, 0);
    mesh(model, glazing, canopy, 0, 0.37 + spec.height / 2, -0.12);
    box(model, paint, 0, 0.385 + spec.height, -0.15, 0.49, 0.028, spec.cabin * 0.69);
    box(model, livery, 0.035, 0.404, 0.57, 0.14, 0.012, spec.length - 1.18);
    for (const side of [-1, 1]) {
      for (const axle of [-1, 1]) {
        const z = axle * spec.length * 0.307;
        mesh(model, rubber, wheel, side * 0.376, 0.153, z, 0.13, 0.153, 0.153);
        mesh(model, alloy, wheel, side * 0.448, 0.153, z, 0.019, 0.091, 0.091);
        mesh(model, plate, wheel, side * 0.459, 0.153, z, 0.009, 0.036, 0.036);
      }
      box(model, livery, side * 0.395, 0.309, 0.01, 0.009, 0.050, spec.length * 0.53);
      mesh(model, ivory, wheel, side * 0.403, 0.311, -0.05, 0.010, 0.082, 0.082);
      box(model, headlights, side * 0.269, 0.302, spec.length / 2 - 0.005, 0.112, 0.063, 0.021);
      box(model, taillights, side * 0.267, 0.290, -spec.length / 2 + 0.003, 0.107, 0.052, 0.025);
      if (spec.wing) box(model, plate, side * 0.20, 0.455, -spec.length * 0.405, 0.047, 0.128, 0.07);
    }
    if (spec.wing) box(model, livery, 0, 0.525, -spec.length * 0.41, 0.74, 0.045, 0.18);
    return model;
  });

  const radius = 12.1;
  const walls = [
    [0, -radius, 0], [-radius, 0, Math.PI / 2],
    [0, radius, Math.PI], [radius, 0, -Math.PI / 2],
  ];
  walls.forEach(([x, z, yaw], wallIndex) => {
    const wall = new THREE.Group();
    wall.position.set(x, 0, z);
    wall.rotation.y = yaw;
    room.add(wall);
    box(wall, plaster, 0, 3.45, -0.2, radius * 2 + 0.4, 7.5, 0.4);
    box(wall, walnut, 0, 0.28, 0.1, radius * 2 + 0.3, 0.56, 0.2);
    box(wall, walnut, 0, 5.86, 0.15, radius * 2 + 0.3, 0.26, 0.3);
    for (const pilaster of [-10.40, -3.33, 3.33, 10.40]) {
      box(wall, walnut, pilaster, 3.02, 0.19, 0.25, 5.59, 0.38);
      box(wall, bronze, pilaster, 2.87, 0.39, 0.040, 4.76, 0.021);
    }

    [-6.70, 0, 6.70].forEach((center, cabinetIndex) => {
      const cabinet = new THREE.Group();
      cabinet.position.x = center;
      wall.add(cabinet);
      box(cabinet, walnut, 0, 0.39, 0.84, displayWidth, 0.78, 1.7);
      box(cabinet, walnut, 0, 4.96, 0.84, displayWidth, 0.52, 1.7);
      box(cabinet, shelf, 0, 4.77, 1.73, displayWidth + 0.12, 0.095, 0.16);
      box(cabinet, bronze, 0, 5.11, 1.70, displayWidth, 0.031, 0.06);
      for (const side of [-1, 1]) {
        box(cabinet, walnut, side * (displayWidth / 2 - 0.095), 2.75, 0.84, 0.19, 3.98, 1.7);
        box(cabinet, bronze, side * (displayWidth / 2 - 0.18), 2.75, 1.72, 0.032, 4, 0.035);
      }
      box(cabinet, bronze, 0, 2.75, 1.73, 0.035, 3.96, 0.045);
      for (const side of [-1, 1]) box(cabinet, bronze, side * 0.11, 2.56, 1.75, 0.043, 0.23, 0.059);

      shelves.forEach((y, shelfIndex) => {
        const upper = y + 1.27;
        box(cabinet, shelf, 0, y - 0.061, 0.87, displayWidth - 0.16, 0.12, 1.67);
        box(cabinet, bronze, 0, y - 0.075, 1.715, displayWidth - 0.18, 0.036, 0.047);
        box(cabinet, lamp, 0, upper - 0.11, 1.54, displayWidth - 0.45, 0.027, 0.079);
        mesh(cabinet, backing, panel, 0, y + 0.60, 0.017, displayWidth - 0.19, 1.26);

        for (let slot = 0; slot < 3; slot++) {
          const car = models[(wallIndex * 2 + cabinetIndex + shelfIndex * 3 + slot) % models.length].clone();
          const displayX = (slot - 1) * 1.89;
          car.position.set(displayX, y + 0.058, 0.84);
          car.rotation.y = (slot === 1 ? -1 : 1) * (1.17 + 0.14 * ((shelfIndex + slot) % 3));
          cabinet.add(car);
          box(cabinet, plate, displayX, y + 0.027, 0.85, 1.67, 0.054, 1.13);
          box(cabinet, ivory, displayX, y + 0.046, 1.56, 0.26, 0.066, 0.025);
        }
      });
      mesh(cabinet, glass, panel, 0, 2.75, 1.702, displayWidth - 0.20, 3.93);
      mesh(cabinet, reflections, panel, 0, 2.75, 1.704, displayWidth - 0.20, 3.93);
    });

    const highlight = new THREE.PointLight(0xffdfbe, 42, 8.4, 2);
    highlight.position.set(0, 5.48, 3.56);
    wall.add(highlight);
  });

  box(room, walnut, 0, -0.14, 0, radius * 2 + 0.4, 0.26, radius * 2 + 0.4);
  box(room, plaster, 0, 7.15, 0, radius * 2 + 0.4, 0.20, radius * 2 + 0.4);
  for (const x of [-6.3, 0, 6.3]) box(room, lamp, x, 7.01, 0, 0.26, 0.066, 13.7);
  instanceStatic(room);
  return room;
}

export function buildCollectorBackdrop(renderer: THREE.WebGLRenderer): THREE.Texture {
  const existing = panoramas.get(renderer);
  if (existing) return existing.texture;

  const hdr = renderer.extensions.has('EXT_color_buffer_float');
  const resolution = Math.min(hdr ? 640 : 512, renderer.capabilities.maxCubemapSize);
  const target = new THREE.WebGLCubeRenderTarget(resolution, {
    type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
    colorSpace: THREE.LinearSRGBColorSpace,
    minFilter: THREE.LinearMipmapLinearFilter,
    generateMipmaps: true,
  });
  target.texture.name = 'Vidriera de colección';
  const scene = new THREE.Scene();
  const room = caseRoom(hdr);
  const fill = new THREE.DirectionalLight(0xe1e9ff, 0.63);
  fill.position.set(-1.2, 5, 1.6);
  scene.add(room, fill, new THREE.HemisphereLight(0xffe8d2, 0x8b6f65, 1.72));
  const camera = new THREE.CubeCamera(0.10, 32, target);
  camera.position.y = 2.09;

  const autoClear = renderer.autoClear;
  const renderTarget = renderer.getRenderTarget();
  const face = renderer.getActiveCubeFace();
  const mip = renderer.getActiveMipmapLevel();
  const xr = renderer.xr.enabled;
  const pmrem = new THREE.PMREMGenerator(renderer);
  try {
    renderer.autoClear = true;
    // Offscreen rendering keeps the linear values above 1 from the light strips.
    camera.update(renderer, scene);
    const filtered = pmrem.fromCubemap(target.texture);
    panoramas.set(renderer, filtered);
    return filtered.texture;
  } finally {
    renderer.autoClear = autoClear;
    renderer.setRenderTarget(renderTarget, face, mip);
    renderer.xr.enabled = xr;
    pmrem.dispose();
    target.dispose();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    room.traverse(object => {
      if (object instanceof THREE.InstancedMesh) object.dispose();
      if (object instanceof THREE.Mesh && !Array.isArray(object.material)) {
        geometries.add(object.geometry);
        materials.add(object.material);
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) {
      if (material instanceof THREE.MeshBasicMaterial) material.map?.dispose();
      material.dispose();
    }
  }
}
