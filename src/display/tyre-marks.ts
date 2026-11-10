import * as THREE from 'three';
import type { CarView } from '../shared/protocol';
import { CAR_DIMENSIONS } from '../shared/car-dimensions';
import { TRACK } from '../shared/track';

const capacity = 2304;

export function buildTyreMarks(parent: THREE.Object3D) {
  const geometry = new THREE.BufferGeometry();
  const positions = new THREE.BufferAttribute(new Float32Array(capacity * 18), 3).setUsage(THREE.DynamicDrawUsage);
  const density = new THREE.BufferAttribute(new Float32Array(capacity * 6), 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positions);
  geometry.setAttribute('density', density);
  geometry.setDrawRange(0, 0);
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2,
    vertexShader: `
      attribute float density;
      varying float opacity;
      void main() {
        opacity = density;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying float opacity;
      void main() {
        gl_FragColor = vec4(0.037, 0.026, 0.021, opacity);
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Marcas de frenada y goma de carrera';
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  parent.add(mesh);

  const previous: (CarView | undefined)[] = [];
  const corners = Array.from({ length: 4 }, () => new THREE.Vector3());
  const order = [0, 1, 2, 1, 3, 2];
  let cursor = 0;
  let written = 0;
  let heat = -1;

  function wheelEdges(car: CarView, slot: number, side: number, width: number, first: number) {
    const tyre = CAR_DIMENSIONS[slot];
    const sin = Math.sin(car.yaw), cos = Math.cos(car.yaw);
    for (const edge of [0, 1]) {
      const offset = side * tyre.tireOffset + (edge - 0.5) * width;
      const x = car.x - sin * tyre.axle + cos * offset;
      const z = car.z - cos * tyre.axle - sin * offset;
      const road = TRACK.locate(x, z, { s: car.distance, y: car.y });
      const surface = TRACK.surfaceAt(road.s, road.offset);
      if (surface === 'gravel' || surface === 'grass') return false;
      corners[first + edge].set(x, TRACK.heightAt(road.s, road.offset) + 0.013, z);
    }
    return true;
  }

  function strip(from: CarView, to: CarView, slot: number, side: number, width: number, alpha: number) {
    if (!wheelEdges(from, slot, side, width, 0) || !wheelEdges(to, slot, side, width, 2)) return;
    const start = cursor * 6;
    for (let i = 0; i < order.length; i++) {
      const point = corners[order[i]];
      positions.setXYZ(start + i, point.x, point.y, point.z);
      density.setX(start + i, alpha * (order[i] < 2 ? 0.88 : 1));
    }
    positions.addUpdateRange(start * 3, 18);
    density.addUpdateRange(start, 6);
    cursor = (cursor + 1) % capacity;
    written = Math.min(capacity, written + 1);
  }

  return (cars: readonly CarView[], nextHeat: number, replay: boolean) => {
    if (nextHeat !== heat || replay) {
      heat = nextHeat;
      previous.length = 0;
    }
    if (replay) return;
    const before = cursor;
    for (const [slot, car] of cars.entries()) {
      const from = previous[slot];
      const slip = car.sound?.slip ?? 0;
      const braking = car.braking ? THREE.MathUtils.smoothstep(car.speed, 3.1, 8.9) * 0.92 : 0;
      const demand = Math.max(slip, braking);
      if (!from || car.active === false || car.speed < 2.3 || car.blink || demand < 0.32) {
        previous[slot] = car;
        continue;
      }
      const travel = Math.hypot(car.x - from.x, car.z - from.z);
      if (travel < 0.13) continue;
      previous[slot] = car;
      if (travel > 0.92 || Math.abs(car.y - from.y) > 0.39) continue;
      const intensity = (demand - 0.27) * (0.42 + 0.06 * Math.sin(written * 2.4));
      const width = 0.037 + demand * 0.042;
      strip(from, car, slot, -1, width, intensity);
      strip(from, car, slot, 1, width, intensity);
    }
    if (cursor !== before) {
      geometry.setDrawRange(0, written * 6);
      positions.needsUpdate = density.needsUpdate = true;
    }
  };
}
