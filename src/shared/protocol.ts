export const CAR_SPECS = [
  { number: "07", color: "#2DC5D8", name: "Compacto" },
  { number: "21", color: "#EF5546", name: "Cupé" },
  { number: "34", color: "#F1CD4F", name: "Bólido" },
  { number: "58", color: "#9D77E6", name: "Cuña" },
] as const;

export type Difficulty = 'rookie' | 'club' | 'pro';
export type Livery = 'original' | 'clean' | 'sector';

export interface RaceConfig {
  laps: number;
  bots: number;
  difficulty: Difficulty;
  mode: 'race' | 'practice';
  night: boolean;
}

export const defaultRaceConfig: RaceConfig = { laps: 3, bots: 3, difficulty: 'club', mode: 'race', night: false };

export function normalizeRaceConfig(value: unknown): RaceConfig {
  const config = value && typeof value === 'object' ? value as Partial<RaceConfig> : {};
  const integer = (candidate: unknown, fallback: number, min: number, max: number) =>
    typeof candidate === 'number' && Number.isFinite(candidate)
      ? Math.min(max, Math.max(min, Math.round(candidate))) : fallback;
  return {
    laps: integer(config.laps, defaultRaceConfig.laps, 1, 12),
    bots: integer(config.bots, defaultRaceConfig.bots, 0, 3),
    difficulty: config.difficulty === 'rookie' || config.difficulty === 'pro' ? config.difficulty : 'club',
    mode: config.mode === 'practice' ? 'practice' : 'race',
    night: config.night === true,
  };
}

export interface DriveInput {
  x: number;
  gas: boolean;
  brake: boolean;
}

export const NEUTRAL: DriveInput = { x: 0, gas: false, brake: false };

export interface Driver {
  input: DriveInput | null;
  owned: boolean;
  livery?: Livery;
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

export interface TransmissionView {
  /** -1 is reverse, 0 is neutral and 1–4 are the forward gears. */
  gear: number;
  /** Engine speed from idle to redline, normalized to 0–1. */
  rev: number;
  /** Counts changes for this car within the current heat. */
  shift: number;
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
  transmission?: TransmissionView;
  active?: boolean;
  livery?: Livery;
  suspension?: { pitch: number; roll: number; heave: number };
  pitReady?: boolean;
  bestLap?: number | null;
  lastLap?: number | null;
  cleanLap?: boolean;
  sectorTimes?: (number | null)[];
  gap?: number | null;
}

export interface RaceResult {
  slot: number;
  time: number | null;
  bestLap: number | null;
}

export interface RaceSnapshot {
  frame: number;
  heat: number;
  phase: "demo" | "grid" | "race" | "practice" | "results";
  lights: number;
  flag: boolean;
  order: number[];
  cars: CarView[];
  impacts?: RaceImpact[];
  config?: RaceConfig;
  results?: RaceResult[];
  time?: number;
}
