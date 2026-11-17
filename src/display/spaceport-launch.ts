import * as THREE from 'three';
import { createLaunchSequence, LAUNCH_SITE } from './spaceport-launch-state.ts';

function vaporMap() {
  const size = 64, pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + .5) / size * 2 - 1, v = (y + .5) / size * 2 - 1;
    const edge = Math.max(0, 1 - Math.hypot(u, v));
    const billow = .78 + .13 * Math.sin(u * 13 + Math.sin(v * 7)) + .09 * Math.cos(v * 16 - u * 8);
    const i = (y * size + x) * 4;
    pixels[i] = pixels[i + 1] = pixels[i + 2] = 255;
    pixels[i + 3] = Math.round(edge ** .85 * billow * 235);
  }
  const map = new THREE.DataTexture(pixels, size, size); map.needsUpdate = true;
  map.magFilter = map.minFilter = THREE.LinearFilter; return map;
}

/** Bounded, reversible visual effects. No gameplay forces or camera shake. */
export function buildSpaceportLaunch(parent: THREE.Group, rocket: THREE.Group, arms: THREE.Group[]) {
  const group = new THREE.Group(); group.name = 'Spaceport · predespegue por proximidad'; parent.add(group);
  const sequence = createLaunchSequence(), { x, z } = LAUNCH_SITE;
  const map = vaporMap(), identity = new THREE.Quaternion(), position = new THREE.Vector3(), scale = new THREE.Vector3();
  const matrix = new THREE.Matrix4(), tint = new THREE.Color();
  const capacity = 84, alpha = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
  alpha.setUsage(THREE.DynamicDrawUsage);
  const geometry = new THREE.PlaneGeometry(1, 1); geometry.setAttribute('instanceAlpha', alpha);
  const vaporMaterial = new THREE.MeshBasicMaterial({ map, color: 0xffffff, transparent: true, opacity: .94,
    depthWrite: false, fog: false, toneMapped: true });
  // Billboards use each rendering camera's view matrix, including split-screen.
  vaporMaterial.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute float instanceAlpha; varying float vaporAlpha;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
      vaporAlpha = instanceAlpha;
      vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0.,0.,0.,1.);
      mvPosition.xy += transformed.xy * vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));
      gl_Position = projectionMatrix * mvPosition;`);
    shader.fragmentShader = 'varying float vaporAlpha;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vaporAlpha;');
  };
  vaporMaterial.customProgramCacheKey = () => 'spaceport-vapor-billboard-v1';
  const vapor = new THREE.InstancedMesh(geometry, vaporMaterial, capacity);
  vapor.name = 'Venteo criogénico · 84 partículas reutilizadas'; vapor.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  vapor.boundingSphere = new THREE.Sphere(new THREE.Vector3(x, 25, z), 45); group.add(vapor);
  for (let i = 0; i < capacity; i++) {
    vapor.setMatrixAt(i, matrix.makeScale(0, 0, 0)); vapor.setColorAt(i, tint.setRGB(.8, .86, .89));
  }
  const flameMaterial = new THREE.MeshBasicMaterial({ color: 0xffb461, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const flames = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 12, 1, true), flameMaterial, 6);
  flames.name = 'Seis motores · prueba de encendido'; flames.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  flames.boundingSphere = new THREE.Sphere(new THREE.Vector3(x, 1, z), 5); group.add(flames);
  const nozzleMaterial = new THREE.MeshBasicMaterial({ color: 0xffd48b, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const nozzles = new THREE.InstancedMesh(new THREE.SphereGeometry(.36, 12, 6), nozzleMaterial, 6);
  nozzles.name = 'Bocas de motor incandescentes';
  for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3;
    nozzles.setMatrixAt(i, matrix.compose(position.set(x + Math.cos(angle) * 1.782, .37, z + Math.sin(angle) * 1.782), identity, scale.set(1, .40, 1)));
  }
  nozzles.computeBoundingSphere(); group.add(nozzles);
  const glowMaterial = new THREE.MeshBasicMaterial({ map, color: 0xff7025, transparent: true,
    blending: THREE.AdditiveBlending, opacity: 0, depthWrite: false, toneMapped: false });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(19, 19), glowMaterial);
  glow.rotation.x = -Math.PI / 2; glow.position.set(x, .237, z); glow.name = 'Reflejo cálido en plataforma'; group.add(glow);
  const warningMaterial = new THREE.MeshBasicMaterial({ color: 0xff9d42, toneMapped: false });
  const warnings = new THREE.InstancedMesh(new THREE.SphereGeometry(.20, 8, 5), warningMaterial, 8);
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    warnings.setMatrixAt(i, matrix.makeTranslation(x + Math.cos(angle) * 11.8, .52, z + Math.sin(angle) * 11.8));
  }
  warnings.name = 'Balizas de preparación'; warnings.computeBoundingSphere(); group.add(warnings);
  const engineLight = new THREE.PointLight(0xff9c51, 0, 38, 2);
  engineLight.position.set(x, 2.7, z); engineLight.name = 'Resplandor de encendido sin sombra'; group.add(engineLight);
  const upsideDown = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
  const origin = rocket.position.clone(); let night = false, detail = true;

  function update(now: number) {
    if (!Number.isFinite(now)) return;
    const state = sequence.update(now), t = now * .001;
    const vibration = state.ignition;
    rocket.position.set(origin.x + Math.sin(t * 29) * .018 * vibration, origin.y, origin.z + Math.sin(t * 37) * .014 * vibration);
    rocket.rotation.z = Math.sin(t * 31) * .0015 * vibration;
    rocket.rotation.x = Math.sin(t * 23) * .0010 * vibration;
    for (const [i, arm] of arms.entries()) arm.rotation.y = state.charge * (i ? -.27 : .30);
    warningMaterial.color.setRGB(1, .38, .08).multiplyScalar(.22 + state.warning * (1.0 + .55 * Math.sin(t * 5.2)));
    const pulse = .88 + .08 * Math.sin(t * 41) + .04 * Math.sin(t * 67);
    flameMaterial.opacity = state.ignition * .80; nozzleMaterial.opacity = state.ignition * .88;
    glowMaterial.opacity = state.ignition * (night ? .70 : .35) * pulse;
    engineLight.intensity = state.ignition * (night ? 220 : 125) * pulse;
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3, h = .24 + state.ignition * .30 * (pulse + Math.sin(t * 35 + i) * .07);
      flames.setMatrixAt(i, matrix.compose(position.set(x + Math.cos(angle) * 1.782, .58, z + Math.sin(angle) * 1.782),
        upsideDown, scale.set(.31, h, .31)));
    }
    flames.instanceMatrix.needsUpdate = true;
    vapor.count = detail ? capacity : capacity / 2;
    for (let i = 0; i < vapor.count; i++) {
      const ground = i % 3 === 0, stream = i % 4;
      const age = (t * (ground ? .16 : .21) + i * .61803398875) % 1;
      const theta = stream * Math.PI / 2 + .38;
      const drift = age * (ground ? 13 : 6), radius = 2.8 + drift;
      const y = ground ? 1.1 + age * 4.0 : (stream % 2 ? 32 : 16) + age * 8.5;
      const sx = (ground ? 3.2 + age * 9 : 2.1 + age * 6.0) * (.55 + state.vent * .45);
      position.set(x + Math.cos(theta) * radius + age * 2.0, y, z + Math.sin(theta) * radius + Math.sin(i + age * 4) * .65);
      vapor.setMatrixAt(i, matrix.compose(position, identity, scale.set(sx, sx * (ground ? .65 : .86), 1)));
      alpha.setX(i, Math.sin(age * Math.PI) ** 1.25 * state.vent * (ground ? .90 : .76));
    }
    vapor.instanceMatrix.needsUpdate = alpha.needsUpdate = true;
    group.userData.prelaunchCharge = state.charge;
  }
  update(0);
  return {
    observe: sequence.observe, update,
    setNight(value: boolean) {
      night = value; vaporMaterial.color.setHex(value ? 0xb8ccdc : 0xf3f1e9);
    },
    setDetail(value: boolean) { detail = value; },
  };
}
