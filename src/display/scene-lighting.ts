import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { TRACK, WALL_HALF } from '../shared/track';
import { BENCH_SURFACE } from './materials';

function panelFalloff() {
  const width = 128;
  const height = 64;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const v = (y + 0.5) / height;
    const vertical = THREE.MathUtils.smoothstep(Math.min(v, 1 - v), 0, 0.23);
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;
      const horizontal = THREE.MathUtils.smoothstep(Math.min(u, 1 - u), 0, 0.14);
      const i = (y * width + x) * 4;
      const light = Math.round(255 * horizontal * vertical * (0.91 + 0.09 * (1 - u)));
      data[i] = data[i + 1] = data[i + 2] = light;
      data[i + 3] = 255;
    }
  }
  const map = new THREE.DataTexture(data, width, height);
  map.minFilter = map.magFilter = THREE.LinearFilter;
  map.needsUpdate = true;
  return map;
}

function prefilterWorkshop(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
  const room = new RoomEnvironment();
  room.traverse(object => {
    if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshLambertMaterial
      && object.material.emissiveIntensity > 1) {
      object.material.emissiveIntensity *= 0.38;
      object.material.emissive.setHex(object.position.x > 5 ? 0xd7e5ff : 0xffdbb7);
    }
    if (object instanceof THREE.PointLight) {
      object.intensity *= 0.76;
      object.color.setHex(0xffe3c8);
    }
  });
  const softEdge = panelFalloff();
  const reflectors = [
    [-9.2, 10.6, 6.8, 14.6, 2.8, 0xffcf9e, 8.4],
    [9.4, 7.2, -7.5, 9.2, 3.5, 0xd8e8ff, 4.6],
    [-4.8, 6.2, -12.5, 3.4, 4.8, 0xffab67, 5.1],
    [5.5, 11.8, 10.7, 5.2, 2.3, 0xffe7cd, 3.8],
  ];
  for (const [x, y, z, width, height, tint, intensity] of reflectors) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({
      color: new THREE.Color(tint).multiplyScalar(intensity), map: softEdge, toneMapped: false,
    }));
    panel.position.set(x, y, z);
    panel.lookAt(0, 0, 0);
    room.add(panel);
  }

  const pmrem = new THREE.PMREMGenerator(renderer);
  try {
    // The static probe is filtered once. Moving objects keep the direct lights and shadows.
    scene.environment = pmrem.fromScene(room, 0.021).texture;
  } finally {
    pmrem.dispose();
    softEdge.dispose();
    room.dispose();
  }
}

function shadowPoints() {
  const bounds = TRACK.samples.flatMap(p => [-1, 1].flatMap(side => {
    const offset = side * (WALL_HALF + 1.47);
    const x = p.x - p.dz * offset;
    const z = p.z + p.dx * offset;
    return [new THREE.Vector3(x, BENCH_SURFACE, z), new THREE.Vector3(x, p.y + 1.3, z)];
  }));
  // Include the parts of the bench and the taller tools that can cast back over the course.
  for (const x of [-31, 32]) {
    for (const z of [-19, 17.7]) bounds.push(new THREE.Vector3(x, BENCH_SURFACE, z));
  }
  bounds.push(new THREE.Vector3(-29, 6.5, -17), new THREE.Vector3(31, 7.6, -17));
  return bounds;
}

function fitShadow(key: THREE.DirectionalLight, points: readonly THREE.Vector3[], close: boolean) {
  const view = new THREE.Matrix4().lookAt(key.position, key.target.position, key.up).setPosition(key.position).invert();
  const bounds = new THREE.Box3();
  const sample = new THREE.Vector3();
  for (const p of points) bounds.expandByPoint(sample.copy(p).applyMatrix4(view));

  const camera = key.shadow.camera;
  const margin = close ? 1.45 : 1.85;
  camera.left = bounds.min.x - margin;
  camera.right = bounds.max.x + margin;
  camera.bottom = bounds.min.y - margin;
  camera.top = bounds.max.y + margin;
  camera.near = Math.max(0.3, -bounds.max.z - 5.5);
  camera.far = -bounds.min.z + 6.0;
  camera.updateProjectionMatrix();
  key.shadow.radius = close ? 2.3 : 2.85;
  key.shadow.normalBias = close ? 0.009 : 0.013;
  key.shadow.bias = -0.000045;
  key.shadow.intensity = close ? 0.98 : 0.94;
  key.shadow.needsUpdate = true;
}

export function buildSceneLighting(scene: THREE.Scene, renderer: THREE.WebGLRenderer, lowQuality: boolean) {
  if (!lowQuality) prefilterWorkshop(scene, renderer);

  const key = new THREE.DirectionalLight();
  key.castShadow = !lowQuality;
  key.shadow.mapSize.set(2048, 2048);
  const fill = new THREE.DirectionalLight(0xe1eaff);
  const bounce = new THREE.HemisphereLight(0xffe9d7, 0x4d4d54);

  const benchLight = new THREE.SpotLight(0xffbc83, 277, 34, 0.69, 0.84, 2);
  benchLight.position.set(-6.9, 10.7, 17.4);
  benchLight.target.position.set(-1.7, BENCH_SURFACE, 14.8);
  const toolLight = new THREE.SpotLight(0xffbc7d, 254, 38, 0.92, 0.86, 2);
  toolLight.position.set(0.7, 12.2, -14.4);
  toolLight.target.position.set(-4.9, BENCH_SURFACE, -16.7);
  scene.add(key, key.target, fill, bounce, benchLight, benchLight.target, toolLight, toolLight.target);
  const points = shadowPoints();
  let current: boolean | undefined;

  function lightShot(close: boolean) {
    if (current === close) return;
    current = close;
    // A single shadow-casting key is shared by all views of a given frame.
    key.position.set(close ? -19.1 : -17.7, close ? 16.7 : 24.8, close ? 13.0 : -8.2);
    key.color.setHex(close ? 0xffd1a4 : 0xffd8b9);
    key.intensity = close ? 3.10 : 2.94;
    fill.position.set(20.8, 11.5, close ? -7.2 : 13.7);
    fill.intensity = close ? 0.49 : 0.66;
    bounce.intensity = close ? 0.23 : 0.42;
    scene.environmentIntensity = close ? 0.42 : 0.38;
    renderer.toneMappingExposure = close ? 1.015 : 1.075;
    if (!lowQuality) fitShadow(key, points, close);
  }
  lightShot(false);
  return { lightShot };
}
