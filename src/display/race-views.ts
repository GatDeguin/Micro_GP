import * as THREE from 'three';
import type { CarView } from '../shared/protocol';
import { TRACK, wallHalfAt, type TrackPoint } from '../shared/track';
import type { buildPlacard } from './signs';
import { approachingCover, coverClearance } from './track-cover';

export type ViewMode = 'general' | 'chase' | 'trackside';

function followCamera() {
  const camera = new THREE.PerspectiveCamera(46, 1, 0.09, 160);
  const position = new THREE.Vector3();
  const target = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const subject = new THREE.Vector3();
  let previousMode: ViewMode | undefined;
  let direction = 1;
  let side = 1;

  return (mode: ViewMode, car: CarView, width: number, height: number, dt: number, qrSize = 0) => {
    const aspect = width / height;
    const road = TRACK.locate(car.x, car.z, { s: car.distance, y: car.y });
    const cover = approachingCover(road.s, 6);
    const heading = road.dx * Math.sin(car.yaw) + road.dz * Math.cos(car.yaw);
    const changed = previousMode !== mode;
    if (changed || Math.abs(heading) > 0.72) direction = heading >= 0 ? 1 : -1;
    if (changed) side = road.offset > 0.3 ? -1 : 1;
    let cameraRoad: TrackPoint = road;

    if (mode === 'general' && cover === 0) {
      position.set(car.x - 5, car.y + 14, car.z + 10);
      target.set(car.x, car.y, car.z);
    } else if (mode !== 'trackside') {
      const behind = TRACK.sampleAt(road.s - direction * THREE.MathUtils.lerp(5.4, 3.4, cover));
      const ahead = TRACK.sampleAt(road.s + direction * 4.4);
      cameraRoad = behind;
      position.set(behind.x - behind.dz * road.offset * 0.45,
        THREE.MathUtils.lerp(Math.max(car.y + 1.75, behind.y + 2.75), behind.y + 1.18, cover),
        behind.z + behind.dx * road.offset * 0.45);
      target.set(car.x + (ahead.x - road.x) * 0.44, car.y + 0.46, car.z + (ahead.z - road.z) * 0.44);
      if (mode === 'general') {
        position.set(THREE.MathUtils.lerp(car.x - 5, position.x, cover),
          THREE.MathUtils.lerp(car.y + 14, position.y, cover), THREE.MathUtils.lerp(car.z + 10, position.z, cover));
      }
    } else {
      const ahead = TRACK.sampleAt(road.s + direction * THREE.MathUtils.lerp(4.3, 3.1, cover));
      cameraRoad = ahead;
      const left = THREE.MathUtils.lerp(wallHalfAt(ahead.s, -1) - 0.35, 1.64, cover);
      const right = THREE.MathUtils.lerp(wallHalfAt(ahead.s, 1) - 0.35, 1.64, cover);
      const shoulder = THREE.MathUtils.clamp(road.offset + side * 3.3,
        -left, right);
      position.set(ahead.x - ahead.dz * shoulder, ahead.y + 0.75, ahead.z + ahead.dx * shoulder);
      target.set(car.x, car.y + 0.36, car.z);
    }

    const blend = changed || camera.position.distanceToSquared(position) > 28 ? 1 : 1 - Math.exp(-dt * 15);
    camera.position.lerp(position, blend);
    aim.lerp(target, blend);
    if (mode === 'trackside' || cover > 0) {
      const ground = TRACK.locate(camera.position.x, camera.position.z, { s: cameraRoad.s, y: cameraRoad.y });
      const inside = Math.abs(ground.offset) < wallHalfAt(ground.s, Math.sign(ground.offset)) + 0.25;
      const ceiling = inside ? ground.y + coverClearance(ground.s) - 0.23 : Infinity;
      camera.position.y = THREE.MathUtils.clamp(camera.position.y, ground.y + 0.59, ceiling);
    }
    camera.lookAt(aim);
    const fov = (mode === 'general' ? 44 : mode === 'chase' ? 48 : 42)
      + THREE.MathUtils.clamp((1.25 - aspect) * 22, 0, 22) + (qrSize ? 4 : 0);
    if (camera.view?.enabled || camera.aspect !== aspect || camera.fov !== fov) {
      camera.aspect = aspect;
      camera.fov = fov;
      camera.clearViewOffset();
    }
    if (qrSize) {
      // Anchor the focused car clear of the shared plaque even through tight turns.
      camera.updateMatrixWorld();
      subject.set(car.x, car.y + 0.44, car.z).project(camera);
      const safeX = -Math.min(0.28, qrSize * 1.55 / width);
      camera.setViewOffset(width, height, (subject.x - safeX) * width / 2, (0.14 - subject.y) * height / 2, width, height);
    }
    previousMode = mode;
    return camera;
  };
}

