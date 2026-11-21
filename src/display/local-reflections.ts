import * as THREE from 'three';

export interface LocalReflector {
  x: number; y: number; z: number;
  width: number; height: number; depth: number;
  yaw: number;
  color: THREE.Color;
  glazed?: boolean;
}

export function reflectorDistanceSquared(box: LocalReflector, x: number, y: number, z: number) {
  const dx = x - box.x, dz = z - box.z;
  const c = Math.cos(box.yaw), s = Math.sin(box.yaw);
  return Math.max(0, Math.abs(c * dx - s * dz) - box.width / 2) ** 2
    + Math.max(0, Math.abs(y - box.y) - box.height / 2) ** 2
    + Math.max(0, Math.abs(s * dx + c * dz) - box.depth / 2) ** 2;
}

const plumbing = /* glsl */`
  varying vec3 reflectedPosition;
  uniform vec4 reflectionOrigin[3];
  uniform vec4 reflectionBounds[3];
  uniform vec4 reflectionColor[3];
  uniform vec2 reflectionMood;

  // Trace the reflection against three nearby, finite volumes. The nearest
  // hit wins, so a painted container can occlude the next one behind it.
  vec4 reflectedFacade(vec3 ray, float roughness) {
    vec4 facade = vec4(0.0);
    float distanceToFacade = 42.0;
    for (int i = 0; i < 3; ++i) {
      vec4 tint = reflectionColor[i];
      if (tint.a <= .001) continue;
      vec4 origin = reflectionOrigin[i];
      vec4 extent = reflectionBounds[i];
      mat2 rotation = mat2(origin.w, extent.w, -extent.w, origin.w);
      vec3 position = reflectedPosition - origin.xyz;
      position.xz = rotation * position.xz;
      vec3 direction = ray;
      direction.xz = rotation * direction.xz;
      vec3 safeDirection = max(abs(direction), vec3(.0001)) * (step(0.0, direction) * 2.0 - 1.0);
      vec3 a = (-extent.xyz - position) / safeDirection;
      vec3 b = (extent.xyz - position) / safeDirection;
      vec3 front = min(a, b), back = max(a, b);
      float entry = max(front.x, max(front.y, front.z));
      if (entry > .015 && entry < min(distanceToFacade, min(back.x, min(back.y, back.z)))) {
        distanceToFacade = entry;
        vec3 hit = (position + direction * entry) / extent.xyz;
        float edge = min(1.0 - abs(hit.y), 1.0 - min(abs(hit.x), abs(hit.z)));
        float softness = .065 + roughness * .9;
        float fade = smoothstep(-.025, softness, edge);
        float upper = smoothstep(-.85, .7, hit.y);
        vec3 light = tint.rgb * mix(.50, 1.35, upper);
        facade = vec4(light, fade * tint.a * (1.0 - .70 * roughness));
      }
    }
    return facade;
  }
`;

export function buildLocalReflections() {
  const origin = { value: Array.from({ length: 3 }, () => new THREE.Vector4()) };
  const bounds = { value: Array.from({ length: 3 }, () => new THREE.Vector4(1, 1, 1, 0)) };
  const color = { value: Array.from({ length: 3 }, () => new THREE.Vector4()) };
  const mood = { value: new THREE.Vector2() };
  const nearest = new Float64Array(3);
  const selected = new Int32Array(3);
  return {
    attach(material: THREE.MeshPhysicalMaterial) {
      material.customProgramCacheKey = () => 'micro-gp-reflected-facades-v1';
      material.onBeforeCompile = shader => {
        shader.uniforms.reflectionOrigin = origin;
        shader.uniforms.reflectionBounds = bounds;
        shader.uniforms.reflectionColor = color;
        shader.uniforms.reflectionMood = mood;
        shader.vertexShader = 'varying vec3 reflectedPosition;\n' + shader.vertexShader
          .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nreflectedPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        shader.fragmentShader = plumbing + shader.fragmentShader.replace('#include <lights_fragment_maps>', `
          #include <lights_fragment_maps>
          #if defined(USE_ENVMAP) && defined(RE_IndirectSpecular)
            if (reflectionMood.y > .001) {
              vec3 ray = inverseTransformDirection(reflect(-geometryViewDir, geometryNormal), viewMatrix);
              vec4 facade = reflectedFacade(ray, material.roughness);
              float overhead = smoothstep(-.12, .65, ray.y);
              float roof = mix(1.0, mix(.67, .13, overhead), reflectionMood.x);
              radiance = mix(radiance, facade.rgb, facade.a * .91) * roof;
              #ifdef USE_CLEARCOAT
                clearcoatRadiance = mix(clearcoatRadiance, facade.rgb, facade.a) * roof;
              #endif
            }
          #endif
        `);
      };
    },
    update(boxes: readonly LocalReflector[], x: number, y: number, z: number, shelter: number, night: boolean) {
      nearest.fill(28 ** 2); selected.fill(-1);
      for (let i = 0; i < boxes.length; i++) {
        const distance = reflectorDistanceSquared(boxes[i], x, y, z);
        for (let j = 0; j < selected.length; j++) {
          if (distance >= nearest[j]) continue;
          for (let next = selected.length - 1; next > j; next--) {
            selected[next] = selected[next - 1]; nearest[next] = nearest[next - 1];
          }
          selected[j] = i; nearest[j] = distance;
          break;
        }
      }
      mood.value.set(shelter, Number(selected[0] >= 0 || shelter > .001));
      for (let i = 0; i < selected.length; i++) {
        const facade = boxes[selected[i]];
        if (!facade) { color.value[i].w = 0; continue; }
        const weight = (1 - THREE.MathUtils.smoothstep(nearest[i], 70, 28 ** 2)) * (1 - shelter * .85);
        const strength = night ? (facade.glazed ? .56 : .42) : 1.16;
        origin.value[i].set(facade.x, facade.y, facade.z, Math.cos(facade.yaw));
        bounds.value[i].set(facade.width / 2, facade.height / 2, facade.depth / 2, Math.sin(facade.yaw));
        color.value[i].set(facade.color.r * strength, facade.color.g * strength, facade.color.b * strength, weight);
      }
    },
  };
}
