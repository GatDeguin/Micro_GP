import * as THREE from 'three';
import { COURSE_OPTIONS, type CarView, type CourseId, type RaceSnapshot } from '../shared/protocol';
import { DIQUE, TALLER, type Course } from '../shared/courses';
import type { TrackPoint } from '../shared/track';
import { raceAudio } from './audio';
import { instanceStatic, mergeStatic } from './batches';
import { buildCars } from './cars';
import { buildCircuit } from './circuit';
import { buildCollectorBackdrop, disposeCollectorBackdrop } from './collector-backdrop';
import { buildCompactScenery } from './compact-scenery';
import { frameBudget } from './frame-budget';
import { buildGrandstands } from './grandstands';
import { buildInfield } from './infield';
import { buildMultiplayerLobby } from './lobby';
import { BENCH_SURFACE, plankMap } from './materials';
import { buildRaceViews } from './race-views';
import { cameraLights } from './render-layers';
import { ReplayHistory, replayCompanion } from './replay';
import { buildReplayShot } from './replay-shot';
import { buildRaceResults } from './results';
import { buildSafetyBarriers } from './safety-barriers';
import { buildSceneLighting } from './scene-lighting';
import { readAudioSettings, readQuality } from './settings';
import { buildPlacard, buildRaceSigns, placardLayout } from './signs';
import { startSolo } from './solo';
import { SnapshotClock } from './snapshot-clock';
import { approachingCover } from './track-cover';
import { buildTyreMarks } from './tyre-marks';
import { buildViewControls } from './view-controls';
import { buildWorkshop } from './workshop';
import { buildWorldActivity } from './world-activity';

