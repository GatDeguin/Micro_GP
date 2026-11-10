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

/** Normalized continuous audio inputs derived from the simulation. */
export interface CarSound {
  throttle: number;
  curb: number;
  runoff: number;
  slip: number;
  scrape: number;
}

/** A one-shot contact cue. The same id may appear in successive snapshots. */
export interface RaceImpact {
  id: number;
  frame: number;
  kind: "car" | "wall" | "fence";
  x: number;
  y: number;
  z: number;
  strength: number;
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
  sound?: CarSound;
}

export interface RaceSnapshot {
  frame: number;
  heat: number;
  phase: "demo" | "grid" | "race" | "results";
  lights: number;
  flag: boolean;
  order: number[];
  cars: CarView[];
  impacts?: RaceImpact[];
}
