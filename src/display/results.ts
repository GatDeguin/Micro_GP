import { CAR_SPECS, type RaceSnapshot } from '../shared/protocol';
import type { ReplayHistory, ReplayKind } from './replay';

export function raceTime(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const ms = Math.round(Math.max(0, seconds) * 1000);
  const minutes = Math.floor(ms / 60_000);
  const rest = ms % 60_000;
  return `${minutes}:${String(Math.floor(rest / 1000)).padStart(2, '0')}.${String(rest % 1000).padStart(3, '0')}`;
}

const replayLabels: Record<ReplayKind, string> = {
  finish: 'Llegada', overtake: 'Adelantamiento', recovery: 'Vuelta a pista',
};

export function buildRaceResults(replay: ReplayHistory) {
  const root = document.createElement('aside');
  root.className = 'race-results';
  root.setAttribute('aria-label', 'Fin de carrera');
  root.hidden = true;
  root.innerHTML = `
    <div class="race-results-actions">
      <button type="button" aria-expanded="false" aria-controls="race-results-times">Resultados</button>
      <button type="button" data-recap hidden>Ver resumen</button>
    </div>
    <section id="race-results-times" class="race-results-times" aria-label="Tiempos de carrera" hidden>
      <table><thead><tr><th>Pos.</th><th>Auto</th><th>Tiempo</th><th>Diferencia</th><th>Mejor vuelta</th></tr></thead><tbody></tbody></table>
    </section>
    <p class="race-results-caption" aria-live="polite" hidden></p>`;
  document.body.append(root);
  const toggle = root.querySelector<HTMLButtonElement>('button')!;
  const recap = root.querySelector<HTMLButtonElement>('[data-recap]')!;
  const times = root.querySelector<HTMLElement>('section')!;
  const tbody = root.querySelector('tbody')!;
  const caption = root.querySelector<HTMLParagraphElement>('p')!;
  let playing = false;
  let rows = '';

  function showTimes(visible: boolean) {
    times.hidden = !visible;
    toggle.setAttribute('aria-expanded', String(visible));
  }
  toggle.addEventListener('click', () => {
    if (playing) replay.stop();
    showTimes(times.hidden);
  });
  recap.addEventListener('click', () => {
    if (playing) replay.stop();
    else if (replay.startSummary(performance.now())) showTimes(false);
  });

  return {
    update(state: RaceSnapshot) {
      root.hidden = state.phase !== 'results';
      if (root.hidden) {
        showTimes(false);
        recap.hidden = true;
        return;
      }
      recap.hidden = !replay.available;
      const results = state.results ?? [];
      const key = JSON.stringify(results);
      if (key === rows) return;
      rows = key;
      const winner = results[0]?.time;
      tbody.replaceChildren(...results.map(({ slot, time, bestLap }, index) => {
        const row = document.createElement('tr');
        const spec = CAR_SPECS[slot];
        const gap = winner != null && time != null ? `+${Math.max(0, time - winner).toFixed(3)} s` : '—';
        for (const value of [index + 1, `${spec.number} · ${spec.name}`, time === null ? 'Sin terminar' : raceTime(time), gap, raceTime(bestLap)]) {
          row.insertCell().textContent = String(value);
        }
        return row;
      }));
    },
    showReplay(moment: ReturnType<ReplayHistory['sample']>) {
      playing = moment !== null;
      const button = playing ? 'Cerrar resumen' : 'Ver resumen';
      if (recap.textContent !== button) recap.textContent = button;
      caption.hidden = !playing;
      if (moment) {
        const text = `${moment.clip + 1}/${moment.count} · ${replayLabels[moment.kind]}`;
        if (caption.textContent !== text) caption.textContent = text;
      }
    },
  };
}
