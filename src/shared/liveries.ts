import type { CarView, CourseId, Livery } from './protocol.ts';

export const LIVERIES = [
  { id: 'original', label: 'Original' },
  { id: 'clean', label: 'Vuelta limpia' },
  { id: 'sector', label: 'Récord de sector' },
] as const;

export interface LiveryProgress {
  clean: boolean;
  sector: boolean;
  /** Taller 07 retains the field used by existing garage saves. */
  bestSectors: (number | null)[];
  /** Archived timings for the Dique layout before the port detour. */
  diqueBestSectors?: (number | null)[];
  diqueDetourBestSectors?: (number | null)[];
}

const emptySectors = [null, null, null, null] as const;

export function createLiveryProgress(): LiveryProgress {
  return { clean: false, sector: false, bestSectors: [...emptySectors] };
}

export function normalizeLiveryProgress(value: unknown): LiveryProgress {
  const saved = value && typeof value === 'object' ? value as Partial<LiveryProgress> : {};
  const times = (entries: unknown) => emptySectors.map((_, index) => {
    const time: unknown = Array.isArray(entries) ? entries[index] : null;
    return typeof time === 'number' && Number.isFinite(time) && time > 0 ? time : null;
  });
  const record: LiveryProgress = { clean: saved.clean === true, sector: saved.sector === true, bestSectors: times(saved.bestSectors) };
  if (Array.isArray(saved.diqueBestSectors)) record.diqueBestSectors = times(saved.diqueBestSectors);
  if (Array.isArray(saved.diqueDetourBestSectors)) record.diqueDetourBestSectors = times(saved.diqueDetourBestSectors);
  return record;
}

export function bestSectorsFor(progress: LiveryProgress, course: CourseId): readonly (number | null)[] {
  return course === 'dique' ? progress.diqueDetourBestSectors ?? emptySectors : progress.bestSectors;
}

export function advanceLiveryProgress(previous: LiveryProgress, car: CarView, course: CourseId = 'taller'): LiveryProgress {
  const clean = previous.clean || car.cleanLap === true;
  let sector = previous.sector;
  let changed = clean !== previous.clean;
  const bestSectors = bestSectorsFor(previous, course).map((best, index) => {
    const time = car.sectorTimes?.[index];
    if (typeof time !== 'number' || time <= 0 || !Number.isFinite(time) || (best !== null && time >= best)) return best;
    changed = true;
    if (best !== null && best - time >= 0.05) sector = true;
    return time;
  });
  if (!changed) return previous;
  return course === 'dique' ? { ...previous, clean, sector, diqueDetourBestSectors: bestSectors }
    : { ...previous, clean, sector, bestSectors };
}

export function unlockedLiveries(progress: LiveryProgress): Livery[] {
  return LIVERIES.filter(({ id }) => id === 'original' || progress[id]).map(({ id }) => id);
}
