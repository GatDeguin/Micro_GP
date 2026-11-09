export const CAR_SPECS = [
  { number: "07", color: "#2DC5D8", name: "Compacto" },
  { number: "21", color: "#EF5546", name: "Cupé" },
  { number: "34", color: "#F1CD4F", name: "Bólido" },
  { number: "58", color: "#9D77E6", name: "Cuña" },
] as const;

export interface DriveInput {
  x: number;
  gas: boolean;
  brake: boolean;
}

export const NEUTRAL: DriveInput = { x: 0, gas: false, brake: false };

export interface Driver {
  input: DriveInput | null;
  owned: boolean;
}

export interface CarView {
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  lap: number;
  owned: boolean;
  blink: boolean;
  braking: boolean;
  steer: number;
}

export interface RaceSnapshot {
  frame: number;
  heat: number;
  phase: "demo" | "grid" | "race" | "results";
  lights: number;
  flag: boolean;
  order: number[];
  cars: CarView[];
}
