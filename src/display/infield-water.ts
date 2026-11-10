import * as THREE from 'three';
import { TRACK, wallHalfAt } from '../shared/track';

export const waterline = -0.156;
// x, z and radius. These rocks have matching wakes in the surface shader.
export const streamRocks = [[2.92, -5.52, 0.17], [4.11, -4.55, 0.23], [3.20, -3.32, 0.19]] as const;

const pondVertex = /* glsl */`
  #include <worldpos_vertex>
  vPondPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;

const waves = /* glsl */`
  uniform float pondTime;
  varying vec3 vPondPosition;

  float currentStrength(vec2 p) {
    return 1.0 - smoothstep(-3.35, -0.82, p.y);
  }

  vec2 channelPoint(vec2 p) {
    float center = 1.62 + 2.34 * smoothstep(-14.4, -6.50, p.y)
      - 0.48 * smoothstep(-6.40, -3.50, p.y) + 1.15 * smoothstep(-3.55, -0.9, p.y);
    return vec2(p.x - center, p.y);
  }

  vec2 waterSlope(vec2 p) {
    vec2 q = channelPoint(p);
    float tide = pondTime;
    float left = 7.8 * q.x + 4.1 * (q.y - tide * 1.10);
    float right = -5.2 * q.x + 7.4 * (q.y - tide * 1.33);
    vec2 stream = vec2(0.071, 0.044) * cos(left) + vec2(-0.043, 0.055) * cos(right);
    vec2 lagoon = vec2(0.036, 0.024) * cos(dot(p, vec2(2.4, 3.6)) - tide * 1.63)
      + vec2(-0.022, 0.031) * cos(dot(p, vec2(-4.9, 2.7)) + tide * 1.09);
    float wind = 0.54 + 0.46 * sin(0.48 * tide + dot(p, vec2(0.37, 0.31)));
    vec2 ripple = wind * vec2(0.014, 0.023) * cos(dot(p, vec2(7.8, 12.6)) - tide * 3.6);
    return mix(lagoon, stream, currentStrength(p)) + ripple;
  }
`;

const surface = /* glsl */`
  uniform vec3 streamRocks[3];
  uniform vec3 pondProbe;
  uniform vec3 bridgeCenters[3];
  uniform vec2 bridgeAxes[3];
  uniform float bridgeWidths[3];
  uniform float waterLight;

  vec3 bridgeReflectionRay(vec3 direction) {
    // Trace the reflected ray to the three deck spans that cross the water.
    // A hit samples the probe towards the same piece of timber.
    if (direction.y <= 0.015) return direction;
    float nearest = 1000.0;
    float blend = 0.0;
    for (int i = 0; i < 3; i++) {
      vec3 center = bridgeCenters[i];
      float distance = (center.y - vPondPosition.y) / direction.y;
      vec2 local = vPondPosition.xz + direction.xz * distance - center.xz;
      vec2 axis = bridgeAxes[i];
      vec2 across = vec2(-axis.y, axis.x);
      float edge = max(abs(dot(local, axis)) / 2.19, abs(dot(local, across)) / bridgeWidths[i]);
      if (edge < 1.0 && distance < nearest) {
        nearest = distance;
        blend = 1.0 - smoothstep(0.92, 1.0, abs(dot(local, across)) / bridgeWidths[i]);
      }
    }
    vec3 hit = vPondPosition + direction * nearest;
    return normalize(mix(direction, normalize(hit - pondProbe), blend));
  }

  float waterFoam(vec2 p) {
    vec2 q = channelPoint(p);
    float travel = q.y - pondTime * 1.21;
    float lanes = 0.5 + 0.5 * sin(q.x * 22.0 + 0.9 * sin(travel * 3.8));
    float patches = 0.5 + 0.5 * sin(travel * 8.1 + q.x * 17.0)
      * sin(travel * 4.0 - q.x * 11.0);
    float flow = currentStrength(p);
    vec2 footprint = fwidth(q);
    float detail = 1.0 - smoothstep(0.085, 0.21, max(footprint.x, footprint.y));
    float foam = pow(lanes, 7.0) * smoothstep(0.49, 0.94, patches) * 0.49 * flow * detail;
    float seam = 0.5 + 0.5 * sin(travel * 8.7 + 2.0 * cos(q.x * 6.6));
    foam += pow(seam, 12.0) * smoothstep(0.16, 0.83, patches) * 0.18 * flow * detail;

    for (int i = 0; i < 3; i++) {
      vec3 rock = streamRocks[i];
      vec2 delta = p - rock.xy;
      float distance = length(delta);
      float bow = 1.0 - smoothstep(0.018, 0.085, abs(distance - (rock.z + 0.062)));
      bow *= (1.0 - smoothstep(0.0, rock.z * 0.80, delta.y)) * 0.67;
      float wake = max(delta.y, 0.0);
      float legs = 1.0 - smoothstep(0.027, 0.085, abs(abs(delta.x) - rock.z * 0.65 - wake * 0.27));
      legs *= smoothstep(-0.04, 0.19, delta.y) * (1.0 - smoothstep(0.37, 1.25, wake));
      legs *= 0.4 + 0.4 * sin(wake * 19.0 - pondTime * 10.4);
      foam = max(foam, max(bow, legs));
    }
    return foam;
  }
