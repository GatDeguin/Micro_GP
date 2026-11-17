import * as THREE from 'three';

const sunlight = THREE.ShaderChunk.lights_fragment_begin.replace(
  /(directLight\.color \*= )([^\n]+directionalShadowMap[^\n]+);/,
  'float sunVisibility = $2;\n exteriorVisibility *= sunVisibility;\n $1sunVisibility;',
);
const adapted = new WeakSet<THREE.MeshStandardMaterial>();

/** Reuse the sun's filtered visibility to soften the environmental fill under
 * decks and roofs. Color and highlights remain separate from direct lighting. */
export function applyExteriorOcclusion(root: THREE.Object3D) {
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh) || !object.receiveShadow) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!(material instanceof THREE.MeshStandardMaterial) || adapted.has(material) || material.transparent) continue;
      adapted.add(material);
      const previousCompile = material.onBeforeCompile;
      const cacheKey = material.customProgramCacheKey();
      material.customProgramCacheKey = () => cacheKey + ':exterior-occlusion';
      material.onBeforeCompile = (shader, renderer) => {
        previousCompile.call(material, shader, renderer);
        shader.fragmentShader = shader.fragmentShader
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
}
