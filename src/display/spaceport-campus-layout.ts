export type CampusXZ = readonly [number, number];

export const SPACEPORT_BUILDINGS = [
  { id: 'reception', label: 'ACREDITACIÓN / VISITANTES', x: -94, z: -32, width: 34, depth: 18, height: 7.2, style: 'office' },
  { id: 'laboratory', label: 'LABORATORIO / MATERIALES', x: -99, z: -84, width: 40, depth: 26, height: 9.4, style: 'lab' },
  { id: 'logistics', label: 'LOGÍSTICA / SUMINISTROS', x: -103, z: -213, width: 40, depth: 28, height: 10.2, style: 'warehouse' },
  { id: 'mission', label: 'OPERACIONES / TELEMETRÍA', x: -53, z: -120, width: 22, depth: 18, height: 13, style: 'office' },
  { id: 'substation', label: 'ENERGÍA / ACCESO TÉCNICO', x: -35, z: -256, width: 24, depth: 17, height: 6, style: 'utility' },
  { id: 'gatehouse', label: 'CONTROL DE ACCESO', x: -116, z: -317, width: 9, depth: 13, height: 4, style: 'security' },
] as const;

export const SPACEPORT_SERVICE_ROADS: readonly { points: readonly CampusXZ[]; width: number }[] = [
  { points: [[-107, -385], [-107, -310], [-70, -310], [-70, -24]], width: 8 },
  { points: [[-70, -24], [155, -24], [155, -132], [66, -132], [66, -102], [-70, -102]], width: 8 },
  { points: [[-70, -238], [-25, -238], [-25, -213], [4, -213]], width: 7 },
  { points: [[-70, -190], [-103, -190]], width: 7 },
  { points: [[-70, -143], [-94, -143]], width: 6 },
  { points: [[-70, -53], [-121, -53]], width: 6 },
];

export const SPACEPORT_SERVICE_LOOP: readonly CampusXZ[] = [
  [-70, -24], [155, -24], [155, -132], [66, -132], [66, -102], [-70, -102],
];

// Rounded corners stay within each marked service-road junction. The same
// centreline is used by paving and moving vehicles so a truck cannot cut a lawn.
export function roundedServicePath(points: readonly CampusXZ[], radius = 8, closed = false): CampusXZ[] {
  const result: CampusXZ[] = [];
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    if (!closed && (i === 0 || i === points.length - 1)) { result.push(current); continue; }
    const before = points[(i + points.length - 1) % points.length], after = points[(i + 1) % points.length];
    const a = Math.hypot(before[0] - current[0], before[1] - current[1]);
    const b = Math.hypot(after[0] - current[0], after[1] - current[1]);
    const r = Math.min(radius, a * .35, b * .35);
    const start: CampusXZ = [current[0] + (before[0] - current[0]) * r / a, current[1] + (before[1] - current[1]) * r / a];
    const end: CampusXZ = [current[0] + (after[0] - current[0]) * r / b, current[1] + (after[1] - current[1]) * r / b];
    for (let step = 0; step <= 10; step++) {
      const t = step / 10, u = 1 - t;
      result.push([u * u * start[0] + 2 * u * t * current[0] + t * t * end[0],
        u * u * start[1] + 2 * u * t * current[1] + t * t * end[1]]);
    }
  }
  if (closed) result.push(result[0]);
  return result;
}