`;

export function pondMaterials(bedMap: THREE.Texture) {
  const time = { value: 0 };
  const light = { value: 1 };
  const bed = new THREE.MeshStandardMaterial({ map: bedMap, roughness: 0.96 });
  const water = new THREE.MeshPhysicalMaterial({
    color: 0x559f95, roughness: 0.17, metalness: 0, ior: 1.333, specularIntensity: 0.93,
    clearcoat: 0.73, clearcoatRoughness: 0.16, transparent: true, opacity: 0.27, depthWrite: false,
  });
  const probePosition = new THREE.Vector3(4.57, waterline + 0.11, -1.23);
  const spans = [-4.10, 0, 4.10].map(offset => TRACK.sampleAt(TRACK.bridge.crest + offset));

  bed.onBeforeCompile = shader => {
    shader.uniforms.pondTime = time;
    shader.uniforms.waterLight = light;
    shader.vertexShader = 'varying vec3 vPondPosition;\n' + shader.vertexShader.replace('#include <worldpos_vertex>', pondVertex);
    shader.fragmentShader = 'uniform float waterLight;\n' + waves + shader.fragmentShader.replace('#include <opaque_fragment>', /* glsl */`
      vec2 q = channelPoint(vPondPosition.xz);
      float drift = mix(0.32, 1.18, currentStrength(vPondPosition.xz)) * pondTime;
      float ridge = abs(sin(q.x * 6.0 + q.y * 2.9 - drift * 2.9
        + 0.73 * sin(q.y * 4.3 - drift * 4.3)));
      float ripple = abs(sin(q.x * 3.7 - q.y * 7.2 + drift * 7.2));
      float caustic = pow(1.0 - ridge * ripple, 7.0);
      outgoingLight *= 1.0 + waterLight * caustic * vec3(0.23, 0.31, 0.28);
      #include <opaque_fragment>
    `);
  };

  water.onBeforeCompile = shader => {
    shader.uniforms.pondTime = time;
    shader.uniforms.waterLight = light;
    shader.uniforms.streamRocks = { value: streamRocks.map(rock => new THREE.Vector3(...rock)) };
    shader.uniforms.pondProbe = { value: probePosition };
    shader.uniforms.bridgeCenters = { value: spans.map(p => new THREE.Vector3(p.x, p.y - 0.34, p.z)) };
    shader.uniforms.bridgeAxes = { value: spans.map(p => new THREE.Vector2(p.dx, p.dz)) };
    shader.uniforms.bridgeWidths = { value: spans.map(p => wallHalfAt(p.s, 1) + 0.14) };
    shader.vertexShader = 'varying vec3 vPondPosition;\n' + shader.vertexShader.replace('#include <worldpos_vertex>', pondVertex);
    const reflections = THREE.ShaderChunk.envmap_physical_pars_fragment.replace(
      'envMapRotation * reflectVec, roughness',
      'envMapRotation * bridgeReflectionRay(reflectVec), roughness',
    );
    shader.fragmentShader = waves + surface + shader.fragmentShader
      .replace('#include <envmap_physical_pars_fragment>', reflections)
      .replace('#include <normal_fragment_maps>', /* glsl */`
        vec2 slope = waterSlope(vPondPosition.xz);
        normal = normalize(mat3(viewMatrix) * vec3(-slope.x, 1.0, -slope.y));
      `)
      .replace('#include <clearcoat_normal_fragment_maps>', 'clearcoatNormal = normal;')
      .replace('#include <opaque_fragment>', /* glsl */`
        float foam = waterFoam(vPondPosition.xz);
        float fresnel = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
        diffuseColor.a = min(0.85, diffuseColor.a + 0.54 * fresnel + 0.48 * foam);
        outgoingLight = mix(outgoingLight, waterLight * vec3(0.76, 0.85, 0.74), foam * 0.78);
        outgoingLight += (1.0 - waterLight) * fresnel * vec3(0.025, 0.046, 0.079);
        #include <opaque_fragment>
      `);
  };

  function capture(renderer: THREE.WebGLRenderer, scene: THREE.Scene, surfaceMesh: THREE.Mesh) {
    const target = new THREE.WebGLCubeRenderTarget(128, {
      type: renderer.extensions.has('EXT_color_buffer_float') ? THREE.HalfFloatType : THREE.UnsignedByteType,
    });
    const camera = new THREE.CubeCamera(0.075, 85, target);
    camera.position.copy(probePosition);
    const shadows = renderer.shadowMap.autoUpdate;
    const generator = new THREE.PMREMGenerator(renderer);
    try {
      surfaceMesh.visible = false;
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = true;
      camera.update(renderer, scene);
      water.envMap = generator.fromCubemap(target.texture).texture;
      water.envMapIntensity = 1.25 * light.value;
      water.needsUpdate = true;
    } finally {
      surfaceMesh.visible = true;
      renderer.shadowMap.autoUpdate = shadows;
      target.dispose();
      generator.dispose();
    }
  }

  return {
    bed, water, capture,
    update: (seconds: number) => { time.value = seconds; },
    setNight(enabled: boolean) {
      light.value = enabled ? 0.43 : 1;
      water.envMapIntensity = (water.envMap ? 1.25 : 1) * light.value;
    },
  };
}
