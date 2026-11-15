import * as THREE from 'three';
import { CAR_DIMENSIONS } from '../shared/car-dimensions';
import type { Course } from '../shared/courses';
import type { CarView, RaceImpact, RaceSnapshot } from '../shared/protocol';
import { barrierTangent } from '../sim/road-contact';
import { random } from './materials';

const CAPACITY = 144;
const TICK_SECONDS = 1 / 60;
const MAX_HIT_DELAY = 11;
const GRAVITY = 9.6;

interface SparkFrame {
  course: Course;
  from: RaceSnapshot;
  to: RaceSnapshot;
  cars: readonly CarView[];
  tick: number;
  now: number;
  replayClip?: number;
  reduced?: boolean;
}

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  floor: number; tick: number; born: number;
  life: number; width: number; tail: number;
  bright: number; flash: boolean;
}

function hitDirection(hit: RaceImpact, cars: readonly CarView[], course: Course) {
  let nearest: CarView | undefined;
  let runnerUp: CarView | undefined;
  let best = 12.25;
  let second = best;
  for (const car of cars) {
    if (car.active === false || Math.abs(car.y + 0.20 - hit.y) > 0.83) continue;
    const score = (car.x - hit.x) ** 2 + (car.z - hit.z) ** 2;
    if (score < best) {
      second = best;
      runnerUp = nearest;
      best = score;
      nearest = car;
    } else if (score < second) {
      second = score;
      runnerUp = car;
    }
  }
  const vx = nearest ? Math.sin(nearest.yaw) * nearest.speed : 0;
  const vz = nearest ? Math.cos(nearest.yaw) * nearest.speed : 0;
  if (hit.distance !== undefined && hit.side !== undefined) {
    const { dx, dz } = barrierTangent(hit.distance, hit.side, course);
    const along = dx * vx + dz * vz;
    const travel = along < 0 ? -1 : 1;
    return { tx: dx * travel, tz: dz * travel, nx: dz * hit.side, nz: -dx * hit.side, carry: Math.min(3.1, Math.abs(along) * 0.31) };
  }
  if (nearest && runnerUp) {
    const dx = runnerUp.x - nearest.x;
    const dz = runnerUp.z - nearest.z;
    const length = Math.hypot(dx, dz);
    if (length > 0.03) {
      const nx = dx / length, nz = dz / length;
      const along = (vx + Math.sin(runnerUp.yaw) * runnerUp.speed) * -nz
        + (vz + Math.cos(runnerUp.yaw) * runnerUp.speed) * nx;
      const travel = along < 0 ? -1 : 1;
      return { tx: -nz * travel, tz: nx * travel, nx, nz, carry: Math.min(2.7, Math.abs(along) * 0.18) };
    }
  }
  const heading = Math.hypot(vx, vz);
  const tx = heading > 0.1 ? vx / heading : 0, tz = heading > 0.1 ? vz / heading : 1;
  return { tx, tz, nx: tz, nz: -tx, carry: Math.min(2.8, heading * 0.22) };
}

const vertexShader = `
  attribute vec3 pHead;
  attribute vec3 pTail;
  attribute vec4 pVisual;
  uniform float viewportHeight;
  varying vec2 sparkUv;
  varying vec3 sparkVisual;

  void main() {
    vec4 head = modelViewMatrix * vec4(pHead, 1.0);
    vec4 tail = modelViewMatrix * vec4(pTail, 1.0);
    float nearPlane = projectionMatrix[3][2] / (projectionMatrix[2][2] - 1.0);
    float nearFade = smoothstep(nearPlane * 1.1, nearPlane * 1.8, -head.z);
    if (tail.z > -nearPlane && head.z < -nearPlane) {
      tail = mix(head, tail, (-nearPlane - head.z) / (tail.z - head.z));
    }
    vec2 flight = head.xy - tail.xy;
    float extent = length(flight);
    vec2 forward = extent > 0.0001 ? flight / extent : vec2(0.0, 1.0);
    vec2 right = vec2(forward.y, -forward.x);
    float pixel = max(0.1, -head.z) * 2.0 / (viewportHeight * projectionMatrix[1][1]);
    vec4 point;
    if (pVisual.w > 0.5) {
      point = head;
      point.xy += position.xy * max(pVisual.x, min(0.46, pixel * 2.15));
    } else {
      point = mix(tail, head, uv.y);
      float width = max(pVisual.x, min(0.12, pixel * 0.70));
      point.xy += right * position.x * width * mix(0.30, 1.0, uv.y);
      point.xy += forward * position.y * max(0.0, min(0.10, pixel * 0.67) - extent * 0.5);
    }
    sparkUv = uv;
    sparkVisual = vec3(pVisual.y * nearFade, pVisual.zw);
    gl_Position = projectionMatrix * point;
  }
`;

