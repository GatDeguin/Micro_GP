import * as THREE from 'three';

const sunlight = THREE.ShaderChunk.lights_fragment_begin.replace(
  /(directLight\.color \*= )([^\n]+directionalShadowMap[^\n]+);/,
  'float sunVisibility = $2;\n exteriorVisibility *= sunVisibility;\n $1sunVisibility;',
);
// The exterior map covers hundreds of metres. Interpolating coverage between
// neighbouring texels removes the separated steps of the wide PCF kernel.
const exteriorShadow = THREE.ShaderChunk.shadowmap_pars_fragment.replace(
  /#if defined\( SHADOWMAP_TYPE_PCF \)[\s\S]*?#elif defined\( SHADOWMAP_TYPE_PCF_SOFT \)/,
  '#if defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_PCF_SOFT )',
).replace(
  /shadow = \((?=\s*texture2DCompare\( shadowMap, uv, shadowCoord\.z \) \+)/,
  `if (compactExteriorShadows) {
    float a = texture2DCompare(shadowMap, uv, shadowCoord.z);
    float b = texture2DCompare(shadowMap, uv + vec2(dx, 0.0), shadowCoord.z);
    float c = texture2DCompare(shadowMap, uv + vec2(0.0, dy), shadowCoord.z);
    float d = texture2DCompare(shadowMap, uv + texelSize, shadowCoord.z);
    shadow = mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  } else shadow = (`,
);
const adapted = new WeakSet<THREE.MeshStandardMaterial>();

/** Reuse the sun's filtered visibility to soften the environmental fill under
 * decks and roofs. Color and highlights remain separate from direct lighting. */
export function applyExteriorOcclusion(root: THREE.Object3D) {
  const compactShadows = { value: false };
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh) || !object.receiveShadow) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!(material instanceof THREE.MeshStandardMaterial) || adapted.has(material) || material.transparent) continue;
      adapted.add(material);
      const previousCompile = material.onBeforeCompile;
      const cacheKey = material.customProgramCacheKey();
      material.customProgramCacheKey = () => cacheKey + ':exterior-occlusion-v3';
      material.onBeforeCompile = (shader, renderer) => {
        previousCompile.call(material, shader, renderer);
        shader.uniforms.compactExteriorShadows = compactShadows;
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <shadowmap_pars_fragment>', `uniform bool compactExteriorShadows;\n${exteriorShadow}`)
          .replace('#include <lights_fragment_begin>', `float exteriorVisibility = 1.0;\n${sunlight}`)
          .replace('#include <aomap_fragment>', `#include <aomap_fragment>
            float outdoorFill = mix(0.57, 1.0, smoothstep(0.10, 0.72, exteriorVisibility));
            reflectedLight.indirectDiffuse *= outdoorFill;
            reflectedLight.indirectSpecular *= mix(0.67, 1.0, exteriorVisibility);
            #ifdef USE_CLEARCOAT
              clearcoatSpecularIndirect *= mix(0.67, 1.0, exteriorVisibility);
            #endif
          `);
      };
      material.needsUpdate = true;
    }
  });
  return (compact: boolean) => { compactShadows.value = compact; };
}
