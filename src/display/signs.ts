import * as THREE from 'three';
import qrcode from 'qrcode-generator';
import { CAR_SPECS, type RaceSnapshot } from '../shared/protocol';
import { TRACK, WALL_HALF } from '../shared/track';
import { BENCH_SURFACE, box, canvas2d, flatSign, horizontalShadow, random, standard, texture } from './materials';

const steel = standard(0x75736b, 0.44, 0.56);
const frame = standard(0x353531, 0.70, 0.29);
const foot = standard(0x5d5347, 0.79, 0.17);

function caseGeometry(width: number, height: number, depth: number, radius: number, bevel: number) {
  const x = width / 2;
  const y = height / 2;
  const outline = new THREE.Shape();
  outline.moveTo(-x + radius, -y);
  outline.lineTo(x - radius, -y);
  outline.quadraticCurveTo(x, -y, x, -y + radius);
  outline.lineTo(x, y - radius);
  outline.quadraticCurveTo(x, y, x - radius, y);
  outline.lineTo(-x + radius, y);
  outline.quadraticCurveTo(-x, y, -x, y - radius);
  outline.lineTo(-x, -y + radius);
  outline.quadraticCurveTo(-x, -y, -x + radius, -y);
  return new THREE.ExtrudeGeometry(outline, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 5 });
}

function addScrews(parent: THREE.Object3D, width: number, height: number, z: number, radius: number, cross = false) {
  const geometry = new THREE.CylinderGeometry(radius, radius * 1.06, radius * 0.39, 12);
  geometry.rotateX(Math.PI / 2);
  for (const x of [-width / 2, width / 2]) {
    for (const y of [-height / 2, height / 2]) {
      const screw = new THREE.Mesh(geometry, steel);
      screw.position.set(x, y, z);
      parent.add(screw);
      const angle = x * y * 1.5;
      box(parent, frame, x, y, z + radius * 0.25, radius * 1.33, radius * 0.27, radius * 0.15, false).rotation.z = angle;
      if (cross) box(parent, frame, x, y, z + radius * 0.25, radius * 1.18, radius * 0.25, radius * 0.15, false)
        .rotation.z = angle + Math.PI / 2;
    }
  }
}

