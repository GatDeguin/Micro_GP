import type { Object3D } from 'three';

export const sceneryLights = 1;
export const headlightLayer = (slot: number) => slot + 2;
export const originalScenery = 6;
export const compactScenery = 7;

export function cameraLights(camera: Pick<Object3D, 'layers'>, compact: boolean, slot?: number) {
  if (!compact) {
    camera.layers.enableAll();
    camera.layers.disable(compactScenery);
    return;
  }
  camera.layers.set(0);
  camera.layers.enable(compactScenery);
  if (slot !== undefined) camera.layers.enable(headlightLayer(slot));
}
