import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Course } from '../shared/courses';
import { instanceStatic, mergeStatic } from './batches';
import { buildCompactScenery } from './compact-scenery';
import { buildDiqueHarbor, buildDiqueTunnel } from './dique-harbor';
import { buildDiqueLandscape } from './dique-landscape';
import { buildDiqueProps } from './dique-props';
import { buildDiqueTrack, diqueConcrete } from './dique-track';

export async function buildDiqueScene(parent: THREE.Group, course: Course, wood: THREE.Texture, compactEnabled = false) {
  parent.name = 'Gran Premio del Dique';
  const loader = new GLTFLoader();
  const load = (url: URL) => loader.loadAsync(url.href).then(({ scene }) => {
    scene.traverse(object => {
      if (object instanceof THREE.Mesh) object.castShadow = object.receiveShadow = true;
    });
    return scene;
  }).catch(() => undefined);
  const [crane, kit] = await Promise.all([
    load(new URL('./assets/dique-grua.glb', import.meta.url)),
    load(new URL('./assets/dique-infraestructura.glb', import.meta.url)),
  ]);
  const bridge = ['Puente_1', 'Puente_2', 'Puente_3'].map(name => kit?.getObjectByName(name));
  const garage = kit?.getObjectByName('Box');
  const quay = kit?.getObjectByName('Muro');
  const pier = kit?.getObjectByName('Embarcadero');
  const infrastructure = new THREE.Group();
  const dock = new THREE.Group();
  const props = new THREE.Group();
  parent.add(dock, infrastructure, props);
  const concrete = diqueConcrete();
  const harbor = buildDiqueHarbor(dock, course, wood, concrete, quay, pier);
  buildDiqueLandscape(dock, course, concrete);
  buildDiqueTrack(infrastructure, course, concrete, bridge.every(part => part !== undefined) ? bridge : undefined);
  const tunnel = buildDiqueTunnel(infrastructure, course, concrete);
  const equipment = buildDiqueProps(props, course, concrete, garage);

  if (compactEnabled) buildCompactScenery(parent, [dock, infrastructure, props], new Set([harbor.backWall, equipment.crane]));
  mergeStatic(dock, new Set([harbor.backWall]), 45);
  mergeStatic(infrastructure, undefined, 48);
  mergeStatic(props, new Set([equipment.crane]), 33);
  if (crane) {
    crane.name = 'Grúa del Dique modelada en Blender';
    equipment.placeholder.removeFromParent();
    equipment.crane.add(crane);
  } else instanceStatic(equipment.placeholder);

  return {
    backWall: harbor.backWall,
    setNight(night: boolean) {
      harbor.setNight(night);
      tunnel.setNight(night);
      equipment.setNight(night);
    },
    update(now: number) { harbor.update(now); },
  };
}