function raceBoard(parent: THREE.Object3D) {
  const base = new THREE.Group();
  base.position.set(-10.55, -0.23, 4.45);
  base.scale.setScalar(0.53);
  parent.add(base);
  const display = new THREE.Group();
  display.position.set(0, 1.61, 0);
  display.rotation.x = -0.44;
  base.add(display);
  for (const side of [-1, 1]) {
    box(base, foot, side * 2.26, 0.085, 0.22, 0.86, 0.17, 1.63);
    box(base, steel, side * 2.26, 0.61, 0.04, 0.21, 1.23, 0.21);
  }
  const housing = new THREE.Mesh(caseGeometry(7.22, 2.78, 0.21, 0.17, 0.075), frame);
  housing.position.z = -0.18;
  housing.castShadow = true;
  display.add(housing);
  const { canvas, context } = canvas2d(1024, 365);
  const { panel, map } = flatSign(canvas, 6.64, 2.35);
  panel.position.z = 0.108;
  display.add(panel);
  addScrews(display, 6.99, 2.51, 0.113, 0.077);

  const background = context.createLinearGradient(0, 0, 1024, 365);
  background.addColorStop(0, '#262825');
  background.addColorStop(1, '#161b19');
  let previous = '';

  return (state: RaceSnapshot) => {
    const leader = state.order[0] ?? 0;
    const lap = Math.min(3, Math.max(0, state.cars[leader]?.lap ?? 0));
    const key = `${state.phase}:${lap}:${state.phase === 'results' ? state.order.join() : leader}`;
    if (key === previous) return;
    previous = key;

    context.fillStyle = background;
    context.fillRect(0, 0, 1024, 365);
    context.strokeStyle = '#71614b';
    context.lineWidth = 2;
    context.strokeRect(8, 8, 1008, 349);
    context.fillStyle = '#d5b390';
    context.font = 'bold 31px ui-monospace, monospace';
    context.fillText('TALLER 07   /   MESA DE CARRERA', 32, 57);
    context.strokeStyle = '#6f5946';
    context.beginPath();
    context.moveTo(32, 78);
    context.lineTo(991, 78);
    context.stroke();

    if (state.phase === 'results') {
      context.fillStyle = '#f0e0c3';
      context.font = '900 62px system-ui, sans-serif';
      context.fillText('LLEGADA', 34, 164);
      state.order.forEach((slot, position) => {
        const spec = CAR_SPECS[slot];
        if (!spec) return;
        const x = 35 + (position % 2) * 490;
        const y = 189 + Math.floor(position / 2) * 73;
        context.fillStyle = '#323330';
        context.fillRect(x, y, 452, 61);
        context.fillStyle = '#c5b69d';
        context.font = '700 35px ui-monospace, monospace';
        context.fillText(`${position + 1}º`, x + 17, y + 44);
        context.fillStyle = spec.color;
        context.fillRect(x + 109, y + 10, 104, 42);
        context.fillStyle = '#202421';
        context.font = '900 38px system-ui, sans-serif';
        context.fillText(spec.number, x + 134, y + 43);
        context.fillStyle = '#e4d8be';
        context.font = '700 29px system-ui, sans-serif';
        context.fillText(spec.name, x + 230, y + 41);
      });
    } else {
      const headline = state.phase === 'grid' ? 'PARRILLA' : state.phase === 'demo' ? 'EXHIBICIÓN' : 'VUELTAS';
      context.fillStyle = '#e5cda7';
      context.font = 'bold 40px ui-monospace, monospace';
      context.fillText(headline, 38, 142);
      context.font = '900 155px ui-monospace, monospace';
      context.fillStyle = '#f0e0c3';
      context.fillText(`${lap} / 3`, 35, 298);
      context.fillStyle = '#c7b192';
      context.font = 'bold 33px ui-monospace, monospace';
      context.fillText('LÍDER', 755, 156);
      context.fillStyle = CAR_SPECS[leader].color;
      context.fillRect(748, 181, 222, 112);
      context.fillStyle = '#242726';
      context.font = '900 94px system-ui, sans-serif';
      context.fillText(CAR_SPECS[leader].number, 796, 270);
    }
    map.needsUpdate = true;
  };
}

function startingLights(parent: THREE.Object3D) {
  const start = TRACK.sampleAt(-1.75);
  const base = new THREE.Group();
  base.position.set(start.x + start.dz * (WALL_HALF + 0.44), -0.23, start.z - start.dx * (WALL_HALF + 0.44));
  base.scale.setScalar(0.85);
  parent.add(base);
  box(base, foot, 0, 0.09, 0, 1.24, 0.18, 0.67);
  box(base, steel, -0.46, 0.96, 0, 0.12, 1.78, 0.12);
  box(base, steel, 0.46, 0.96, 0, 0.12, 1.78, 0.12);
  const body = new THREE.Mesh(caseGeometry(1.68, 0.69, 0.29, 0.10, 0.04), frame);
  body.position.set(0, 1.79, -0.14);
  body.castShadow = true;
  base.add(body);
  const socket = new THREE.CylinderGeometry(0.236, 0.236, 0.09, 16);
  const lens = new THREE.SphereGeometry(0.174, 20, 12);
  const off = new THREE.MeshStandardMaterial({ color: 0x4f251d, roughness: 0.45, metalness: 0.14 });
  const on = new THREE.MeshBasicMaterial({ color: 0xff4e2d, toneMapped: false });
  const bulbs = [-0.52, 0, 0.52].map(x => {
    const rim = new THREE.Mesh(socket, foot);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(x, 1.79, 0.194);
    const lamp = new THREE.Mesh<THREE.SphereGeometry, THREE.Material>(lens, off);
    lamp.position.set(x, 1.79, 0.231);
    lamp.scale.z = 0.42;
    base.add(rim, lamp);
    return lamp;
  });
  return (count: number) => {
    bulbs.forEach((lamp, i) => { lamp.material = i < count ? on : off; });
  };
}