type DisplayMessage = { type: 'hello'; url: string } | { type: 'state'; state: RaceSnapshot };
type CourseStage = {
  root: THREE.Group;
  course: Course;
  backWall: THREE.Object3D;
  barriers: ReturnType<typeof buildSafetyBarriers>;
  tyreMarks: ReturnType<typeof buildTyreMarks>;
  signs: ReturnType<typeof buildRaceSigns>;
  observe?(snapshot: RaceSnapshot): void;
  update(now: number): void;
  setNight(night: boolean): void;
  setDetail?(detail: boolean): void;
  captureReflections?(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void;
};

const canvas = document.querySelector<HTMLCanvasElement>('#track')!;
const homeLogo = document.querySelector<HTMLImageElement>('#home-logo')!;
const splash = document.querySelector<HTMLElement>('#race-splash')!;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const pages = import.meta.env.MODE === 'pages';
const graphics = readQuality();
const lowQuality = graphics === 'low';
const adaptive = graphics === 'auto';
// Fit to the projected centerline and finish stripe annotated in img01 of the atlas.
function atEdge(p: TrackPoint, offset: number, y: number) {
  return new THREE.Vector3(p.x - p.dz * offset, y, p.z + p.dx * offset);
}

function cameraFit(camera: THREE.PerspectiveCamera, course: Course) {
  const dique = course.id === 'dique';
  const samples = dique ? course.samples.filter((_, i) => i % 4 === 0) : course.samples;
  const deck = samples.flatMap(p => [-1, 1].map(side =>
    atEdge(p, side * (course.wallHalfAt(p.s, side) + 1.4), BENCH_SURFACE)));
  const fence = samples.flatMap(p => [-1, 1].map(side =>
    atEdge(p, side * (course.wallHalfAt(p.s, side) + 0.04), p.y + 0.84)));
  const road = samples.flatMap(p => [-1, 1].map(side =>
    atEdge(p, side * (course.roadHalfAt(p.s) + 0.47), p.y + 0.14)));
  const target = new THREE.Vector3(-1.1, 0.11, -0.6);
  if (dique) {
    new THREE.Box3().setFromPoints(deck).getCenter(target);
    target.z += 11;
  }
  const eyeDirection = (dique ? new THREE.Vector3(-0.065, 0.717, 0.73) : new THREE.Vector3(-0.338, 0.779, 0.625)).normalize();
  const point = new THREE.Vector3();
  return (width: number, height: number) => {
    const qr = placardLayout(width, height);
    const qrLeft = 2 * (qr.left - 11) / width - 1;
    const qrTop = 1 - 2 * (qr.top - 11) / height;
    camera.near = dique ? 10 : 0.3;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const position = (distance: number) => {
      camera.position.copy(target).addScaledVector(eyeDirection, distance);
      camera.lookAt(target);
      // The oblique view exposes the flanks while keeping the finish straight level.
      camera.rotateZ(dique ? 0.011 : 0.383);
      camera.updateMatrixWorld();
    };

    let near = 20;
    let far = dique ? Math.max(780, 780 / camera.aspect) : Math.max(220, 230 / camera.aspect);
    if (camera.far < far + 120) {
      camera.far = far + 120;
      camera.updateProjectionMatrix();
    }
    for (let i = 0; i < 20; i++) {
      const distance = (near + far) / 2;
      position(distance);
      const clips = deck.some(bounds => {
        point.copy(bounds).project(camera);
        return Math.abs(point.x) > 0.986 || point.y < -0.80;
      }) || fence.some(bounds => {
        point.copy(bounds).project(camera);
        return Math.abs(point.x) > 0.991 || point.y > 0.827;
      }) || road.some(bounds => {
        point.copy(bounds).project(camera);
        return Math.abs(point.x) > 0.966 || (point.x > qrLeft && point.y < qrTop);
      });
      if (clips) near = distance;
      else far = distance;
    }
    position(far);
  };
}

function exhibition(course: Course): RaceSnapshot {
  return {
    frame: -1, heat: 0, phase: 'demo', lights: 0, flag: false, order: [0, 1, 2, 3],
    cars: course.demoDistances.map(distance => {
      const p = course.sampleAt(distance);
      return { x: p.x, y: p.y, z: p.z, yaw: Math.atan2(p.dx, p.dz), distance: p.s,
        speed: 0, lap: 0, owned: false, blink: false, braking: false, steer: 0 };
    }),
  };
}

async function bootstrap() {
  // Let the loading screen paint before procedural textures and geometry are built.
  await new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowQuality, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.97;
  renderer.shadowMap.enabled = !lowQuality;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x211917);
  const camera = new THREE.PerspectiveCamera(27, 1, 0.3, 800);
  cameraLights(camera, false);
  const wood = plankMap();
  const tallerRoot = new THREE.Group();
  scene.add(tallerRoot);
  const workshop = new THREE.Group();
  const benchDetails = new THREE.Group();
  const backWall = buildWorkshop(workshop, benchDetails);
  const stands = buildGrandstands(workshop, tallerRoot);
  instanceStatic(workshop);
  mergeStatic(workshop, new Set([backWall]), 12);
  instanceStatic(benchDetails);
  mergeStatic(benchDetails);
  workshop.add(benchDetails);
  const circuit = new THREE.Group();
  buildCircuit(circuit, wood);
  instanceStatic(circuit);
  mergeStatic(circuit, undefined, 12);
  tallerRoot.add(workshop, circuit);
  if (!pages) buildCompactScenery(tallerRoot, [workshop, circuit], new Set([backWall, benchDetails]));
  const infield = buildInfield(tallerRoot);
  const world = buildWorldActivity(tallerRoot);
  const taller: CourseStage = {
    root: tallerRoot, course: TALLER, backWall,
    barriers: buildSafetyBarriers(tallerRoot), tyreMarks: buildTyreMarks(tallerRoot),
    signs: buildRaceSigns(tallerRoot),
    observe(state) { stands.observe(state); world.observe(state); },
    update(now) { infield.update(now); stands.update(now); world.update(now); },
    setNight(night) { infield.setNight(night); world.setNight(night); },
    setDetail(detail) { benchDetails.visible = detail; infield.setDetail(detail); stands.setDetail(detail); },
    captureReflections: infield.captureReflections,
  };
  const { lightShot, setNight, setCourse, restoreReflections } = buildSceneLighting(scene, renderer, lowQuality);
  if (!lowQuality) infield.captureReflections(renderer, scene);
  const cars = buildCars(scene);
  const placard = buildPlacard(scene, !pages);
  const audioSettings = readAudioSettings();
  const audio = raceAudio(audioSettings);
  const controls = buildViewControls({ multiplayer: !pages, graphics, audio: audioSettings, onAudioChange: audio.setLevels });
  let displayWindow = buildCollectorBackdrop(renderer);
  let stage = taller;
  let preview = exhibition(TALLER);
  let fit = cameraFit(camera, TALLER);
  const viewsFor = (next: CourseStage) => buildRaceViews(renderer, camera, placard,
    camera => cameraFit(camera, next.course), { wall: next.backWall, build: () => displayWindow }, next.course);
  let renderViews = viewsFor(taller);
  const replay = new ReplayHistory(false);
  const results = buildRaceResults(replay);
  let replayShot: ReturnType<typeof buildReplayShot> | undefined;
  let replaying = false;
  let replayClip = -1;
  let night = false;
  const budget = frameBudget();
  let lastShadow = -Infinity;
  let fourPanes = false;

  let width = 1, height = 1;
  function resizeBuffer() {
    const pixels = lowQuality ? 1_440_000 : adaptive ? 2_073_600 : Infinity;
    const density = Math.min(devicePixelRatio, lowQuality ? 1 : 1.55, Math.sqrt(pixels / (width * height)));
    const scale = adaptive ? budget.scale * (fourPanes ? 0.80 : 1) : 1;
    renderer.setDrawingBufferSize(width, height, density * scale);
  }
  function resize() {
    width = Math.max(1, canvas.clientWidth);
    height = Math.max(1, canvas.clientHeight);
    resizeBuffer();
    fit(width, height);
    placard.resize(camera, width, height);
  }
  resize();
  renderer.shadowMap.autoUpdate = false;
  addEventListener('resize', resize);

  const initial = preview;
  let current = initial;
  const clock = new SnapshotClock(pages ? 50 : 75);
  let lastFrame = performance.now();
  clock.add(initial, lastFrame);
  let lostContext = false;
  let ownedSlots: number[] = [];
  const interpolated: CarView[] = [...initial.cars];
  stage.signs.board(initial);
  homeLogo.hidden = false;
  splash.addEventListener('animationend', event => {
    if (event.animationName === 'race-fade-to-grid' && splash.dataset.stage === 'launch') splash.dataset.stage = 'ready';
  });

  let desiredCourse: CourseId = 'taller';
  let dique: Promise<CourseStage> | undefined;
  let warmedDique = false;
  let changingCourse = false;
  async function loadDique(): Promise<CourseStage> {
    const { buildDiqueScene } = await import('./dique-scene');
    await new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    const root = new THREE.Group();
    const diorama = await buildDiqueScene(root, DIQUE, wood, !pages);
    return {
      ...diorama, root, course: DIQUE,
      barriers: buildSafetyBarriers(root, DIQUE), tyreMarks: buildTyreMarks(root, DIQUE),
      signs: buildRaceSigns(root, DIQUE),
    };
  }

  function activateCourse(next: CourseStage) {
    scene.remove(stage.root);
    stage = next;
    scene.add(stage.root);
    canvas.setAttribute('aria-label', `Micro GP · ${COURSE_OPTIONS[stage.course.id].label}`);
    preview = exhibition(stage.course);
    if (replaying) lightShot(false);
    replayShot?.dispose();
    replayShot = undefined;
    replaying = false;
    replayClip = -1;
    setCourse(stage.course);
    for (const car of cars) car.setProjectedShadow(stage.course.id === 'taller' && !fourPanes);
    stage.setNight(night);
    stage.setDetail?.(!fourPanes);
    const shown = (current.config?.course ?? 'taller') === stage.course.id ? current : preview;
    stage.signs.board(shown);
    stage.signs.lights(shown.lights);
    fit = cameraFit(camera, stage.course);
    renderViews = viewsFor(stage);
    lastShadow = -Infinity;
    budget.reset(performance.now());
    resize();
  }

  function selectCourse(course: CourseId) {
    if (desiredCourse === course) return;
    desiredCourse = course;
    if (course === 'taller') {
      if (stage !== taller) activateCourse(taller);
      changingCourse = false;
      return;
    }
    changingCourse = true;
    splash.dataset.stage = 'loading';
    const request = dique ??= loadDique();
    void request.then(async next => {
      if (desiredCourse !== course) return;
      if (next !== stage) activateCourse(next);
      if (!warmedDique && !lowQuality && !lostContext) {
        await renderer.compileAsync(scene, camera);
        if (desiredCourse !== course || lostContext) return;
        renderer.render(scene, camera);
        if (!pages) {
          const compactCamera = camera.clone();
          cameraLights(compactCamera, true, 0);
          await renderer.compileAsync(scene, compactCamera);
          if (desiredCourse !== course || lostContext) return;
          renderer.render(scene, compactCamera);
        }
        warmedDique = true;
      }
      changingCourse = false;
    }).catch(error => {
      console.error('No se pudo cargar el Gran Premio del Dique.', error);
      dique = undefined;
      desiredCourse = 'taller';
      changingCourse = false;
    });
  }

  const lobby = pages ? undefined : buildMultiplayerLobby(selectCourse);

  function updateState(snapshot: RaceSnapshot, now = performance.now()) {
    const course = snapshot.config?.course ?? 'taller';
    selectCourse(course);
    clock.add(snapshot, now);
    replay.add(snapshot, now);
    if (stage.course.id === course) stage.observe?.(snapshot);
    if (!changingCourse && !lostContext && !reduceMotion.matches && current.frame >= 0 && current.phase === 'demo'
      && (snapshot.phase === 'grid' || snapshot.phase === 'practice')) {
      splash.dataset.stage = 'launch';
    }
    if (snapshot.phase !== current.phase) homeLogo.hidden = snapshot.phase !== 'demo';
    current = snapshot;
    const nextNight = snapshot.config?.night === true;
    if (night !== nextNight) {
      night = nextNight;
      setNight(night);
      stage.setNight(night);
      lastShadow = -Infinity;
      for (const car of cars) car.setNight(night);
    }
    ownedSlots = snapshot.cars.flatMap((car, i) => car.owned && car.active !== false ? [i] : []);
    controls.setPlayerCount(ownedSlots.length);
    if (stage.course.id === course) {
      stage.signs.board(snapshot);
      stage.signs.lights(snapshot.lights);
    }
    results.update(snapshot);
  }

  let retry = 250;
  let connected = pages;
  const updateAudioMute = () => audio.mute(!connected || document.hidden || lostContext);
  function connect() {
    const endpoint = new URL('/live', location.href);
    endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(endpoint);
    socket.addEventListener('open', () => {
      retry = 250;
      connected = true;
      updateAudioMute();
    });
    socket.addEventListener('message', ({ data }) => {
      let message: DisplayMessage;
      try { message = JSON.parse(data); } catch { return; }
      if (!message || lobby?.handle(message, socket)) return;
      if (message.type === 'hello' && typeof message.url === 'string') {
        placard.setUrl(message.url);
      } else if (message.type === 'state' && message.state?.cars?.length === cars.length) {
        updateState(message.state);
      }
    });
    socket.addEventListener('close', () => {
      connected = false;
      lobby?.disconnect();
      updateAudioMute();
      setTimeout(connect, retry);
      retry = Math.min(5000, retry * 1.8);
    });
  }
  let solo: ReturnType<typeof startSolo> | undefined;

  for (const event of ['pointerdown', 'click', 'keydown']) addEventListener(event, audio.unlock, { passive: true });
  document.addEventListener('visibilitychange', updateAudioMute);
  document.addEventListener('visibilitychange', () => budget.reset(performance.now()));
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    lostContext = true;
    splash.dataset.stage = 'loading';
    updateAudioMute();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    lastShadow = -Infinity;
    restoreReflections();
    if (!lowQuality) stage.captureReflections?.(renderer, scene);
    disposeCollectorBackdrop(renderer);
    displayWindow = buildCollectorBackdrop(renderer);
    resize();
    lostContext = false;
    warmedDique = false;
    changingCourse = false;
    if (stage.course.id !== desiredCourse) {
      const pending = desiredCourse;
      desiredCourse = stage.course.id;
      selectCourse(pending);
    }
    updateAudioMute();
  });

  function frame(now: number) {
    requestAnimationFrame(frame);
    if (lostContext) return;
    const elapsed = now - lastFrame;
    const dt = Math.min(0.05, elapsed / 1000);
    lastFrame = now;
    if (changingCourse) return;
    if (adaptive && budget.sample(now, elapsed)) resizeBuffer();
    solo?.advance(dt, now);
    const course = stage.course;
    stage.update(now);
    const mode = controls.mode;
    const split = controls.split && ownedSlots.length > 1;
    const matchingCourse = (current.config?.course ?? 'taller') === course.id;
    const moment = matchingCourse ? replay.sample(now) : null;
    const nextFourPanes = split && ownedSlots.length > 2 && !moment;
    if (fourPanes !== nextFourPanes) {
      fourPanes = nextFourPanes;
      lastShadow = -Infinity;
      for (const car of cars) car.setProjectedShadow(course.id === 'taller' && !fourPanes);
      stage.setDetail?.(!fourPanes);
      if (adaptive) { budget.reset(now); resizeBuffer(); }
    }
    // The larger harbor keeps a static scenery map. Cars have separate contact shadows.
    const dynamicShadows = course.id === 'taller' && !fourPanes;
    if (!lowQuality && (lastShadow === -Infinity || (dynamicShadows && now - lastShadow >= 32))) {
      renderer.shadowMap.needsUpdate = true;
      lastShadow = now;
    }
    const slot = (mode === 'broadcast' ? current.order[0] : ownedSlots[0]) ?? current.order[0] ?? 0;
    const slots = split ? ownedSlots : [slot];
    results.showReplay(moment);
    const live = moment ?? (matchingCourse ? clock.sample(now) : null);
    const progress = live?.alpha ?? 0;
    const display = matchingCourse ? current : preview;
    const toState = live?.to ?? display;
    const fromState = live?.from ?? display;
    const tick = THREE.MathUtils.lerp(fromState.frame, toState.frame, progress);
    const subject = moment ? toState.cars[moment.slot] : undefined;
    const partnerSlot = moment ? moment.rival ?? replayCompanion(toState.cars, moment.slot) : -1;
    let focus: CarView | undefined;
    let partner: CarView | undefined;
    toState.cars.forEach((car, i) => {
      const from = fromState.cars[i];
      const dx = car.x - from.x;
      const dz = car.z - from.z;
      const jump = dx * dx + dz * dz > 4.4 || car.active !== from.active;
      const alpha = jump ? 1 : progress;
      const turn = Math.atan2(Math.sin(car.yaw - from.yaw), Math.cos(car.yaw - from.yaw));
      const yaw = from.yaw + turn * alpha;
      const view: CarView = {
        ...car,
        x: from.x + dx * alpha,
        y: THREE.MathUtils.lerp(from.y, car.y, alpha),
        z: from.z + dz * alpha,
        yaw,
        speed: THREE.MathUtils.lerp(from.speed, car.speed, alpha),
        steer: THREE.MathUtils.lerp(from.steer, car.steer, alpha),
      };
      if (!jump && from.distance !== undefined && car.distance !== undefined) {
        const half = course.length / 2;
        const step = course.wrap(car.distance - from.distance + half) - half;
        view.distance = course.wrap(from.distance + step * alpha);
      }
      if (car.sound && from.sound) {
        view.sound = {
          throttle: THREE.MathUtils.lerp(from.sound.throttle, car.sound.throttle, alpha),
          curb: THREE.MathUtils.lerp(from.sound.curb, car.sound.curb, alpha),
          runoff: THREE.MathUtils.lerp(from.sound.runoff, car.sound.runoff, alpha),
          gravel: THREE.MathUtils.lerp(from.sound.gravel ?? 0, car.sound.gravel ?? 0, alpha),
          grass: THREE.MathUtils.lerp(from.sound.grass ?? 0, car.sound.grass ?? 0, alpha),
          slip: THREE.MathUtils.lerp(from.sound.slip, car.sound.slip, alpha),
          scrape: THREE.MathUtils.lerp(from.sound.scrape, car.sound.scrape, alpha),
        };
      }
      if (car.transmission && from.transmission) {
        const selected = alpha < 1 ? from.transmission : car.transmission;
        view.transmission = {
          gear: selected.gear,
          shift: selected.shift,
          rev: from.transmission.gear === car.transmission.gear
            ? THREE.MathUtils.lerp(from.transmission.rev, car.transmission.rev, alpha)
            : selected.rev,
        };
      }
      if (car.suspension && from.suspension) {
        view.suspension = {
          pitch: THREE.MathUtils.lerp(from.suspension.pitch, car.suspension.pitch, alpha),
          roll: THREE.MathUtils.lerp(from.suspension.roll, car.suspension.roll, alpha),
          heave: THREE.MathUtils.lerp(from.suspension.heave, car.suspension.heave, alpha),
        };
      }
      const road = view.distance === undefined
        ? course.locate(view.x, view.z, { y: view.y }) : course.sampleAt(view.distance);
      const lateral = (view.z - road.z) * road.dx - (view.x - road.x) * road.dz;
      const along = road.dx * Math.sin(yaw) + road.dz * Math.cos(yaw);
      const across = road.dx * Math.cos(yaw) - road.dz * Math.sin(yaw);
      const bank = course.bankAt(road.s);
      const grade = (course.heightAt(road.s + 0.75, lateral) - course.heightAt(road.s - 0.75, lateral)) / 1.5;
      const slope = grade * along + bank * across;
      const bankRoll = Math.atan(grade * across - bank * along);
      interpolated[i] = view;
      const closeView = mode !== 'general' && slots.length <= 2 && slots.includes(i);
      cars[i].setDetail(!lowQuality && (closeView
        || (subject !== undefined && Math.hypot(car.x - subject.x, car.z - subject.z) < 7.0)));
      cars[i].update(view, dt, slope, now, approachingCover(road.s, 4, course) > 0.24, bankRoll, course);
      if (moment?.slot === i) focus = view;
      if (partnerSlot === i) partner = view;
    });
    stage.barriers(moment?.from ?? display, tick, dt, !!moment);
    stage.tyreMarks(interpolated, display.heat, !!moment);
    stage.signs.flag(toState.flag, now / 1000);
    let listener: THREE.Camera;
    if (focus && moment) {
      if (!replaying) { lightShot(true); renderer.shadowMap.needsUpdate = true; }
      replaying = true;
      placard.setGrounded(false);
      replayShot ??= buildReplayShot(renderer, course);
      if (replayClip !== moment.clip) replayShot.stop();
      replayClip = moment.clip;
      listener = replayShot.render(scene, focus, partner, width, height, dt, placard, moment.kind, lowQuality);
    } else {
      if (replaying) {
        replaying = false;
        replayClip = -1;
        lightShot(false);
        renderer.shadowMap.needsUpdate = true;
        replayShot?.stop();
        placard.resize(camera, width, height);
      }
      listener = renderViews(scene, mode, interpolated, slots, width, height, dt);
    }
    if (splash.dataset.stage === 'loading') splash.dataset.stage = 'ready';
    audio.update({
      state: moment?.from ?? display,
      cars: interpolated,
      camera: listener,
      view: focus ? 'replay' : split ? 'general' : mode,
      focus: moment?.slot ?? slot,
      tick,
      dt,
    });
  }
  if (!lowQuality) {
    await renderer.compileAsync(scene, camera);
    // Draw once behind the loading screen so the GPU uploads the visible meshes and textures before play.
    if (!lostContext) renderer.render(scene, camera);
    if (!pages) {
      const compactCamera = camera.clone();
      cameraLights(compactCamera, true, 0);
      await renderer.compileAsync(scene, compactCamera);
      if (!lostContext) renderer.render(scene, compactCamera);
    }
  }
  solo = pages ? startSolo(updateState, selectCourse) : undefined;
  updateAudioMute();
  if (!pages) connect();
  lastFrame = performance.now();
  requestAnimationFrame(frame);
}

void bootstrap().catch(error => {
  console.error(error);
  homeLogo.hidden = splash.hidden = true;
  canvas.hidden = true;
  document.querySelector<HTMLElement>('#fallback')!.hidden = false;
});