const fragmentShader = `
  varying vec2 sparkUv;
  varying vec3 sparkVisual;

  void main() {
    vec3 amber = vec3(1.0, 0.26, 0.035);
    vec3 whiteHot = vec3(1.0, 0.89, 0.60);
    float alpha;
    float warmth;
    if (sparkVisual.z > 0.5) {
      vec2 centered = sparkUv * 2.0 - 1.0;
      float radius = dot(centered, centered);
      float ring = exp(-5.5 * radius) * (1.0 - smoothstep(0.45, 1.0, radius));
      float core = exp(-27.0 * radius);
      warmth = 0.45 + 0.55 * core;
      alpha = sparkVisual.x * (0.56 * ring + 0.74 * core);
    } else {
      float edge = abs(sparkUv.x * 2.0 - 1.0);
      float profile = pow(max(0.0, 1.0 - edge), 0.75);
      float tip = smoothstep(0.34, 0.98, sparkUv.y);
      warmth = 0.16 + 0.84 * tip * sparkVisual.y;
      alpha = sparkVisual.x * profile * smoothstep(0.0, 0.57, sparkUv.y);
    }
    gl_FragColor = vec4(mix(amber, whiteHot, warmth), alpha);
    #include <colorspace_fragment>
  }
`;

function sparkChannel() {
  return { impact: -1, tick: -Infinity, heat: -1 };
}

function particleHeight(particle: Particle, time: number) {
  return Math.max(particle.floor + 0.025, particle.y + particle.vy * time
    - (particle.flash ? 0 : GRAVITY * time * time * 0.5));
}