function flagStand(parent: THREE.Object3D) {
  const start = TRACK.sampleAt(0.66);
  const post = new THREE.Group();
  post.position.set(start.x + start.dz * (WALL_HALF + 0.62), -0.23, start.z - start.dx * (WALL_HALF + 0.62));
  post.scale.setScalar(0.88);
  parent.add(post);
  box(post, foot, 0, 0.09, 0, 0.53, 0.18, 0.49);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 2.65, 10), steel);
  pole.position.y = 1.35;
  pole.castShadow = true;
  post.add(pole);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), steel);
  cap.position.y = 2.68;
  post.add(cap);
  const { canvas, context } = canvas2d(192, 128);
  for (let column = 0; column < 6; column++) {
    for (let row = 0; row < 4; row++) {
      context.fillStyle = (column + row) % 2 ? '#272827' : '#f4e7cc';
      context.fillRect(column * 32, row * 32, 32, 32);
    }
  }
  const geometry = new THREE.PlaneGeometry(1.81, 1.19, 12, 6);
  geometry.translate(0.94, 1.99, 0);
  const original = geometry.getAttribute('position').clone();
  const cloth = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: texture(canvas), roughness: 0.92, side: THREE.DoubleSide }));
  cloth.castShadow = true;
  post.add(cloth);
  let lastVisible: boolean | undefined;
  return (visible: boolean, elapsed: number) => {
    if (!visible && lastVisible === visible) return;
    lastVisible = visible;
    const vertices = geometry.getAttribute('position');
    for (let i = 0; i < original.count; i++) {
      const x = original.getX(i);
      const strength = x / 1.85;
      const fall = visible ? -0.025 * strength : -0.30 * strength;
      const wave = visible ? Math.sin(x * 4.4 - elapsed * 8) * strength * 0.20 : Math.sin(x * 11) * strength * 0.09;
      vertices.setXYZ(i, visible ? x : x * 0.28, original.getY(i) + fall, wave);
    }
    vertices.needsUpdate = true;
    geometry.computeVertexNormals();
  };
}

export function buildRaceSigns(parent: THREE.Object3D) {
  const board = raceBoard(parent);
  const lights = startingLights(parent);
  const flag = flagStand(parent);
  return { board, lights, flag };
}

export function placardLayout(width: number, height: number, maxSize = 210) {
  const size = Math.round(Math.min(maxSize, Math.max(94, height * 0.173), width * 0.40, height * 0.32));
  const margin = Math.max(12, Math.min(width, height) * 0.023);
  const x = width - margin - size * 0.60;
  const y = height - margin - Math.min(28, height * 0.029) - size * 0.64;
  return { size, x, y, left: x - size * 0.60, top: y - size * 0.572 };
}

