import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { TALLER, type Course } from '../shared/courses';
import { BENCH_SURFACE } from './materials';
import { sceneryLights } from './render-layers';
import { spaceportEnvironment } from './spaceport-surfaces';
import { SPACEPORT_BUILDINGS } from './spaceport-campus-layout';

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

function prefilterWorkshop(renderer: THREE.WebGLRenderer) {
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
    return pmrem.fromScene(room, 0.021);
  } finally {
    pmrem.dispose();
    softEdge.dispose();
    room.dispose();
  }
}

function shadowPoints(course: Course) {
  const bounds = course.samples.flatMap(p => [-1, 1].flatMap(side => {
    const offset = side * (course.wallHalfAt(p.s, side) + 1.47);
    const x = p.x - p.dz * offset;
    const z = p.z + p.dx * offset;
    return [new THREE.Vector3(x, BENCH_SURFACE, z), new THREE.Vector3(x, p.y + 1.3, z)];
  }));
  if (course.id === 'spaceport') {
    bounds.push(new THREE.Vector3(42, 57, -183), new THREE.Vector3(26, 52, -184));
    for (const site of SPACEPORT_BUILDINGS) for (const x of [-1, 1]) for (const z of [-1, 1]) {
      bounds.push(new THREE.Vector3(site.x + x * (site.width / 2 + 1), site.height + 2, site.z + z * (site.depth / 2 + 1)));
    }
  }
  if (course.id !== 'taller') return bounds;
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
  let environment: THREE.WebGLRenderTarget | undefined;
  let outdoorEnvironment: THREE.WebGLRenderTarget | undefined;
  let spaceport = false;
  function restoreReflections() {
    if (lowQuality) return;
    const next = prefilterWorkshop(renderer);
    environment?.dispose();
    environment = next;
    outdoorEnvironment?.dispose(); outdoorEnvironment = undefined;
    selectReflections();
  }
  function selectReflections() {
    if (lowQuality) return;
    if (spaceport) outdoorEnvironment ??= spaceportEnvironment(renderer);
    scene.environment = (spaceport ? outdoorEnvironment : environment)?.texture ?? null;
  }
  restoreReflections();

  const key = new THREE.DirectionalLight();
  key.castShadow = !lowQuality;
  key.shadow.mapSize.set(2048, 2048);
  const fill = new THREE.DirectionalLight(0xe1eaff);
  const bounce = new THREE.HemisphereLight(0xffe9d7, 0x4d4d54);

  const benchLight = new THREE.SpotLight(0xffbc83, 277, 34, 0.69, 0.84, 2);
  benchLight.layers.set(sceneryLights);
  benchLight.position.set(-6.9, 10.7, 17.4);
  benchLight.target.position.set(-1.7, BENCH_SURFACE, 14.8);
  const toolLight = new THREE.SpotLight(0xffbc7d, 254, 38, 0.92, 0.86, 2);
  toolLight.layers.set(sceneryLights);
  toolLight.position.set(0.7, 12.2, -14.4);
  toolLight.target.position.set(-4.9, BENCH_SURFACE, -16.7);
  scene.add(key, key.target, fill, fill.target, bounce, benchLight, benchLight.target, toolLight, toolLight.target);
  let points = shadowPoints(TALLER);
  const lightCenter = new THREE.Vector3();
  let dique = false;
  const trackLamps: { light: THREE.SpotLight; day: number }[] = [];
  const diffusers = new Set<THREE.MeshStandardMaterial>();
  const halos = new Set<THREE.SpriteMaterial>();
  let finish: THREE.SpotLight | undefined;
  scene.traverse(object => {
    if (object instanceof THREE.SpotLight && object.name === 'Foco de pista') {
      if (object.userData.secondary) object.layers.set(sceneryLights);
      trackLamps.push({ light: object, day: object.intensity });
      if (object.userData.finishFloodlight) finish = object;
    } else if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial
      && object.material.name === 'Difusor de foco de pista') {
      diffusers.add(object.material);
    } else if (object instanceof THREE.Sprite && object.material.name === 'Halo de foco de pista') {
      halos.add(object.material);
    }
  });
  const dayBackground = scene.background;
  const dayBackgroundIntensity = scene.backgroundIntensity;
  const nightBackground = new THREE.Color(0x101521);
  const harborSky = new THREE.Color(0x3c5061);
  const harborNight = new THREE.Color(0x122235);
  let close = false;
  let night = false;

  function applyLighting() {
    // A single shadow-casting key is shared by all views of a given frame.
    if (night) key.position.set(-12.0, 24.0, -17.0);
    else key.position.set(close ? -19.1 : -17.7, close ? 16.7 : 24.8, close ? 13.0 : -8.2);
    if (dique) key.position.set(night ? -28 : -31, close ? 24 : 29, close ? 23 : 29).multiplyScalar(5.2);
    key.position.add(lightCenter);
    key.target.position.copy(lightCenter);
    key.color.setHex(dique ? (night ? 0xb7d0f2 : 0xffe0c3) : (night ? 0x9bb7e9 : close ? 0xffd1a4 : 0xffd8b9));
    key.intensity = dique ? (night ? 1.48 : close ? 2.52 : 2.34) : (night ? 0.78 : close ? 3.10 : 2.94);
    fill.position.set(20.8, 11.5, close ? -7.2 : 13.7).add(lightCenter);
    fill.target.position.copy(lightCenter);
    fill.color.setHex(dique ? (night ? 0x93b8ee : 0xb6d4f9) : (night ? 0x819ed4 : 0xe1eaff));
    fill.intensity = dique ? (night ? 0.45 : 0.67) : (night ? 0.28 : close ? 0.49 : 0.66);
    bounce.color.setHex(dique ? (night ? 0xb3cfed : 0xc5d9ed) : night ? 0x94acd3 : 0xffe9d7);
    bounce.groundColor.setHex(dique ? (night ? 0x536272 : 0x8a7768) : (night ? 0x5a4045 : 0x4d4d54));
    bounce.intensity = dique ? (night ? 0.56 : 0.52) : (night ? 0.24 : close ? 0.23 : 0.42);
    benchLight.intensity = night ? 187 : 277;
    toolLight.intensity = night ? 164 : 254;
    for (const { light, day } of trackLamps) light.intensity = day * (night ? 3.8 : 1);
    if (finish && night) finish.intensity *= 1.30;
    for (const material of diffusers) material.emissiveIntensity = night ? 3.65 : 2.18;
    for (const material of halos) material.opacity = night ? 0.95 : 0.59;
    scene.environmentRotation.y = dique ? 0.54 : 0;
    scene.environmentIntensity = dique ? (night ? 0.45 : 0.49) : (night ? 0.19 : close ? 0.42 : 0.38);
    renderer.toneMappingExposure = dique ? (night ? 1.12 : 1.06) : (night ? 1.01 : close ? 1.015 : 1.075);
    scene.background = dique ? (night ? harborNight : harborSky) : (night ? nightBackground : dayBackground);
    if (spaceport) {
      key.color.setHex(night ? 0xb3cce8 : 0xffe9ca);
      key.intensity = night ? 1.35 : 2.6;
      fill.intensity = night ? .58 : .75;
      bounce.intensity = night ? .64 : .66;
      scene.environmentIntensity = night ? .42 : .56;
      scene.environmentRotation.y = 0;
      scene.background = night ? harborNight : harborSky;
    }
    scene.backgroundIntensity = dayBackgroundIntensity * (night ? 0.64 : 1);
    if (!lowQuality) {
      fitShadow(key, points, close);
      if (night) key.shadow.intensity = dique ? 0.74 : 0.62;
    }
  }
  applyLighting();
  return {
    restoreReflections,
    setCourse(course: Course) {
      dique = course.id !== 'taller';
      spaceport = course.id === 'spaceport';
      selectReflections();
      points = shadowPoints(course);
      lightCenter.set(0, 0, 0);
      if (dique) new THREE.Box3().setFromPoints(points).getCenter(lightCenter);
      benchLight.visible = toolLight.visible = !dique;
      applyLighting();
    },
    lightShot(next: boolean) {
      if (close === next) return;
      close = next;
      applyLighting();
    },
    setNight(enabled: boolean) {
      if (night === enabled) return;
      night = enabled;
      applyLighting();
    },
  };
}
