import * as THREE from 'three';
import { PIT_LANE, TRACK, wallHalfAt } from '../shared/track';
import type { RaceSnapshot } from '../shared/protocol';
import { instanceStatic } from './batches';
import { box, canvas2d, standard, texture } from './materials';
import { sceneryLights } from './render-layers';
import { marshalSignal, nearestCar, pitGateOpen } from './world-cues';

const steel = standard(0x83847c, 0.46, 0.6);
const cast = standard(0x383b38, 0.62, 0.38);
const cream = standard(0xd0c5ad, 0.57, 0.16);
const amber = standard(0xd78835, 0.57, 0.14);
const jacket = standard(0xd37b2e, 0.8);
const skin = standard(0xae7756, 0.82);
const lens = standard(0x3b5671, 0.22, 0.53);
const green = new THREE.Color(0x92e197);
const red = new THREE.Color(0xe45942);
const yellow = new THREE.Color(0xf6b94a);
const white = new THREE.Color(0xf2e7cc);
const idle = new THREE.Color(0x82684d);
const orb = new THREE.SphereGeometry(1, 12, 8);
const up = new THREE.Vector3(0, 1, 0);

function coursePoint(s: number, offset: number, lift = 0) {
  const p = TRACK.sampleAt(s);
  return new THREE.Vector3(p.x - p.dz * offset, p.y + lift, p.z + p.dx * offset);
}

function align(object: THREE.Object3D, s: number, offset: number) {
  const p = TRACK.sampleAt(s);
  object.position.copy(coursePoint(s, offset));
  object.rotation.y = Math.atan2(-p.dz, p.dx);
}

function lightLens(parent: THREE.Object3D, color: THREE.ColorRepresentation, size: number) {
  const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.32, roughness: 0.29 });
  const dome = new THREE.Mesh(orb, material);
  dome.scale.set(size, size * 1.15, size);
  parent.add(dome);
  return dome;
}

function pitGate(fixed: THREE.Object3D, animated: THREE.Object3D, s: number, label: string) {
  const outer = -wallHalfAt(s, -1) - 0.42;
  const gate = new THREE.Group();
  gate.name = `Portón de servicio · ${label}`;
  align(gate, s, outer);
  fixed.add(gate);
  box(gate, cast, 0, 0.041, 0, 0.34, 0.082, 0.28);
  box(gate, cast, 0, 0.42, 0, 0.16, 0.78, 0.15);
  box(gate, steel, 0, 0.78, 0, 0.19, 0.16, 0.18);
  box(gate, cast, 1.49, 0.38, 0, 0.11, 0.76, 0.13);
  box(gate, steel, 1.49, 0.053, 0, 0.27, 0.105, 0.26);

  const arm = new THREE.Group();
  arm.name = 'Brazo basculante fuera de pista';
  align(arm, s, outer);
  arm.position.y += 0.72;
  animated.add(arm);
  box(arm, cream, 0.69, 0, 0, 1.48, 0.105, 0.075);
  for (let i = 0; i < 4; i++) box(arm, amber, 0.21 + i * 0.34, 0, 0, 0.13, 0.111, 0.079, false);

  const signs = canvas2d(384, 100);
  const { context } = signs;
  context.fillStyle = '#262c2e'; context.fillRect(0, 0, 384, 100);
  context.fillStyle = '#e8b764'; context.fillRect(10, 10, 364, 4);
  context.fillStyle = '#f8e1b1'; context.font = '900 49px Arial';
  context.textAlign = 'center'; context.textBaseline = 'middle';
  context.fillText(label, 192, 58);
  const map = texture(signs.canvas);
  const panelMaterial = new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffca87, emissiveIntensity: 0.38, roughness: 0.68 });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.53, 0.40), panelMaterial);
  box(gate, cast, 0.94, 1.20, -0.07, 1.61, 0.46, 0.09);
  box(gate, steel, 1.49, 0.97, -0.07, 0.083, 0.68, 0.09);
  panel.position.set(0.94, 1.20, -0.02);
  gate.add(panel);
  const beacon = lightLens(gate, red, 0.076);
  beacon.position.set(1.81, 1.17, -0.05);
  const lamp = new THREE.SpotLight(0xffd194, 16, 8, 0.69, 0.82, 2);
  lamp.layers.set(sceneryLights);
  lamp.position.copy(coursePoint(s, outer, 1.49));
  lamp.target.position.copy(coursePoint(s + 1.3, PIT_LANE.offset, 0.025));
  fixed.add(lamp, lamp.target);
  return { arm, beacon, lamp, panelMaterial, approach: coursePoint(s, PIT_LANE.offset), open: false };
}