export function buildPlacard(parent: THREE.Object3D, enabled = true) {
  const plaque = new THREE.Group();
  plaque.visible = enabled;
  parent.add(plaque);
  const { canvas: metalCanvas, context: metalPaint } = canvas2d(192, 192);
  const rng = random(705);
  const grain = metalPaint.createImageData(192, 192);
  for (let i = 0; i < grain.data.length; i += 4) {
    const shade = 174 + rng() * 52;
    grain.data[i] = grain.data[i + 1] = grain.data[i + 2] = shade;
    grain.data[i + 3] = 255;
  }
  metalPaint.putImageData(grain, 0, 0);
  const metal = texture(metalCanvas);
  metal.wrapS = metal.wrapT = THREE.RepeatWrapping;
  const cast = new THREE.MeshStandardMaterial({ color: 0x635a50, map: metal, roughness: 0.67, metalness: 0.38 });
  const casing = new THREE.Mesh(caseGeometry(1.137, 1.153, 0.155, 0.079, 0.029), cast);
  casing.position.set(0, -0.036, -0.163);
  plaque.add(casing);
  const rim = new THREE.Mesh(caseGeometry(1.119, 1.133, 0.020, 0.065, 0.009), standard(0x3d3833, 0.49, 0.45));
  rim.position.set(0, -0.036, 0.017);
  plaque.add(rim);
  const gasket = new THREE.Mesh(caseGeometry(1.036, 1.033, 0.012, 0.021, 0.007), standard(0x777068, 0.86));
  gasket.position.set(0, 0.041, 0.035);
  plaque.add(gasket);
  const square = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xeee6d3, toneMapped: false, fog: false }));
  square.position.set(0, 0.042, 0.056);
  plaque.add(square);
  addScrews(plaque, 1.088, 1.102, 0.048, 0.031, true);
  box(plaque, foot, 0, -0.613, -0.103, 1.03, 0.061, 0.37, false);
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), horizontalShadow());
  contact.visible = enabled;
  contact.rotation.x = -Math.PI / 2;
  parent.add(contact);
  const bottomRay = new THREE.Vector3();
  const support = new THREE.Vector3();

  const label = canvas2d(512, 59);
  label.context.fillStyle = '#2e2d2a';
  label.context.fillRect(0, 0, 512, 59);
  label.context.fillStyle = '#e0c7a1';
  label.context.font = 'bold 34px system-ui, sans-serif';
  label.context.textAlign = 'center';
  label.context.fillText('ESCANEÁ PARA CORRER', 256, 41);
  const { panel } = flatSign(label.canvas, 0.95, 0.092);
  panel.position.set(0, -0.539, 0.047);
  panel.visible = false;
  plaque.add(panel);

  let encoded = '';
  return {
    object: plaque,
    setGrounded(grounded: boolean) { contact.visible = enabled && grounded; },
    setUrl(url: string) {
      if (url === encoded) return;
      const code = qrcode(0, 'M');
      code.addData(url);
      code.make();
      const modules = code.getModuleCount();
      const cell = 8;
      const size = (modules + 8) * cell;
      const { canvas, context } = canvas2d(size, size);
      context.fillStyle = '#fff';
      context.fillRect(0, 0, size, size);
      context.fillStyle = '#000';
      for (let row = 0; row < modules; row++) {
        for (let column = 0; column < modules; column++) {
          if (code.isDark(row, column)) context.fillRect((column + 4) * cell, (row + 4) * cell, cell, cell);
        }
      }
      const map = texture(canvas);
      map.anisotropy = 1;
      map.generateMipmaps = false;
      map.magFilter = map.minFilter = THREE.NearestFilter;
      square.material.map?.dispose();
      square.material.map = map;
      square.material.color.set(0xffffff);
      square.material.needsUpdate = true;
      panel.visible = true;
      encoded = url;
    },
    resize(camera: THREE.PerspectiveCamera, width: number, height: number, surface = BENCH_SURFACE, maxSize = 210) {
      const { x, y, size } = placardLayout(width, height, maxSize);
      bottomRay.set(x * 2 / width - 1, 1 - 2 * (y + size * 0.635) / height, 0.5)
        .unproject(camera).sub(camera.position);
      support.copy(camera.position).addScaledVector(bottomRay, (surface + 0.025 - camera.position.y) / bottomRay.y);
      contact.position.copy(support);
      const distance = -support.applyMatrix4(camera.matrixWorldInverse).z;
      const scale = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / height;
      plaque.position.set((x - width / 2) * scale, (height / 2 - y) * scale, -distance)
        .applyMatrix4(camera.matrixWorld);
      plaque.quaternion.copy(camera.quaternion);
      plaque.scale.setScalar(scale * size);
      contact.scale.set(1.4 * scale * size, 0.63 * scale * size, 1);
      contact.rotation.z = -camera.rotation.z;
    },
  };
}
