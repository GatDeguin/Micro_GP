const SAMPLE_SPACING = 0.85;

export class RaceTiming {
  bestLap: number | null = null;
  lastLap: number | null = null;
  cleanLap = false;
  readonly sectorTimes: (number | null)[] = [null, null, null, null];
  finishTime: number | null = null;

  private lapStart: number | null = null;
  private sectorStart: number | null = null;
  private clean = true;
  private sectorAssisted = false;
  private readonly arrivals: number[] = [];

  dirty() {
    this.clean = false;
  }

  assisted() {
    this.dirty();
    this.sectorAssisted = true;
  }

  crossed(gate: number, time: number) {
    if (this.sectorStart !== null && !this.sectorAssisted) {
      const sector = (gate + 3) % 4;
      const elapsed = time - this.sectorStart;
      this.sectorTimes[sector] = Math.min(this.sectorTimes[sector] ?? Infinity, elapsed);
    }
    this.sectorStart = time;
    this.sectorAssisted = false;
    if (gate !== 0) return;

    if (this.lapStart !== null) {
      this.lastLap = time - this.lapStart;
      this.bestLap = Math.min(this.bestLap ?? Infinity, this.lastLap);
      this.cleanLap = this.clean;
    }
    this.lapStart = time;
    this.clean = true;
  }

  recordProgress(before: number, after: number, time: number, dt: number) {
    if (after <= before || after < 0) return;
    const next = Math.max(this.arrivals.length, Math.ceil(before / SAMPLE_SPACING), 0);
    for (let i = next; i * SAMPLE_SPACING <= after; i++) {
      const fraction = (i * SAMPLE_SPACING - before) / (after - before);
      this.arrivals[i] = time - dt + dt * fraction;
    }
  }

  arrivalAt(distance: number): number | null {
    if (distance < 0) return null;
    const sample = distance / SAMPLE_SPACING;
    const index = Math.floor(sample);
    const first = this.arrivals[index];
    if (first === undefined) return null;
    const next = this.arrivals[index + 1] ?? first;
    return first + (next - first) * (sample - index);
  }
}
