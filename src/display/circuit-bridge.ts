import * as THREE from 'three';
import { TRACK, bankAt, heightAt, roadHalfAt, wallHalfAt } from '../shared/track';
import { box, standard } from './materials';

type Point = ReturnType<typeof TRACK.sampleAt>;

function trackEdge(p: Point, offset: number, lift: number) {
  return new THREE.Vector3(p.x - p.dz * offset, p.y + bankAt(p.s) * offset + lift, p.z + p.dx * offset);
}

function expansionJoint(parent: THREE.Object3D, s: number, steel: THREE.Material, recess: THREE.Material) {
  const p = TRACK.sampleAt(s);
  const half = roadHalfAt(s) - 0.065;
  const pitch = Math.atan((heightAt(s + 0.19, 0) - heightAt(s - 0.19, 0)) / 0.38);
  const joint = new THREE.Group();
  joint.name = 'Junta de dilatación dentada';
  joint.position.set(p.x, p.y + 0.009, p.z);
  joint.rotation.set(-pitch, Math.atan2(p.dx, p.dz), -Math.atan(bankAt(s)), 'YXZ');
  parent.add(joint);
  box(joint, recess, 0, 0, 0, half * 2, 0.008, 0.157, false);
  for (const edge of [-1, 1]) box(joint, steel, 0, 0.005, edge * 0.068, half * 2, 0.007, 0.035, false);
  const count = Math.floor(2 * half / 0.17);
  for (let i = 0; i < count; i++) {
    box(joint, steel, ((i + 0.5) / count * 2 - 1) * half, 0.005, (i % 2 ? 1 : -1) * 0.037,
      half * 1.26 / count, 0.007, 0.069, false);
  }
}

export function buildBridgeTruss(parent: THREE.Object3D) {
  const group = new THREE.Group();
  group.name = 'Puente diagonal con celosía de acero';
  parent.add(group);
  const graphite = standard(0x4a5050, 0.52, 0.69);
  const galvanized = standard(0x657374, 0.46, 0.64);
  const casting = standard(0x766c61, 0.63, 0.46);
  const fastener = standard(0x9c988d, 0.48, 0.67);
  const jointGap = standard(0x212324, 0.91);
  const stud = new THREE.CylinderGeometry(0.032, 0.037, 0.023, 8).rotateZ(Math.PI / 2);
  const direction = new THREE.Vector3();
  const alongZ = new THREE.Vector3(0, 0, 1);
  const from = TRACK.crossing.upper - 6.22;
  const to = TRACK.crossing.upper + 6.17;
  const panels = 6;
  const samples = Array.from({ length: panels + 1 }, (_, i) => TRACK.sampleAt(THREE.MathUtils.lerp(from, to, i / panels)));

  function member(a: THREE.Vector3, b: THREE.Vector3, width: number, thickness: number, material: THREE.Material) {
    const midpoint = a.clone().lerp(b, 0.5);
    const length = a.distanceTo(b);
    const beam = box(group, material, midpoint.x, midpoint.y, midpoint.z, width, thickness, length + 0.037);
    beam.quaternion.setFromUnitVectors(alongZ, direction.subVectors(b, a).normalize());
  }

  for (const side of [-1, 1]) {
    const offset = (p: Point) => side * (wallHalfAt(p.s, side) + 0.135);
    const lower = samples.map(p => trackEdge(p, offset(p), 0.145));
    const upper = samples.map((p, i) => trackEdge(p, offset(p), i === 0 || i === panels ? 1.43 : 1.85));
    for (let i = 0; i < panels; i++) {
      member(lower[i], lower[i + 1], 0.204, 0.194, graphite);
      member(upper[i], upper[i + 1], 0.171, 0.151, galvanized);
      const diagonal = i % 2 === 0 ? [lower[i], upper[i + 1]] : [upper[i], lower[i + 1]];
      member(diagonal[0], diagonal[1], 0.143, 0.111, galvanized);
    }
    for (const [i, p] of samples.entries()) {
      const yaw = Math.atan2(p.dx, p.dz);
      member(lower[i], upper[i], i === 0 || i === panels ? 0.19 : 0.123, 0.123, graphite);
      const foot = trackEdge(p, offset(p), 0.009);
      box(group, casting, foot.x, foot.y, foot.z, 0.28, 0.092, 0.52, false).rotation.y = yaw;
      for (const node of [lower[i], upper[i]]) {
        const edge = trackEdge(p, offset(p) + side * 0.107, node.y - p.y);
        box(group, casting, edge.x, edge.y, edge.z, 0.041, 0.23, 0.32, false).rotation.y = yaw;
        for (const distance of [-0.102, 0.104]) {
          const bolt = new THREE.Mesh(stud, fastener);
          bolt.position.set(edge.x + p.dx * distance - p.dz * side * 0.027,
            edge.y + distance * 0.37, edge.z + p.dz * distance + p.dx * side * 0.027);
          bolt.rotation.y = yaw;
          group.add(bolt);
        }
      }
    }
  }

  for (const s of [TRACK.bridge.crest - 3.06, from + 0.17, to - 0.17]) expansionJoint(group, s, galvanized, jointGap);
}
