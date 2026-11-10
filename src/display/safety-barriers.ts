import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { RaceSnapshot } from '../shared/protocol';
import { safetyPanels, safetyPanelSpacing } from '../shared/safety';
import { TRACK, wallHalfAt } from '../shared/track';

const metal = new THREE.MeshStandardMaterial({ color: 0xd9dce0, metalness: 0.72, roughness: 0.42 });
const rubber = new THREE.MeshStandardMaterial({ color: 0xb3ada4, roughness: 0.88 });

export function buildSafetyBarriers(parent: THREE.Object3D) {
  const panels = safetyPanels.map(({ s, side, tyres }) => {
    const p = TRACK.sampleAt(s);
    const nx = -p.dz * side, nz = p.dx * side;
    const edge = wallHalfAt(s, side);
    return {
      s, side, nx, nz, yaw: Math.atan2(p.dx, p.dz),
      x: p.x + nx * edge, y: TRACK.heightAt(s, side * edge), z: p.z + nz * edge,
      tyres, bend: 0, velocity: 0, scuff: 0, dirty: true,
    };
  });
  const bars = new THREE.InstancedMesh(new RoundedBoxGeometry(0.13, 0.235, safetyPanelSpacing * 0.97, 2, 0.035),
    metal, panels.length * 2);
  const tyres = new THREE.InstancedMesh(new THREE.TorusGeometry(0.158, 0.052, 7, 16), rubber,
    panels.filter(panel => panel.tyres).length * 4);
  bars.name = 'Guardarraíles con deformación recuperable';
  tyres.name = 'Neumáticos de seguridad con amortiguación';
  bars.castShadow = bars.receiveShadow = tyres.castShadow = tyres.receiveShadow = true;
  bars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  tyres.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  parent.add(bars, tyres);

  const pose = new THREE.Object3D();
  const colour = new THREE.Color();
  let lastImpact = -1;
  let lastFrame = -Infinity;
  let lastHeat = -1;
  let lastReplay = false;

  function paint(dt: number) {
    let nextTyre = 0;
    let changed = false;
    for (const [i, panel] of panels.entries()) {
      const tyreIndex = nextTyre;
      if (panel.tyres) nextTyre += 4;
      const moving = panel.dirty || Math.abs(panel.bend) > 0.0001 || Math.abs(panel.velocity) > 0.001 || panel.scuff > 0.001;
      if (!moving) continue;
      panel.velocity += (-panel.bend * 69 - panel.velocity * 10.5) * dt;
      panel.bend += panel.velocity * dt;
      panel.scuff = Math.max(0, panel.scuff - dt * 0.27);
      panel.dirty = false;
      const sway = Math.max(-0.015, Math.min(0.25, panel.bend));
      const bend = sway + panel.scuff * 0.061;
      pose.rotation.set(0, panel.yaw + bend * panel.side * 0.19, bend * panel.side * 0.30);
      for (let band = 0; band < 2; band++) {
        const offset = 0.084 + bend * (1 + band * 0.14);
        pose.position.set(panel.x + panel.nx * offset, panel.y + 0.24 + band * 0.27, panel.z + panel.nz * offset);
        pose.updateMatrix();
        bars.setMatrixAt(i * 2 + band, pose.matrix);
        colour.setHex(band === 0 ? 0x788489 : 0x9eabae).multiplyScalar(1 - panel.scuff * 0.43);
        bars.setColorAt(i * 2 + band, colour);
      }
      if (panel.tyres) {
        for (let level = 0; level < 4; level++) {
          const push = -0.065 + bend * (0.62 + level * 0.24);
          pose.rotation.set(Math.PI / 2 + bend * 0.34, 0, panel.yaw + bend * level);
          pose.position.set(panel.x + panel.nx * push, panel.y + 0.065 + level * (0.11 - Math.max(0, sway) * 0.16),
            panel.z + panel.nz * push);
          pose.updateMatrix();
          tyres.setMatrixAt(tyreIndex + level, pose.matrix);
          tyres.setColorAt(tyreIndex + level, colour.setHex(level % 2 === 0 ? 0x3c3a38 : 0x312f2e));
        }
      }
      changed = true;
    }
    if (changed) {
      bars.instanceMatrix.needsUpdate = tyres.instanceMatrix.needsUpdate = true;
      if (bars.instanceColor) bars.instanceColor.needsUpdate = true;
      if (tyres.instanceColor) tyres.instanceColor.needsUpdate = true;
    }
  }
  paint(0);

  return (state: RaceSnapshot, tick: number, dt: number, replay: boolean) => {
    if (state.heat !== lastHeat || tick < lastFrame || replay !== lastReplay) {
      lastHeat = state.heat;
      lastImpact = -1;
      for (const hit of state.impacts ?? []) if (hit.frame < tick - 3) lastImpact = Math.max(lastImpact, hit.id);
    }
    lastFrame = tick;
    lastReplay = replay;
    for (const hit of state.impacts ?? []) {
      if (hit.id <= lastImpact || hit.frame > tick) continue;
      lastImpact = hit.id;
      if (hit.kind === 'car' || hit.distance === undefined || hit.side === undefined) continue;
      for (const panel of panels) {
        if (hit.side !== panel.side) continue;
        const along = Math.abs(TRACK.wrap(panel.s - hit.distance + TRACK.length / 2) - TRACK.length / 2);
        const pressure = hit.strength * Math.max(0, 1 - along / 2.65);
        if (pressure === 0) continue;
        panel.velocity += pressure * 2.2;
        panel.scuff = Math.min(1, panel.scuff + pressure * 0.82);
        panel.dirty = true;
      }
    }
    paint(Math.min(dt, 0.04));
  };
}
