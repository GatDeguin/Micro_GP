import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Course } from '../shared/courses';
import type { RaceSnapshot } from '../shared/protocol';
import { instanceStatic, mergeStatic } from './batches';
import { buildCompactScenery } from './compact-scenery';
import { buildDiqueArchitecture } from './dique-architecture';
import { buildDiqueCargoShip } from './dique-cargo-ship';
import { buildDiqueCraneActivity } from './dique-crane-activity';
import { buildDiqueDetails, detailDiqueModels } from './dique-details';
import { buildDiqueDetourLook } from './dique-detour-look';
import { buildDiqueHarbor, buildDiqueTunnel } from './dique-harbor';
import { buildDiqueLandscape } from './dique-landscape';
import { buildDiqueProps } from './dique-props';
import { buildDiqueRoadworks } from './dique-roadworks';
import { buildDiqueTerminal } from './dique-terminal';
import { buildDiqueTrack, diqueConcrete } from './dique-track';
import { buildDiqueTreatment } from './dique-treatment';
import { buildDiqueWorkers } from './dique-workers';
import { buildDiqueWorkstations } from './dique-workstations';
import { buildDiqueYard } from './dique-yard';
import { applyExteriorOcclusion } from './scene-occlusion';

export async function buildDiqueScene(parent: THREE.Group, course: Course, wood: THREE.Texture, compactEnabled = false) {
  parent.name = 'Gran Premio del Dique';
  const loader = new GLTFLoader();
  const load = (url: URL) => loader.loadAsync(url.href).then(({ scene }) => {
    scene.traverse(object => {
      if (object instanceof THREE.Mesh) object.castShadow = object.receiveShadow = true;
    });
    return scene;
  }).catch(() => undefined);
  const [crane, kit, buildings] = await Promise.all([
    load(new URL('./assets/dique-grua.glb', import.meta.url)),
    load(new URL('./assets/dique-infraestructura.glb', import.meta.url)),
    load(new URL('./assets/dique-edificios.glb', import.meta.url)),
  ]);
  const bridge = ['Puente_1', 'Puente_2', 'Puente_3'].map(name => kit?.getObjectByName(name));
  const garage = kit?.getObjectByName('Box');
  const quay = kit?.getObjectByName('Muro');
  const pier = kit?.getObjectByName('Embarcadero');
  detailDiqueModels(garage, quay, pier, buildings);
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
  const track = buildDiqueTrack(infrastructure, course, concrete, bridge.every(part => part !== undefined) ? bridge : undefined);
  const tunnel = buildDiqueTunnel(infrastructure, course, concrete);
  const equipment = buildDiqueProps(props, course, concrete, garage);
  const terminal = buildDiqueTerminal(props, freight, course, concrete);
  const architecture = buildDiqueArchitecture(props, course, concrete, buildings);
  const detour = buildDiqueDetourLook(infrastructure, course);
  const roadworks = buildDiqueRoadworks(infrastructure, course);
  const treatment = buildDiqueTreatment(props, course, concrete);
  buildDiqueDetails(dock, props, course, !!garage);
  const workstations = buildDiqueWorkstations(props, course, !!garage);

  const movingProps = new Set<THREE.Object3D>([equipment.crane, workstations.animated]);
  if (treatment) movingProps.add(treatment.animated);
  if (compactEnabled) buildCompactScenery(parent, [dock, infrastructure, props], new Set([harbor.backWall, ...movingProps]));
  mergeStatic(dock, new Set([harbor.backWall]), 45);
  mergeStatic(infrastructure, undefined, 48);
  mergeStatic(props, movingProps, 33);
  const yard = buildDiqueYard(parent, course);
  const workers = buildDiqueWorkers(parent, course, workstations.stations);
  const craneActivity = crane ? buildDiqueCraneActivity(equipment.crane, course, crane) : undefined;
  if (craneActivity) equipment.placeholder.removeFromParent();
  else instanceStatic(equipment.placeholder);
  const ship = await shipLoading;
  applyExteriorOcclusion(parent);

  return {
    backWall: harbor.backWall,
    reflectors: equipment.reflectors,
    captureReflections: harbor.captureReflections,
    setNight(night: boolean) {
      harbor.setNight(night);
      track.setNight(night);
      tunnel.setNight(night);
      equipment.setNight(night);
      terminal.setNight(night);
      architecture.setNight(night);
      detour?.setNight(night);
      roadworks.setNight(night);
      treatment?.setNight(night);
      ship.setNight(night);
      yard.setNight(night);
      craneActivity?.setNight?.(night);
      workers.setNight(night);
      workstations.setNight(night);
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
      roadworks.update(now);
      treatment?.update(now);
      yard.update(now);
      craneActivity?.update(now);
      terminal.update(now);
      ship.update(now);
      workers.setPortActivity(ship.isTransferring(), terminal.isInspecting());
      workers.update(now);
      workstations.update(now);
    },
  };
}