export function buildRaceViews(
  renderer: THREE.WebGLRenderer, overhead: THREE.PerspectiveCamera,
  placard: ReturnType<typeof buildPlacard>, cameraFit: (camera: THREE.PerspectiveCamera) => (width: number, height: number) => void,
  backdrop: { wall: THREE.Object3D; build(): THREE.Texture },
) {
  const followers = Array.from({ length: 4 }, followCamera);
  const shared = new THREE.PerspectiveCamera(overhead.fov, 1, overhead.near, overhead.far);
  const fitShared = cameraFit(shared);
  const plateScene = new THREE.Scene();
  const plateKey = new THREE.DirectionalLight(0xffd2a0, 2);
  plateKey.position.set(-3, 5, 5);
  plateScene.add(plateKey, new THREE.HemisphereLight(0xffead2, 0x3f3636, 1.5));
  const divider = new THREE.Color(0x171310);
  let sharedWidth = 0;
  let sharedHeight = 0;
  let wasSplit = false;
  let displayWindow: THREE.Texture | undefined;

  return (scene: THREE.Scene, mode: ViewMode, cars: readonly CarView[], slots: readonly number[],
    width: number, height: number, dt: number) => {
    const split = slots.length > 1;
    if (wasSplit && !split) placard.resize(overhead, width, height);
    wasSplit = split;
    if (!split && mode === 'general') {
      placard.setGrounded(true);
      renderer.render(scene, overhead);
      return overhead;
    }

    const room = scene.background;
    const roomBlur = scene.backgroundBlurriness;
    const collector = mode === 'general' ? undefined : (displayWindow ??= backdrop.build());
    const draw = (camera: THREE.PerspectiveCamera, following: boolean) => {
      const background = following ? collector : undefined;
      scene.background = background ?? room;
      scene.backgroundBlurriness = background ? 0.05 : roomBlur;
      backdrop.wall.visible = background === undefined;
      renderer.render(scene, camera);
    };

    placard.setGrounded(false);
    plateScene.add(placard.object);
    let listener = overhead;
    if (split) {
      const rows = slots.length > 2 || height > width ? 2 : 1;
      const columns = slots.length > 2 || width >= height ? 2 : 1;
      const plateFit = Math.min(width * 0.26, (width / columns) * 0.38, (height / rows) * 0.38);
      const plateLimit = THREE.MathUtils.clamp(plateFit, 92, 145);
      placard.resize(overhead, width, height, undefined, plateLimit);
      const shadowUpdate = renderer.shadowMap.autoUpdate;
      renderer.setClearColor(divider);
      renderer.clear();
      renderer.setScissorTest(true);

      for (let i = 0; i < rows * columns; i++) {
        const column = i % columns;
        const row = Math.floor(i / columns);
        const left = Math.floor(column * width / columns) + (column ? 1 : 0);
        const right = Math.floor((column + 1) * width / columns) - (column < columns - 1 ? 1 : 0);
        const top = Math.floor(row * height / rows) + (row ? 1 : 0);
        const bottom = Math.floor((row + 1) * height / rows) - (row < rows - 1 ? 1 : 0);
        const w = Math.max(1, right - left);
        const h = Math.max(1, bottom - top);
        const slot = slots[i];
        if (slot === undefined && (w !== sharedWidth || h !== sharedHeight)) {
          fitShared(w, h);
          sharedWidth = w;
          sharedHeight = h;
        }
        renderer.setViewport(left, height - bottom, w, h);
        renderer.setScissor(left, height - bottom, w, h);
        const qrSize = i === rows * columns - 1 ? plateLimit : 0;
        draw(slot === undefined ? shared : followers[slot](mode, cars[slot], w, h, dt, qrSize), slot !== undefined);
        // All panes show the same world at the same time, so the first shadow map is reusable.
        renderer.shadowMap.autoUpdate = false;
      }

      renderer.shadowMap.autoUpdate = shadowUpdate;
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, width, height);
    } else {
      const slot = slots[0];
      listener = followers[slot](mode, cars[slot], width, height, dt);
      draw(listener, true);
    }
    scene.background = room;
    scene.backgroundBlurriness = roomBlur;
    backdrop.wall.visible = true;

    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(plateScene, overhead);
    renderer.autoClear = true;
    scene.add(placard.object);
    return listener;
  };
}
