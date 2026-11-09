import * as THREE from 'three';
import { type CarView, type RaceSnapshot } from '../shared/protocol';
import { ROAD_HALF, TRACK, WALL_HALF } from '../shared/track';
import { raceAudio } from './audio';
import { instanceStatic } from './batches';
import { buildCars } from './cars';
import { buildCircuit } from './circuit';
import { buildCollectorBackdrop } from './collector-backdrop';
import { buildGrandstands } from './grandstands';
import { buildInfield } from './infield';
import { BENCH_SURFACE, plankMap } from './materials';
import { buildRaceViews } from './race-views';
import { ReplayHistory, replayCompanion } from './replay';
import { buildReplayShot } from './replay-shot';
import { buildSceneLighting } from './scene-lighting';
import { buildPlacard, buildRaceSigns, placardLayout } from './signs';
import { buildViewControls } from './view-controls';
import { buildWorkshop } from './workshop';

type DisplayMessage = { type: 'hello'; url: string } | { type: 'state'; state: RaceSnapshot };

const canvas = document.querySelector<HTMLCanvasElement>('#track')!;
const lowQuality = new URLSearchParams(location.search).get('quality') === 'low';
// Fit to the projected centerline and finish stripe annotated in img01 of the atlas.
const target = new THREE.Vector3(-2.29, 0.11, 1.745);
const eyeDirection = new THREE.Vector3(-0.338, 0.779, 0.625).normalize();

function atEdge(p: (typeof TRACK.samples)[number], offset: number, y: number) {
  return new THREE.Vector3(p.x - p.dz * offset, y, p.z + p.dx * offset);
}

