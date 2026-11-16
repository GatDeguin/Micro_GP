import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import serviceFleetUrl from './assets/spaceport-service-vehicles.glb?url';

export type SpaceportVehicleKind = 'truck' | 'pickup' | 'security';
export type SpaceportVehiclePoint = readonly [number, number, number];
export interface SpaceportVehiclePlacement {
  kind: SpaceportVehicleKind;
  /** Ground contact position in meters. All models face local +Z. */
  position: SpaceportVehiclePoint;
  yaw: number;
}
export interface SpaceportVehicleRoute {
  kind: SpaceportVehicleKind;
  /** Closed centerline. A repeated final point is optional. */
  points: readonly SpaceportVehiclePoint[];
  speedMps?: number;
  pauseMs?: number;
  /** Fraction of a complete lap, including its loading pause. */
  phase?: number;
  /** Matches the service road's corner fillets. Defaults to 8 m. */
  cornerRadius?: number;
}
export interface SpaceportVehicleOptions {
  placements: readonly SpaceportVehiclePlacement[];
  /** Only two moving vehicles are admitted to bound update and shadow cost. */
  routes?: readonly SpaceportVehicleRoute[];
}

const config = {
  truck: { radius: .48, width: .28, halfAxle: 1.175, axles: [2.55, -1.9, -2.85] },
  pickup: { radius: .37, width: .22, halfAxle: .89, axles: [1.43, -1.48] },
  security: { radius: .37, width: .22, halfAxle: .89, axles: [1.43, -1.48] },
} as const;
const categories = ['body', 'glass', 'lamp', 'beacon'] as const;
type Category = typeof categories[number];
type ModelBatches = Partial<Record<SpaceportVehicleKind, Record<Category, THREE.InstancedMesh>>>;
let sourcePromise: Promise<THREE.Group> | undefined;

function loadFleet() {
  return sourcePromise ??= new GLTFLoader().loadAsync(serviceFleetUrl).then(gltf => gltf.scene).catch(error => {
    sourcePromise = undefined;
    throw error;
  });
}

/** Sampled quadratic corners remain inside an 8 m circular road fillet. */
function roundedRoute(input: readonly SpaceportVehiclePoint[], radius: number) {
  const corners = input.map(value => new THREE.Vector3(...value));
  if (corners.length > 1 && corners[0].distanceToSquared(corners.at(-1)!) < .0001) corners.pop();
  if (corners.length < 3 || corners.some(point => !Number.isFinite(point.lengthSq()))) return undefined;
  const samples: THREE.Vector3[] = [];
  for (let i = 0; i < corners.length; i++) {
    const corner = corners[i], previous = corners[(i + corners.length - 1) % corners.length];
    const next = corners[(i + 1) % corners.length];
    const incoming = new THREE.Vector3().subVectors(corner, previous);
    const outgoing = new THREE.Vector3().subVectors(next, corner);
    const inLength = incoming.length(), outLength = outgoing.length();
    if (inLength < .01 || outLength < .01) continue;
    incoming.divideScalar(inLength); outgoing.divideScalar(outLength);
    const turn = Math.acos(THREE.MathUtils.clamp(incoming.dot(outgoing), -1, 1));
    const tangentLength = Math.min(radius * Math.tan(turn / 2), inLength * .40, outLength * .40);
    const start = corner.clone().addScaledVector(incoming, -tangentLength);
    const end = corner.clone().addScaledVector(outgoing, tangentLength);
    const count = Math.max(1, Math.ceil(tangentLength * 2 / .4));
    for (let j = 0; j <= count; j++) {
      const t = j / count;
      const sample = new THREE.Vector3().copy(start).multiplyScalar((1 - t) ** 2)
        .addScaledVector(corner, 2 * (1 - t) * t).addScaledVector(end, t * t);
      if (!samples.length || sample.distanceToSquared(samples.at(-1)!) > .000001) samples.push(sample);
    }
  }
  if (samples.length < 3) return undefined;
  samples.push(samples[0].clone());
  const cumulative = [0];
  for (let i = 1; i < samples.length; i++) cumulative.push(cumulative[i - 1] + samples[i].distanceTo(samples[i - 1]));
  const length = cumulative.at(-1)!;
  if (length < 1) return undefined;
  return {
    length, samples,
    sample(distance: number, result: THREE.Vector3) {
      const d = THREE.MathUtils.euclideanModulo(distance, length);
      let low = 0, high = cumulative.length - 1;
      while (low + 1 < high) {
        const mid = (low + high) >> 1;
        if (cumulative[mid] <= d) low = mid; else high = mid;
      }
      return result.lerpVectors(samples[low], samples[high], (d - cumulative[low]) / (cumulative[high] - cumulative[low]));
    },
  };
}