function cameraTower(fixed: THREE.Object3D, animated: THREE.Object3D, s: number, side: number) {
  const offset = side * (wallHalfAt(s, side) + 0.74);
  const tower = new THREE.Group();
  align(tower, s, offset);
  fixed.add(tower);
  box(tower, cast, 0, 0.039, 0, 0.31, 0.078, 0.35);
  box(tower, steel, 0, 1.06, 0, 0.081, 2.12, 0.082);
  box(tower, cast, 0, 0.27, 0, 0.123, 0.41, 0.124);
  const head = new THREE.Group();
  head.name = 'Cámara de pista con seguimiento';
  head.position.copy(coursePoint(s, offset, 2.10));
  animated.add(head);
  box(head, cream, 0, 0.045, 0.025, 0.22, 0.18, 0.40);
  box(head, cast, 0, 0.05, 0.227, 0.168, 0.131, 0.027, false);
  box(head, cream, 0, 0.137, 0.106, 0.251, 0.038, 0.48, false);
  const glass = new THREE.Mesh(orb, lens);
  glass.position.set(-0.013, 0.058, 0.247);
  glass.scale.set(0.047, 0.046, 0.020);
  head.add(glass);
  const pilot = lightLens(head, red, 0.015);
  pilot.position.set(0.059, 0.021, 0.245);
  const rest = coursePoint(s + 2.0, 0, 0.15);
  head.lookAt(rest);
  return { head, pilot, rest, near: coursePoint(s, 0), target: rest.clone(), following: false };
}

function marshal(fixed: THREE.Object3D, animated: THREE.Object3D, s: number, side: number, chequers: THREE.Texture) {
  const offset = side * (wallHalfAt(s, side) + 0.52);
  const booth = new THREE.Group();
  align(booth, s, offset);
  if (side > 0) booth.rotateY(Math.PI);
  fixed.add(booth);
  box(booth, cast, 0, 0.025, 0, 0.61, 0.065, 0.56);
  box(booth, cast, -0.105, 0.175, 0, 0.10, 0.27, 0.12);
  box(booth, cast, 0.105, 0.175, 0, 0.10, 0.27, 0.12);
  box(booth, jacket, 0, 0.407, 0, 0.27, 0.27, 0.17);
  box(booth, cream, 0, 0.394, 0.085, 0.25, 0.028, 0.009, false);
  const head = new THREE.Mesh(orb, skin);
  head.position.y = 0.624;
  head.scale.set(0.10, 0.107, 0.09);
  booth.add(head);
  box(booth, cast, 0, 0.716, 0.025, 0.206, 0.047, 0.196, false);
  box(booth, cast, -0.33, 0.66, -0.08, 0.087, 1.27, 0.082);
  const beacon = lightLens(booth, idle, 0.064);
  beacon.position.set(-0.33, 1.33, -0.08);

  const arm = new THREE.Group();
  arm.name = 'Bandera de comisario';
  arm.position.copy(booth.position);
  arm.quaternion.copy(booth.quaternion);
  arm.translateX(0.125);
  arm.position.y += 0.49;
  animated.add(arm);
  box(arm, jacket, 0.112, 0.007, 0, 0.245, 0.071, 0.073, false);
  box(arm, skin, 0.254, 0.014, 0, 0.069, 0.064, 0.062, false);
  box(arm, cream, 0.288, 0.158, 0, 0.022, 0.39, 0.026, false);
  const material = new THREE.MeshStandardMaterial({ color: green, side: THREE.DoubleSide, roughness: 0.88 });
  const checkered = new THREE.MeshStandardMaterial({ map: chequers, side: THREE.DoubleSide, roughness: 0.88 });
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.43, 0.27), material);
  cloth.position.set(0.514, 0.222, 0);
  arm.add(cloth);
  return { arm, beacon, cloth, material, checkered, near: coursePoint(s, 0), signal: 'idle' as ReturnType<typeof marshalSignal>, caution: 0 };
}

