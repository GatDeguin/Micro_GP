import * as THREE from 'three';
import type { Course } from '../shared/courses';

const probes = {
  dique: new URL('./assets/dique-sector.pmrem.gz', import.meta.url),
  spaceport: new URL('./assets/spaceport-sector.pmrem.gz', import.meta.url),
};

export interface SectorReflection {
  texture: THREE.DataTexture;
  distance: number;
  night: boolean;
}

/** Load the prefiltered 64-pixel cube as a linear half-float atlas. */
export async function loadSectorReflection(course: Course): Promise<SectorReflection | undefined> {
  if (course.id === 'taller' || typeof DecompressionStream === 'undefined') return undefined;
  try {
    const response = await fetch(probes[course.id]);
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
    const data = await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    const header = new DataView(data);
    const width = header.getUint16(0, true), height = header.getUint16(2, true);
    if (width !== 336 || height !== 256 || data.byteLength !== 4 + width * height * 8) {
      throw new Error('Dimensiones incompatibles del mapa de reflejos');
    }
    const pixels = new Uint16Array(data, 4);
    const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
    texture.name = `Reflejos horneados · ${course.id}`;
    texture.colorSpace = THREE.LinearSRGBColorSpace;
    texture.mapping = THREE.CubeUVReflectionMapping;
    texture.magFilter = texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    const distance = course.detour ? course.detour.from + 47 : course.locate(82, -211, { y: 0 }).s;
    return { texture, distance, night: course.id === 'dique' };
  } catch (error) {
    console.warn('Mapa de reflejos del sector no disponible.', error);
    return undefined;
  }
}
