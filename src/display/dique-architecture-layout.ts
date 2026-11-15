import { diquePlanPoint } from '../shared/dique-track.ts';

export const DIQUE_BUILDING_PAD = 0.075;

function site(model: string, title: string, caption: string, plan: readonly [number, number],
  size: readonly [number, number], apron: number, yaw: number) {
  const [width, depth] = size;
  return { model, title, caption, ...diquePlanPoint(...plan), width, depth, apron, yaw };
}

export const diqueBuildings = {
  depot: site('DiqueDeposito', 'Depósito 03', 'Carga y despacho', [238, 62], [15.8, 8.9], 3.42, -0.018),
  workshop: site('DiqueTaller', 'Taller oeste', 'Mantenimiento', [45.4, 91], [10.8, 6.7], 2.24, 0.018),
  pumps: site('DiqueBombas', 'Casa de bombas', 'Servicio de la depuradora', [54.1, 103], [6.25, 5.1], 1.88, -0.020),
  station: site('DiqueSubestacion', 'Subestación', 'Acceso técnico', [112, 34.5], [7.7, 5.4], 1.97, 0.045),
  timing: site('DiqueCronometraje', 'Cronometraje', 'Gran Premio del Dique', [59, 145], [6.6, 4.3], 1.62, -0.026),
};

export type DiqueBuilding = ReturnType<typeof site>;

export function diqueBuildingPoint(building: DiqueBuilding, localX: number, localZ: number) {
  const { x, z, yaw } = building;
  return {
    x: x + Math.cos(yaw) * localX + Math.sin(yaw) * localZ,
    z: z - Math.sin(yaw) * localX + Math.cos(yaw) * localZ,
  };
}

export function diqueBuildingFootprint(building: DiqueBuilding) {
  const left = -building.width / 2 - 0.44;
  const front = building.depth / 2 + building.apron;
  const back = -building.depth / 2 - 0.40;
  const columns = Math.ceil(-2 * left / 1.25);
  const rows = Math.ceil((front - back) / 1.15);
  return Array.from({ length: (columns + 1) * (rows + 1) }, (_, index) =>
    diqueBuildingPoint(building, left - 2 * left * (index % (columns + 1)) / columns,
      back + (front - back) * Math.floor(index / (columns + 1)) / rows));
}
