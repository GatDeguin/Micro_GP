import type { CarDimensions } from '../shared/car-dimensions.ts';

interface CarPose {
  x: number;
  z: number;
  yaw: number;
  dimensions: CarDimensions;
}

export function capsule({ x, z, yaw, dimensions }: CarPose) {
  const radius = dimensions.halfWidth;
  const rear = dimensions.rear - radius;
  const front = dimensions.front - radius;
  const dx = Math.sin(yaw);
  const dz = Math.cos(yaw);
  return { x, z, ax: x - dx * rear, az: z - dz * rear, bx: x + dx * front, bz: z + dz * front, radius };
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function contactBetween(a: ReturnType<typeof capsule>, b: ReturnType<typeof capsule>) {
  const ux = a.bx - a.ax;
  const uz = a.bz - a.az;
  const vx = b.bx - b.ax;
  const vz = b.bz - b.az;
  const rx = a.ax - b.ax;
  const rz = a.az - b.az;

  const uu = ux * ux + uz * uz;
  const vv = vx * vx + vz * vz;
  const uv = ux * vx + uz * vz;
  const ur = ux * rx + uz * rz;
  const vr = vx * rx + vz * rz;
  const determinant = uu * vv - uv * uv;
  let s = determinant > 1e-8 ? clamp01((uv * vr - ur * vv) / determinant) : 0;
  let t = (uv * s + vr) / vv;
  if (t < 0) {
    t = 0;
    s = clamp01(-ur / uu);
  } else if (t > 1) {
    t = 1;
    s = clamp01((uv - ur) / uu);
  }

  const x = -rx + vx * t - ux * s;
  const z = -rz + vz * t - uz * s;
  const distance = Math.hypot(x, z);
  const depth = a.radius + b.radius - distance;
  if (depth <= 0) return null;
  if (distance > 1e-8) return { nx: x / distance, nz: z / distance, depth };

  // Intersecting spines can occur if a protected car comes out of recovery in traffic.
  const centerX = b.x - a.x;
  const centerZ = b.z - a.z;
  const centers = Math.hypot(centerX, centerZ);
  return centers > 1e-8 ? { nx: centerX / centers, nz: centerZ / centers, depth } : { nx: 1, nz: 0, depth };
}
