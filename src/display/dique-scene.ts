import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Course } from '../shared/courses';
import { instanceStatic, mergeStatic } from './batches';
import { buildCompactScenery } from './compact-scenery';
import { buildDiqueHarbor, buildDiqueTunnel } from './dique-harbor';
import { buildDiqueLandscape } from './dique-landscape';
import { buildDiqueProps } from './dique-props';
import { buildDiqueTrack, diqueConcrete } from './dique-track';

export function buildDiqueScene(parent: THREE.Group, course: Course, wood: THREE.Texture, compactEnabled = false) {
  parent.name = 'Gran Premio del Dique';
  const infrastructure = new THREE.Group();
  const dock = new THREE.Group();
  const props = new THREE.Group();
  parent.add(dock, infrastructure, props);
  const concrete = diqueConcrete();
  const harbor = buildDiqueHarbor(dock, wood, concrete);
  buildDiqueLandscape(dock, course, concrete);
  buildDiqueTrack(infrastructure, course, concrete);
  const tunnel = buildDiqueTunnel(infrastructure, course, concrete);
  const equipment = buildDiqueProps(props, course, concrete);

  if (compactEnabled) buildCompactScenery(parent, [dock, infrastructure, props], new Set([harbor.backWall, equipment.crane]));
  mergeStatic(dock, new Set([harbor.backWall]), 45);
  mergeStatic(infrastructure, undefined, 48);
  mergeStatic(props, new Set([equipment.crane]), 33);
  instanceStatic(equipment.placeholder);

  const craneUrl = new URL('./assets/dique-grua.glb', import.meta.url).href;
  const craneReady = new GLTFLoader().loadAsync(craneUrl).then(({ scene }) => {
    scene.name = 'Grúa del Dique modelada en Blender';
    scene.traverse(object => {
      if (object instanceof THREE.Mesh) object.castShadow = object.receiveShadow = true;
    });
    equipment.placeholder.traverse(object => {
      if (object instanceof THREE.InstancedMesh) object.dispose();
    });
    equipment.placeholder.removeFromParent();
    equipment.crane.add(scene);
    return true;
  }).catch(() => false);

  return {
    backWall: harbor.backWall,
    craneReady,
    setNight(night: boolean) {
      harbor.setNight(night);
      tunnel.setNight(night);
      equipment.setNight(night);
    },
    update(now: number) { harbor.update(now); },
  };
}