export function buildImpactSparks(scene: THREE.Object3D) {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setIndex([0, 1, 2, 2, 1, 3]);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
  const attribute = (name: string, size: number) => {
    const buffer = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * size), size);
    geometry.setAttribute(name, buffer.setUsage(THREE.DynamicDrawUsage));
    return buffer;
  };
  const head = attribute('pHead', 3);
  const tail = attribute('pTail', 3);
  const visual = attribute('pVisual', 4);
  const attributes = [head, tail, visual];
  const material = new THREE.ShaderMaterial({
    vertexShader, fragmentShader, uniforms: { viewportHeight: { value: 1 } },
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Chispas de colisión y roce';
  mesh.frustumCulled = false;
  mesh.renderOrder = 12;
  const viewport = new THREE.Vector4();
  mesh.onBeforeRender = renderer => {
    renderer.getCurrentViewport(viewport);
    material.uniforms.viewportHeight.value = Math.max(1, viewport.w);
    material.uniformsNeedUpdate = true;
  };
  scene.add(mesh);

  const pool: Particle[] = Array.from({ length: CAPACITY }, () => ({
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, floor: 0, tick: 0, born: 0,
    life: 0, width: 0, tail: 0, bright: 0, flash: false,
  }));
  const nextScrape = new Float64Array(CAR_DIMENSIONS.length);
  let count = 0;
  let clip: number | undefined;
  let live = sparkChannel();
  let replay = sparkChannel();

  function clear() {
    count = geometry.instanceCount = 0;
    mesh.visible = false;
    nextScrape.fill(-Infinity);
  }
  clear();

  function spawn(p: Particle) {
    if (count >= CAPACITY) return;
    Object.assign(pool[count++], p);
  }

  function burst(hit: RaceImpact, frame: SparkFrame, rate: number) {
    const strength = hit.strength;
    if (strength < 0.095) return;
    const fence = hit.kind === 'fence';
    const bodywork = hit.kind === 'car';
    const scale = fence ? 1 : bodywork ? 0.86 : 0.64;
    const n = Math.round((4 + 18 * strength) * scale * (frame.reduced ? 0.58 : 1));
    const wind = hitDirection(hit, frame.cars, frame.course);
    const rng = random(Math.imul(hit.id, 89719) ^ 0x944e8);
    const born = frame.now - (frame.tick - hit.frame) * TICK_SECONDS * 1000 / rate;
    const floor = hit.y - (bodywork ? 0.22 : 0.18);
    if (strength >= 0.19) spawn({
      x: hit.x, y: hit.y + 0.035, z: hit.z, vx: 0, vy: 0, vz: 0,
      floor, tick: hit.frame, born, life: 0.065 + strength * 0.043,
      width: 0.15 + 0.29 * strength * scale, tail: 0, bright: Math.min(1, 0.40 + strength * 0.63) * scale, flash: true,
    });
    for (let i = 0; i < n; i++) {
      const distance = (1.2 + 4.45 * strength) * (0.36 + rng() * 0.8);
      const tangent = distance * (0.38 + rng() * 0.90) * (rng() < (bodywork ? 0.47 : 0.27) ? -1 : 1) + wind.carry;
      const across = distance * (0.20 + rng() * 0.68) * (bodywork && rng() < 0.5 ? -1 : 1);
      const y = hit.y + 0.014 + rng() * 0.062;
      spawn({
        x: hit.x + wind.nx * 0.018, y, z: hit.z + wind.nz * 0.018,
        vx: wind.tx * tangent + wind.nx * across, vy: (0.43 + 2.72 * rng()) * (0.56 + 0.44 * strength),
        vz: wind.tz * tangent + wind.nz * across, floor, tick: hit.frame, born,
        life: 0.11 + (0.08 + 0.12 * strength) * rng(), width: (0.014 + 0.020 * rng()) * (0.79 + 0.21 * strength),
        tail: 0.044 + (0.025 + 0.023 * strength) * rng(), bright: (0.49 + 0.51 * rng()) * (0.46 + 0.54 * strength) * scale,
        flash: false,
      });
    }
  }

  function scrape(frame: SparkFrame) {
    if (frame.to.phase !== 'race' && frame.to.phase !== 'practice') return;
    const { course, cars, tick, now } = frame;
    for (const [slot, car] of cars.entries()) {
      const scuff = car.sound?.scrape ?? 0;
      if (slot >= nextScrape.length || tick < nextScrape[slot] || car.active === false || scuff < 0.37
        || Math.abs(car.speed) < 2.3 || car.distance === undefined) continue;
      const road = course.sampleAt(car.distance);
      const offset = (car.z - road.z) * road.dx - (car.x - road.x) * road.dz;
      const side = offset < 0 ? -1 : 1;
      const edge = course.wallHalfAt(road.s, side);
      const dimensions = CAR_DIMENSIONS[slot];
      const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
      const outward = (fz * road.dx - fx * road.dz) * side;
      const along = fx * road.dx + fz * road.dz;
      const spine = outward > 0 ? dimensions.front - dimensions.halfWidth : dimensions.halfWidth - dimensions.rear;
      if (Math.abs(offset) + dimensions.halfWidth + outward * spine < edge - 0.14) continue;
      const point = course.sampleAt(road.s + along * spine);
      const wall = side * course.wallHalfAt(point.s, side);
      const y = course.heightAt(point.s, wall);
      const travel = along * car.speed < 0 ? -1 : 1;
      const rng = random(Math.imul(Math.floor(tick) + 1, 44633) ^ (slot * 14381));
      nextScrape[slot] = tick + (frame.reduced ? 9 : 5) + 4 * rng();
      for (let i = 0; i < (!frame.reduced && scuff > 0.61 ? 2 : 1); i++) {
        const speed = (0.9 + 0.25 * Math.abs(car.speed)) * (0.66 + rng() * 0.7) * travel;
        const inward = (0.18 + 0.57 * rng()) * side;
        spawn({
          x: point.x - point.dz * wall, y: y + 0.16 + rng() * 0.08, z: point.z + point.dx * wall,
          vx: point.dx * speed + point.dz * inward, vy: 0.45 + rng() * 0.92,
          vz: point.dz * speed - point.dx * inward, floor: y, tick, born: now,
          life: 0.09 + 0.08 * rng(), width: 0.012 + rng() * 0.013,
          tail: 0.056 + rng() * 0.046, bright: 0.59 * scuff, flash: false,
        });
      }
    }
  }

  function paint(frame: SparkFrame, rate: number) {
    if (count === 0) return;
    for (let i = 0; i < count;) {
      const p = pool[i];
      const age = Math.max((frame.tick - p.tick) * TICK_SECONDS, (frame.now - p.born) * rate * 0.001);
      const life = age / p.life;
      if (life >= 1) {
        pool[i] = pool[--count];
        pool[count] = p;
        continue;
      }
      const lag = Math.max(0, age - p.tail);
      head.setXYZ(i, p.x + p.vx * age, particleHeight(p, age), p.z + p.vz * age);
      tail.setXYZ(i, p.x + p.vx * lag, particleHeight(p, lag), p.z + p.vz * lag);
      visual.setXYZW(i, p.width * (p.flash ? 0.73 + life * 0.64 : 1 - 0.38 * life),
        p.bright * (1 - life) ** (p.flash ? 1.9 : 0.72), 1 - life * 0.85, Number(p.flash));
      i++;
    }
    geometry.instanceCount = count;
    mesh.visible = count > 0;
    if (count === 0) return;
    for (const buffer of attributes) {
      buffer.clearUpdateRanges();
      buffer.addUpdateRange(0, count * buffer.itemSize);
      buffer.needsUpdate = true;
    }
  }

  function consume(state: RaceSnapshot, frame: SparkFrame, rate: number, channel: ReturnType<typeof sparkChannel>) {
    for (const hit of state.impacts ?? []) {
      if (hit.id <= channel.impact || frame.tick < hit.frame) continue;
      channel.impact = hit.id;
      if (frame.tick - hit.frame <= MAX_HIT_DELAY) burst(hit, frame, rate);
    }
  }

  return {
    reset() {
      clear();
      live = sparkChannel();
      replay = sparkChannel();
      clip = undefined;
    },
    update(frame: SparkFrame) {
      if (frame.replayClip !== clip) {
        clear();
        replay = sparkChannel();
        clip = frame.replayClip;
      }
      const rate = clip === undefined ? 1 : 0.8;
      const channel = clip === undefined ? live : replay;
      if (frame.to.heat !== channel.heat || frame.tick < channel.tick) {
        clear();
        channel.impact = -1;
        channel.heat = frame.to.heat;
      }
      channel.tick = frame.tick;
      consume(frame.from, frame, rate, channel);
      if (frame.to !== frame.from) consume(frame.to, frame, rate, channel);
      scrape(frame);
      paint(frame, rate);
    },
  };
}
