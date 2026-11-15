import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Course } from '../shared/courses';
import type { RaceSnapshot } from '../shared/protocol';
import { instanceStatic, mergeStatic } from './batches';
import { buildCompactScenery } from './compact-scenery';
import { buildDiqueCargoShip } from './dique-cargo-ship';
import { buildDiqueCraneActivity } from './dique-crane-activity';
import { buildDiqueHarbor, buildDiqueTunnel } from './dique-harbor';
import { buildDiqueLandscape } from './dique-landscape';
import { buildDiqueProps } from './dique-props';
import { buildDiqueTerminal } from './dique-terminal';
import { buildDiqueTrack, diqueConcrete } from './dique-track';
import { buildDiqueWorkers } from './dique-workers';
import { buildDiqueYard } from './dique-yard';

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
  const freight = new THREE.Group();
  freight.name = 'Operaciones de carga';
  parent.add(dock, infrastructure, props, freight);
  const shipLoading = buildDiqueCargoShip(freight, course);
  const concrete = diqueConcrete();
  const harbor = buildDiqueHarbor(dock, course, wood, concrete, quay, pier);
  buildDiqueLandscape(dock, course, concrete);
  buildDiqueTrack(infrastructure, course, concrete, bridge.every(part => part !== undefined) ? bridge : undefined);
  const tunnel = buildDiqueTunnel(infrastructure, course, concrete);
  const equipment = buildDiqueProps(props, course, concrete, garage);
  const terminal = buildDiqueTerminal(props, freight, course, concrete);

  if (compactEnabled) buildCompactScenery(parent, [dock, infrastructure, props], new Set([harbor.backWall, equipment.crane]));
  mergeStatic(dock, new Set([harbor.backWall]), 45);
  mergeStatic(infrastructure, undefined, 48);
  mergeStatic(props, new Set([equipment.crane]), 33);
  const yard = buildDiqueYard(parent, course);
  const workers = buildDiqueWorkers(parent, course);
  const craneActivity = crane ? buildDiqueCraneActivity(equipment.crane, course, crane) : undefined;
  if (craneActivity) equipment.placeholder.removeFromParent();
  else instanceStatic(equipment.placeholder);
  const ship = await shipLoading;

  return {
    backWall: harbor.backWall,
    setNight(night: boolean) {
      harbor.setNight(night);
      tunnel.setNight(night);
      equipment.setNight(night);
      terminal.setNight(night);
      ship.setNight(night);
      yard.setNight(night);
      craneActivity?.setNight?.(night);
      workers.setNight(night);
    },
    setDetail(detail: boolean) {
      craneActivity?.setDetail?.(detail);
      ship.setDetail(detail);
      workers.setDetail(detail);
    },
    observe(snapshot: RaceSnapshot) {
      yard.observe(snapshot);
      workers.observe(snapshot);
    },
    update(now: number) {
      harbor.update(now);
      yard.update(now);
      craneActivity?.update(now);
      terminal.update(now);
      ship.update(now);
      workers.setPortActivity(ship.isTransferring(), terminal.isInspecting());
      workers.update(now);
    },
  };
}