function cameraFit(camera: THREE.PerspectiveCamera) {
  const deck = TRACK.samples.map(p => atEdge(p, WALL_HALF + 1.22, BENCH_SURFACE));
  const fence = TRACK.samples.map(p => atEdge(p, WALL_HALF + 0.04, p.y + 0.84));
  const road = TRACK.samples.flatMap(p => [-1, 1].map(side => atEdge(p, side * (ROAD_HALF + 0.47), p.y + 0.14)));
  const point = new THREE.Vector3();
  return (width: number, height: number) => {
    const qr = placardLayout(width, height);
    const qrLeft = 2 * (qr.left - 11) / width - 1;
    const qrTop = 1 - 2 * (qr.top - 11) / height;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const position = (distance: number) => {
      camera.position.copy(target).addScaledVector(eyeDirection, distance);
      camera.lookAt(target);
      // The oblique view exposes the flanks while keeping the finish straight level.
      camera.rotateZ(0.383);
      camera.updateMatrixWorld();
    };

    let near = 20;
    let far = Math.max(180, 175 / camera.aspect);
    for (let i = 0; i < 20; i++) {
      const distance = (near + far) / 2;
      position(distance);
      const clips = deck.some(bounds => {
        point.copy(bounds).project(camera);
        return Math.abs(point.x) > (camera.aspect >= 1.5 ? 1.031 : 0.986) || point.y < -0.80;
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

function bootstrap() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.97;
  renderer.shadowMap.enabled = !lowQuality;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x211917);
  const camera = new THREE.PerspectiveCamera(27, 1, 0.3, 400);
  const fit = cameraFit(camera);
  const wood = plankMap();
  const workshop = new THREE.Group();
  const backWall = buildWorkshop(workshop);
  buildGrandstands(workshop);
  instanceStatic(workshop);
  const circuit = new THREE.Group();
  buildCircuit(circuit, wood);
  instanceStatic(circuit);
  scene.add(workshop, circuit);
  const infield = buildInfield(scene);
  const { lightShot } = buildSceneLighting(scene, renderer, lowQuality);
  if (!lowQuality) infield.captureReflections(renderer, scene);
  const cars = buildCars(scene);
  const signs = buildRaceSigns(scene);
  const placard = buildPlacard(scene);
  const controls = buildViewControls();
  const renderViews = buildRaceViews(renderer, camera, placard, cameraFit, {
    wall: backWall,
    build: () => buildCollectorBackdrop(renderer),
  });
  const audio = raceAudio();
  const replay = new ReplayHistory();
  let replayShot: ReturnType<typeof buildReplayShot> | undefined;
  let replaying = false;

  let width = 1, height = 1;
  function resize() {
    width = Math.max(1, canvas.clientWidth);
    height = Math.max(1, canvas.clientHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, lowQuality ? 1 : 1.55));
    renderer.setSize(width, height, false);
    fit(width, height);
    placard.resize(camera, width, height);
  }
  resize();
  addEventListener('resize', resize);

  const initial: RaceSnapshot = {
    frame: -1, heat: 0, phase: 'demo', lights: 0, flag: false, order: [0, 1, 2, 3],
    cars: cars.map((_, i) => {
      const p = TRACK.sampleAt(7 + i * TRACK.length / 4);
      return { x: p.x, y: p.y, z: p.z, yaw: Math.atan2(p.dx, p.dz), speed: 0, lap: 0, owned: false, blink: false, braking: false, steer: 0 };
    }),
  };
  let current = initial;
  let previous = current;
  let received = performance.now();
  let interval = 50;
  let lastFrame = received;
  let lostContext = false;
  let ownedSlots: number[] = [];
  const interpolated: CarView[] = [...initial.cars];
  signs.board(initial);

  function updateState(snapshot: RaceSnapshot) {
    const now = performance.now();
    replay.add(snapshot, now);
    const snap = current.frame < 0 || snapshot.heat !== current.heat || snapshot.frame <= current.frame || now - received > 420;
    previous = snap ? snapshot : current;
    current = snapshot;
    ownedSlots = snapshot.cars.flatMap((car, i) => car.owned ? [i] : []);
    controls.setPlayerCount(ownedSlots.length);
    interval = snap ? 50 : THREE.MathUtils.clamp(now - received, 28, 94);
    received = now;
    signs.board(snapshot);
    signs.lights(snapshot.lights);
    audio.update(snapshot);
  }

  let retry = 250;
  function connect() {
    const endpoint = new URL('/live', location.href);
    endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(endpoint);
    socket.addEventListener('open', () => { retry = 250; });
    socket.addEventListener('message', ({ data }) => {
      let message: DisplayMessage;
      try { message = JSON.parse(data); } catch { return; }
      if (message.type === 'hello' && typeof message.url === 'string') {
        placard.setUrl(message.url);
      } else if (message.type === 'state' && message.state?.cars?.length === cars.length) {
        updateState(message.state);
      }
    });
    socket.addEventListener('close', () => {
      audio.mute(true);
      setTimeout(connect, retry);
      retry = Math.min(5000, retry * 1.8);
    });
    socket.addEventListener('open', () => audio.mute(document.hidden));
  }
  connect();

  for (const event of ['pointerdown', 'keydown']) addEventListener(event, audio.unlock, { passive: true });
  document.addEventListener('visibilitychange', () => audio.mute(document.hidden));
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    lostContext = true;
  });
  canvas.addEventListener('webglcontextrestored', () => { lostContext = false; resize(); });

  function frame(now: number) {
    requestAnimationFrame(frame);
    if (lostContext) return;
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    infield.update(now);
    const mode = controls.mode;
    const split = controls.split && ownedSlots.length > 1;
    const slot = ownedSlots[0] ?? current.order[0] ?? 0;
    const slots = split ? ownedSlots : [slot];
    const moment = lowQuality || split || mode !== 'general' ? null : replay.sample(now);
    const progress = moment?.alpha ?? THREE.MathUtils.clamp((now - received) / interval, 0, 1);
    const toState = moment?.to ?? current;
    const fromState = moment?.from ?? previous;
    const subject = moment ? toState.cars[moment.slot] : undefined;
    const partnerSlot = moment ? replayCompanion(toState.cars, moment.slot) : -1;
    let focus: CarView | undefined;
    let partner: CarView | undefined;
    toState.cars.forEach((car, i) => {
      const from = fromState.cars[i];
      const dx = car.x - from.x;
      const dz = car.z - from.z;
      const jump = dx * dx + dz * dz > 4.4;
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
      let slope = 0;
      if (view.y > 0.005) {
        const road = TRACK.locate(view.x, view.z);
        const grade = (TRACK.sampleAt(road.s + 0.75).y - TRACK.sampleAt(road.s - 0.75).y) / 1.5;
        slope = grade * (road.dx * Math.sin(yaw) + road.dz * Math.cos(yaw));
      }
      interpolated[i] = view;
      const closeView = mode !== 'general' && slots.includes(i);
      cars[i].setDetail(!lowQuality && (closeView
        || (subject !== undefined && Math.hypot(car.x - subject.x, car.z - subject.z) < 7.0)));
      cars[i].update(view, dt, slope, now);
      if (moment?.slot === i) focus = view;
      if (partnerSlot === i) partner = view;
    });
    signs.flag(toState.flag, now / 1000);
    if (focus) {
      if (!replaying) lightShot(true);
      replaying = true;
      placard.setGrounded(false);
      replayShot ??= buildReplayShot(renderer);
      replayShot.render(scene, focus, partner, width, height, dt, placard);
    } else {
      if (replaying) {
        replaying = false;
        lightShot(false);
        replayShot?.stop();
        placard.resize(camera, width, height);
      }
      renderViews(scene, mode, interpolated, slots, width, height, dt);
    }
  }
  requestAnimationFrame(frame);
}

try {
  bootstrap();
} catch (error) {
  console.error(error);
  canvas.hidden = true;
  document.querySelector<HTMLElement>('#fallback')!.hidden = false;
}