export function buildWorldActivity(parent: THREE.Object3D) {
  const fixed = new THREE.Group();
  const animated = new THREE.Group();
  fixed.name = 'Infraestructura de pista';
  animated.name = 'Actividad de boxes y comisarios';
  parent.add(fixed, animated);
  const checker = canvas2d(64, 40);
  for (let x = 0; x < 8; x++) for (let y = 0; y < 5; y++) {
    checker.context.fillStyle = (x + y) % 2 ? '#252622' : '#f3ecd9';
    checker.context.fillRect(x * 8, y * 8, 8, 8);
  }
  const chequers = texture(checker.canvas);
  const gates = [pitGate(fixed, animated, PIT_LANE.full + 0.55, 'ENTRADA'), pitGate(fixed, animated, PIT_LANE.leave + 0.12, 'SALIDA')];
  const cameras = [cameraTower(fixed, animated, 0.95, 1), cameraTower(fixed, animated, PIT_LANE.leave + 2.5, -1)];
  const marshals = [marshal(fixed, animated, -3.7, 1, chequers), marshal(fixed, animated, PIT_LANE.exit + 1.8, 1, chequers)];
  instanceStatic(fixed);

  let night = false;
  let last = 0;
  let heat = -1;
  const aim = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  return {
    setNight(enabled: boolean) {
      night = enabled;
      for (const gate of gates) {
        gate.lamp.intensity = night ? 68 : 16;
        gate.panelMaterial.emissiveIntensity = night ? 1.27 : 0.38;
      }
    },
    observe(snapshot: RaceSnapshot) {
      for (const gate of gates) gate.open = pitGateOpen(snapshot, gate.approach, gate.open);
      for (const camera of cameras) {
        const car = nearestCar(snapshot.cars, camera.near, 8.6);
        camera.following = Boolean(car);
        if (car) camera.target.set(car.x, car.y + 0.33, car.z);
        else camera.target.copy(camera.rest);
      }
      for (const post of marshals) {
        if (heat !== snapshot.heat) post.caution = 0;
        for (const hit of snapshot.impacts ?? []) {
          if (hit.strength >= 0.24 && Math.abs(hit.y - post.near.y) < 1.25 && Math.hypot(hit.x - post.near.x, hit.z - post.near.z) < 10) {
            post.caution = Math.max(post.caution, hit.frame + 105);
          }
        }
        post.signal = marshalSignal(snapshot, post.caution);
      }
      heat = snapshot.heat;
    },
    update(now: number) {
      const seconds = now * 0.001;
      const alpha = 1 - Math.exp(-Math.min(70, last ? now - last : 16) * 0.0065);
      last = now;
      for (const gate of gates) {
        gate.arm.rotation.z = THREE.MathUtils.lerp(gate.arm.rotation.z, gate.open ? 1.38 : 0, alpha);
        gate.beacon.material.color.copy(gate.open ? green : red);
        gate.beacon.material.emissive.copy(gate.beacon.material.color);
        gate.beacon.material.emissiveIntensity = night ? 2.2 : 0.46;
      }
      for (const camera of cameras) {
        aim.lookAt(camera.target, camera.head.position, up);
        camera.head.quaternion.slerp(rotation.setFromRotationMatrix(aim), alpha);
        camera.pilot.material.emissiveIntensity = camera.following ? night ? 3.0 : 1.4 : 0.14;
      }
      for (const [i, post] of marshals.entries()) {
        const color = post.signal === 'yellow' ? yellow : post.signal === 'red' ? red
          : post.signal === 'green' ? green : post.signal === 'checkered' ? white : idle;
        post.cloth.material = post.signal === 'checkered' ? post.checkered : post.material;
        post.material.color.copy(color);
        post.cloth.rotation.y = Math.sin(seconds * 8 + i) * 0.18;
        const waving = post.signal === 'yellow' || post.signal === 'checkered';
        post.arm.rotation.z = THREE.MathUtils.lerp(post.arm.rotation.z, post.signal === 'idle' ? -0.92
          : waving ? 0.26 + Math.sin(seconds * 6.4 + i) * 0.54 : -0.19, alpha * 1.4);
        post.beacon.material.color.copy(color);
        post.beacon.material.emissive.copy(color);
        post.beacon.material.emissiveIntensity = (night ? 2.0 : 0.52) * (waving ? 0.65 + 0.35 * Math.cos(seconds * 5.1) : 1);
      }
    },
  };
}
