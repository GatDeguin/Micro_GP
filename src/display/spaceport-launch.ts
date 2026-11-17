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

/** Reused effects follow the launch timeline, independently of split-screen cameras. */
export function buildSpaceportLaunch(parent: THREE.Group, rocket: THREE.Group, arms: THREE.Group[]) {
  const group = new THREE.Group(); group.name = 'Spaceport · despegue por proximidad'; parent.add(group);
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
  vapor.name = 'Humo de lanzamiento · 84 partículas reutilizadas'; vapor.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  vapor.boundingSphere = new THREE.Sphere(new THREE.Vector3(x, 25, z), 45); group.add(vapor);
  for (let i = 0; i < capacity; i++) {
    vapor.setMatrixAt(i, matrix.makeScale(0, 0, 0)); vapor.setColorAt(i, tint.setRGB(.8, .86, .89));
  }
  const flameMaterial = new THREE.MeshBasicMaterial({ color: 0xffb461, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const flameTime = { value: 0 };
  flameMaterial.onBeforeCompile = shader => {
    shader.uniforms.launchTime = flameTime;
    shader.vertexShader = 'varying vec2 launchUV;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nlaunchUV = uv;');
    shader.fragmentShader = 'uniform float launchTime; varying vec2 launchUV;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float ripple = .72 + .28*sin(launchUV.y*39. - launchTime*42. + sin(launchUV.x*31.));
      diffuseColor.rgb = mix(vec3(1., .13, .012), vec3(1., .82, .38), smoothstep(.16, .92, launchUV.y));
      diffuseColor.a *= pow(sin(clamp(launchUV.y,0.,1.)*3.14159265),.42)*ripple;`);
  };
  flameMaterial.customProgramCacheKey = () => 'spaceport-exhaust-v1';
  const flames = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 12, 1, true), flameMaterial, 6);
  flames.name = 'Seis chorros de escape'; flames.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  flames.boundingSphere = new THREE.Sphere(new THREE.Vector3(x, 1, z), 5); group.add(flames);
  const nozzleMaterial = new THREE.MeshBasicMaterial({ color: 0xffd48b, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const nozzles = new THREE.InstancedMesh(new THREE.SphereGeometry(.36, 12, 6), nozzleMaterial, 6);
  nozzles.name = 'Bocas de motor incandescentes';
  for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3;
    nozzles.setMatrixAt(i, matrix.compose(position.set(x + Math.cos(angle) * 1.782, .37, z + Math.sin(angle) * 1.782), identity, scale.set(1, .40, 1)));
  }
  nozzles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
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
  const origin = rocket.position.clone(); let night = false, detail = true;
  // The course caches its large static shadow map. Moving geometry must not leave
  // a frozen rocket shadow or force a full-map render on every ascent frame.
  const materials = new Map<THREE.Material, THREE.Material>();
  rocket.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = false;
    const clone = (source: THREE.Material) => {
      if (!materials.has(source)) { const material = source.clone(); material.transparent = true; materials.set(source, material); }
      return materials.get(source)!;
    };
    object.material = Array.isArray(object.material) ? object.material.map(clone) : clone(object.material);
  });
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(9, 9),
    new THREE.MeshBasicMaterial({ map, color: 0x06090c, transparent: true, opacity: .42, depthWrite: false }));
  contact.rotation.x = -Math.PI / 2; contact.position.set(x, .242, z); group.add(contact);

  function update(now: number) {
    if (!Number.isFinite(now)) return;
    const state = sequence.update(now), t = now * .001;
    flameTime.value = t;
    const vibration = state.ignition;
    rocket.position.set(origin.x + Math.sin(t * 29) * .018 * vibration, origin.y + state.altitude, origin.z + Math.sin(t * 37) * .014 * vibration);
    rocket.visible = state.opacity > .001;
    for (const [source, material] of materials) {
      material.opacity = source.opacity * state.opacity;
      if (source instanceof THREE.MeshStandardMaterial && material instanceof THREE.MeshStandardMaterial)
        material.emissiveIntensity = source.emissiveIntensity;
    }
    contact.material.opacity = .42 * state.opacity / (1 + state.altitude * .2);
    rocket.rotation.z = Math.sin(t * 31) * .0015 * vibration;
    rocket.rotation.x = Math.sin(t * 23) * .0010 * vibration;
    for (const [i, arm] of arms.entries()) arm.rotation.y = state.charge * (i ? -.27 : .30);
    warningMaterial.color.setRGB(1, .38, .08).multiplyScalar(.22 + state.warning * (1.0 + .55 * Math.sin(t * 5.2)));
    const pulse = .88 + .08 * Math.sin(t * 41) + .04 * Math.sin(t * 67);
    flameMaterial.opacity = state.ignition * .80; nozzleMaterial.opacity = state.ignition * .88;
    glowMaterial.opacity = state.ignition * (night ? .70 : .35) * pulse / (1 + state.altitude * .08);
    engineLight.position.y = state.altitude + 2.7;
    engineLight.intensity = state.ignition * (night ? 330 : 210) * pulse;
    const flameLength = Math.min(state.altitude + .7, 13 * state.ignition + .3);
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3, h = flameLength * (pulse + Math.sin(t * 35 + i) * .07);
      const px = x + Math.cos(angle) * 1.782, pz = z + Math.sin(angle) * 1.782;
      // A cone's point faces upward: the bright narrow throat meets the nozzle,
      // and the exhaust expands below it, never through the launch platform.
      flames.setMatrixAt(i, matrix.compose(position.set(px, state.altitude + .37 - h * .5, pz),
        identity, scale.set(.40 + state.ignition * .48, h, .40 + state.ignition * .48)));
      nozzles.setMatrixAt(i, matrix.compose(position.set(px, state.altitude + .37, pz), identity, scale.set(1, .40, 1)));
    }
    flames.boundingSphere!.center.y = state.altitude - flameLength * .5;
    flames.boundingSphere!.radius = flameLength + 5;
    nozzles.boundingSphere!.center.y = state.altitude + .37;
    flames.instanceMatrix.needsUpdate = nozzles.instanceMatrix.needsUpdate = true;
    vapor.count = detail ? capacity : capacity / 2;
    const launching = state.phase !== 'ready';
    for (let i = 0; i < vapor.count; i++) {
      const ground = i % 2 === 0, stream = i % 4;
      const age = (t * (ground ? .16 : .21) + i * .61803398875) % 1;
      const theta = i * 2.39996323;
      const drift = age * (ground ? (launching ? 23 : 13) : 6), radius = 2.8 + drift;
      const trail = Math.max(2, state.altitude - flameLength - age * Math.min(state.altitude, 85));
      const y = ground ? 1.1 + age * (launching ? 13 : 4) : launching && state.phase !== 'rearming'
        ? trail + age * 9 : (stream % 2 ? 32 : 16) + age * 8.5;
      const sx = (ground ? 3.2 + age * (launching ? 23 : 9) : 2.1 + age * (launching ? 15 : 6)) * (.55 + state.vent * .45);
      position.set(x + Math.cos(theta) * radius + age * 2.0, y, z + Math.sin(theta) * radius + Math.sin(i + age * 4) * .65);
      vapor.setMatrixAt(i, matrix.compose(position, identity, scale.set(sx, sx * (ground ? .65 : .86), 1)));
      alpha.setX(i, Math.sin(age * Math.PI) ** 1.25 * (ground ? state.vent : launching ? state.smoke : state.vent) * (ground ? .90 : .76));
    }
    vapor.boundingSphere!.center.y = state.altitude * .5 + 22;
    vapor.boundingSphere!.radius = state.altitude * .5 + 55;
    vapor.instanceMatrix.needsUpdate = alpha.needsUpdate = true;
    group.userData.prelaunchCharge = state.charge;
    group.userData.launchPhase = state.phase;
  }
  update(0);
  return {
    observe: sequence.observe, update, state: sequence.state,
    setNight(value: boolean) {
      night = value; vaporMaterial.color.setHex(value ? 0xb8ccdc : 0xf3f1e9);
    },
    setDetail(value: boolean) { detail = value; },
  };
}
