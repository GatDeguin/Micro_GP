import type { CarView, Livery } from './protocol.ts';

export const LIVERIES = [
  { id: 'original', label: 'Original' },
  { id: 'clean', label: 'Vuelta limpia' },
  { id: 'sector', label: 'Récord de sector' },
] as const;

export interface LiveryProgress {
  clean: boolean;
  sector: boolean;
  bestSectors: (number | null)[];
}

export function createLiveryProgress(): LiveryProgress {
  return { clean: false, sector: false, bestSectors: [null, null, null, null] };
}

export function advanceLiveryProgress(previous: LiveryProgress, car: CarView): LiveryProgress {
  const clean = previous.clean || car.cleanLap === true;
  let sector = previous.sector;
  let changed = clean !== previous.clean;
  const bestSectors = previous.bestSectors.map((best, index) => {
    const time = car.sectorTimes?.[index];
    if (typeof time !== 'number' || time <= 0 || !Number.isFinite(time) || (best !== null && time >= best)) return best;
    changed = true;
    if (best !== null && best - time >= 0.05) sector = true;
    return time;
  });
  return changed ? { clean, sector, bestSectors } : previous;
}

export function unlockedLiveries(progress: LiveryProgress): Livery[] {
  return LIVERIES.filter(({ id }) => id === 'original' || progress[id]).map(({ id }) => id);
}