interface Vehicle {
  kind: SpaceportVehicleKind;
  position: THREE.Vector3;
  yaw: number;
  wheelDistance: number;
  instance: number;
  firstWheel: number;
}

/** Fourteen instanced draws for the fleet, wheels and soft ground contact. */
export async function buildSpaceportVehicles(parent: THREE.Group, options: SpaceportVehicleOptions) {
  const source = await loadFleet();
  source.updateMatrixWorld(true);
  const group = new THREE.Group(); group.name = 'Spaceport · flota de servicio Blender';
  const vehicles: Vehicle[] = options.placements.map(placement => ({
    kind: placement.kind, position: new THREE.Vector3(...placement.position), yaw: placement.yaw,
    wheelDistance: 0, instance: 0, firstWheel: 0,
  }));
  const moving: { vehicle: Vehicle; route: NonNullable<ReturnType<typeof roundedRoute>>;
    speed: number; pause: number; phase: number }[] = [];
  for (const spec of options.routes?.slice(0, 2) ?? []) {
    const route = roundedRoute(spec.points, Math.max(0, spec.cornerRadius ?? 8));
    if (!route) continue;
    const vehicle: Vehicle = { kind: spec.kind, position: route.samples[0].clone(), yaw: 0,
      wheelDistance: 0, instance: 0, firstWheel: 0 };
    vehicles.push(vehicle);
    moving.push({ vehicle, route, speed: THREE.MathUtils.clamp(spec.speedMps ?? 3, .5, 6),
      pause: Math.max(0, spec.pauseMs ?? 1800) / 1000, phase: THREE.MathUtils.euclideanModulo(spec.phase ?? 0, 1) });
  }
  const batches: ModelBatches = {};
  const materials: THREE.MeshStandardMaterial[] = [];
  const lamps: THREE.MeshStandardMaterial[] = [], beacons: THREE.MeshStandardMaterial[] = [];
  const counts: Record<SpaceportVehicleKind, number> = { truck: 0, pickup: 0, security: 0 };
  let wheelCount = 0;
  const bounds = new THREE.Box3();
  for (const vehicle of vehicles) {
    vehicle.instance = counts[vehicle.kind]++;
    vehicle.firstWheel = wheelCount;
    wheelCount += config[vehicle.kind].axles.length * 2;
    bounds.expandByPoint(vehicle.position);
  }
  for (const { route } of moving) for (const point of route.samples) bounds.expandByPoint(point);
  const sphere = bounds.expandByScalar(6).getBoundingSphere(new THREE.Sphere());

  function instantiate(name: string, count: number, emissive?: Category) {
    const mesh = source.getObjectByName(name) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | undefined;
    if (!mesh?.isMesh || Array.isArray(mesh.material)) throw new Error(`Missing Spaceport vehicle mesh: ${name}`);
    const material = mesh.material.clone();
    material.side = THREE.FrontSide;
    if (emissive === 'lamp' || emissive === 'beacon') {
      material.emissive.setHex(0xffffff);
      // Lenses share one opaque material; vertex paint also colors emission.
      material.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n totalEmissiveRadiance *= vColor.rgb;\n#endif');
      };
      material.customProgramCacheKey = () => 'spaceport-vertex-lens-v1';
      (emissive === 'lamp' ? lamps : beacons).push(material);
    }
    materials.push(material);
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    const result = new THREE.InstancedMesh(geometry, material, count);
    result.name = `Flota · ${name}`;
    result.boundingSphere = sphere.clone();
    result.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    result.receiveShadow = !emissive || emissive === 'body';
    result.castShadow = emissive === 'body' || name === 'shared_wheel';
    group.add(result);
    return result;
  }
  for (const kind of Object.keys(counts) as SpaceportVehicleKind[]) {
    if (!counts[kind]) continue;
    const byCategory = {} as Record<Category, THREE.InstancedMesh>;
    for (const category of categories) byCategory[category] = instantiate(`${kind}_${category}`, counts[kind], category);
    batches[kind] = byCategory;
  }
  const wheels = wheelCount ? instantiate('shared_wheel', wheelCount) : undefined;
  // The course-wide sun map cannot resolve tire-scale contact from every view.
  // This small vertex-alpha footprint remains attached to moving vehicles and
  // also grounds the fleet in compact mode, without another shadow-map pass.
  const contactGeometry = new THREE.PlaneGeometry(1, 1, 4, 4).rotateX(-Math.PI / 2);
  const contactUV = contactGeometry.getAttribute('uv');
  const contactColors = new Float32Array(contactUV.count * 4);
  for (let i = 0; i < contactUV.count; i++) {
    const edge = Math.max(Math.abs(contactUV.getX(i) * 2 - 1), Math.abs(contactUV.getY(i) * 2 - 1));
    contactColors[i * 4 + 3] = (1 - THREE.MathUtils.smoothstep(edge, .35, 1)) * .42;
  }
  contactGeometry.setAttribute('color', new THREE.BufferAttribute(contactColors, 4));
  const contactMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
  const contacts = new THREE.InstancedMesh(contactGeometry, contactMaterial, vehicles.length);
  contacts.name = 'Flota · contacto suave con el suelo'; contacts.boundingSphere = sphere.clone();
  group.add(contacts);
  const contactMatrix = new THREE.Matrix4();
  const matrix = new THREE.Matrix4(), wheelMatrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion(), wheelRotation = new THREE.Quaternion();
  const axisY = new THREE.Vector3(0, 1, 0), axisX = new THREE.Vector3(1, 0, 0);
  const unit = new THREE.Vector3(1, 1, 1), wheelPosition = new THREE.Vector3(), wheelScale = new THREE.Vector3();
  const ahead = new THREE.Vector3(), previous = new THREE.Vector3();
  let detail = true, night = false, startTime: number | undefined;

  function place(vehicle: Vehicle) {
    const byCategory = batches[vehicle.kind]!;
    rotation.setFromAxisAngle(axisY, vehicle.yaw);
    matrix.compose(vehicle.position, rotation, unit);
    for (const category of categories) {
      byCategory[category].setMatrixAt(vehicle.instance, matrix);
      byCategory[category].instanceMatrix.needsUpdate = true;
    }
    contactMatrix.makeScale(vehicle.kind === 'truck' ? 2.9 : 2.2, 1, vehicle.kind === 'truck' ? 8.0 : 4.8);
    contactMatrix.elements[13] = .020;
    contactMatrix.premultiply(matrix);
    contacts.setMatrixAt(vehicles.indexOf(vehicle), contactMatrix);
    contacts.instanceMatrix.needsUpdate = true;
    const spec = config[vehicle.kind];
    wheelRotation.setFromAxisAngle(axisX, vehicle.wheelDistance / spec.radius);
    wheelScale.set(spec.width, spec.radius, spec.radius);
    let wheelIndex = vehicle.firstWheel;
    for (const z of spec.axles) for (const side of [-1, 1]) {
      wheelPosition.set(side * spec.halfAxle, spec.radius, z);
      wheelMatrix.compose(wheelPosition, wheelRotation, wheelScale).premultiply(matrix);
      wheels!.setMatrixAt(wheelIndex++, wheelMatrix);
    }
    if (wheels) wheels.instanceMatrix.needsUpdate = true;
  }

  function lighting(nowMs = 0) {
    for (const material of lamps) material.emissiveIntensity = night ? 2.8 : .20;
    const pulse = detail ? .45 + Math.pow(.5 + .5 * Math.sin(nowMs * .007), 8) * 1.7 : .65;
    for (const material of beacons) material.emissiveIntensity = pulse * (night ? 1.5 : 1);
  }

  function update(nowMs: number) {
    startTime ??= nowMs;
    const elapsed = Math.max(0, nowMs - startTime) / 1000;
    for (const item of moving) {
      const { vehicle, route, speed, pause, phase } = item;
      // Analytic acceleration/deceleration gives zero speed during the loading
      // pause, with no frame-rate dependence and no position reset at the seam.
      const ramp = Math.min(1.5, route.length / speed * .25);
      const movingDuration = route.length / speed + ramp;
      const cycle = movingDuration + pause;
      const time = elapsed + phase * cycle;
      const laps = Math.floor(time / cycle), inCycle = time % cycle;
      const t = Math.max(0, inCycle - pause);
      let distance: number;
      if (t < ramp) distance = .5 * speed * t * t / ramp;
      else if (t > movingDuration - ramp) distance = route.length - .5 * speed * (movingDuration - t) ** 2 / ramp;
      else distance = speed * (t - ramp * .5);
      route.sample(distance, vehicle.position);
      route.sample(distance + .3, ahead); route.sample(distance - .3, previous);
      vehicle.yaw = Math.atan2(ahead.x - previous.x, ahead.z - previous.z);
      vehicle.wheelDistance = laps * route.length + distance;
      place(vehicle);
    }
    lighting(nowMs);
  }

  for (const vehicle of vehicles) place(vehicle);
  lighting();
  parent.add(group);
  return {
    update,
    setNight(value: boolean) { night = value; lighting(); },
    setDetail(value: boolean) {
      detail = value;
      for (const kind of Object.keys(batches) as SpaceportVehicleKind[]) batches[kind]!.body.castShadow = value;
      if (wheels) wheels.castShadow = value;
    },
    dispose() {
      parent.remove(group);
      for (const child of group.children) {
        const mesh = child as THREE.InstancedMesh;
        mesh.geometry.dispose(); mesh.dispose();
      }
      for (const material of materials) material.dispose();
      contactMaterial.dispose();
    },
  };
}
