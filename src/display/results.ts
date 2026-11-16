import { CAR_SPECS, COURSE_OPTIONS, type RaceSnapshot } from '../shared/protocol.ts';
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

export function raceClassification(state: RaceSnapshot) {
  const results = state.results ?? state.order.map(slot => ({ slot, time: null, bestLap: state.cars[slot]?.bestLap ?? null }));
  const winner = results[0]?.time;
  return results.filter(result => CAR_SPECS[result.slot]).map(({ slot, time, bestLap }, index) => {
    const finished = time != null && Number.isFinite(time);
    return { slot, spec: CAR_SPECS[slot], place: finished ? index + 1 : null,
      time: finished ? raceTime(time) : 'No terminó', bestLap: raceTime(bestLap),
      gap: index > 0 && finished && winner != null && Number.isFinite(winner)
        ? `+${Math.max(0, time - winner).toFixed(3)} s` : '—' };
  });
}

function podiumCar(slot: number) {
  const spec = CAR_SPECS[slot];
  const roof = ['M65 41 77 18 122 18 144 41', 'M54 41 81 23 121 23 151 41',
    'M81 42 87 28 114 28 124 42', 'M48 42 80 24 122 27 154 42'][slot];
  return `<svg viewBox="0 0 200 86" aria-hidden="true" focusable="false">
    <ellipse cx="100" cy="74" rx="83" ry="5" fill="#000" opacity=".3"/>
    <path d="${roof}Z" fill="${spec.color}"/><path d="M82 27h32l15 14H74Z" fill="#202e34"/>
    <path d="M17 44 43 38h115l25 10 3 18H15Z" fill="${spec.color}" stroke="#e8e0cf" stroke-opacity=".3"/>
    <path d="M20 59h163v7H20Z" fill="#172024" opacity=".7"/>
    <rect x="91" y="43" width="25" height="20" rx="2" fill="#f4ecd9"/>
    <text x="103.5" y="58" text-anchor="middle" fill="#222" font-family="system-ui" font-size="14" font-weight="800">${spec.number}</text>
    <g fill="#1b1e20" stroke="#646466" stroke-width="3"><circle cx="48" cy="64" r="14"/><circle cx="153" cy="64" r="14"/></g>
    <g fill="#aaa99f"><circle cx="48" cy="64" r="6"/><circle cx="153" cy="64" r="6"/></g>
    <path d="M172 47h10v5h-10Z" fill="#fff1c1"/><path d="M18 46h8v5h-8Z" fill="#ef795b"/>
  </svg>`;
}

export function buildRaceResults(replay: ReplayHistory, prepareReplay: () => Promise<unknown> = () => Promise.resolve()) {
  const root = document.createElement('aside');
  root.className = 'race-results';
  root.setAttribute('aria-label', 'Fin de carrera');
  root.hidden = true;
  root.innerHTML = `
    <div class="race-results-card">
      <header class="race-results-heading"><p data-course></p><h2 id="race-results-title" tabindex="-1">Bandera a cuadros</h2><p data-status role="status"></p></header>
      <ol class="race-podium" aria-label="Podio de la carrera"></ol>
      <section id="race-results-times" class="race-results-times" aria-label="Tiempos de carrera" hidden>
        <table><thead><tr><th scope="col">Pos.</th><th scope="col">Auto</th><th scope="col">Tiempo</th><th scope="col">Diferencia</th><th scope="col">Mejor vuelta</th></tr></thead><tbody></tbody></table>
      </section>
      <div class="race-results-actions">
        <button type="button" data-recap hidden>Ver resumen</button>
        <button type="button" data-times aria-expanded="false" aria-controls="race-results-times">Ver tiempos</button>
        <button type="button" data-dismiss>Volver al circuito</button>
      </div>
    </div>
    <div class="race-replay-controls" hidden><p class="race-results-caption" role="status"></p><button type="button" data-stop>Volver al podio</button></div>
    <button type="button" data-open hidden>Ver podio</button>`;
  document.body.append(root);
  const card = root.querySelector<HTMLElement>('.race-results-card')!;
  const heading = root.querySelector<HTMLHeadingElement>('h2')!;
  const course = root.querySelector<HTMLElement>('[data-course]')!;
  const status = root.querySelector<HTMLElement>('[data-status]')!;
  const podium = root.querySelector<HTMLOListElement>('ol')!;
  const toggle = root.querySelector<HTMLButtonElement>('[data-times]')!;
  const recap = root.querySelector<HTMLButtonElement>('[data-recap]')!;
  const times = root.querySelector<HTMLElement>('section')!;
  const tbody = root.querySelector('tbody')!;
  const replayControls = root.querySelector<HTMLElement>('.race-replay-controls')!;
  const caption = root.querySelector<HTMLParagraphElement>('.race-results-caption')!;
  const stop = root.querySelector<HTMLButtonElement>('[data-stop]')!;
  const open = root.querySelector<HTMLButtonElement>('[data-open]')!;
  let view: 'podium' | 'times' | 'replay' | 'collapsed' = 'podium';
  let heat: number | undefined;
  let rows = '';
  let request = 0;

  function show(next: typeof view, focus = false) {
    if (next === 'collapsed') { request++; recap.disabled = false; recap.textContent = 'Ver resumen'; }
    view = next;
    root.dataset.view = next;
    root.setAttribute('role', next === 'collapsed' ? 'complementary' : 'dialog');
    if (next === 'collapsed') root.removeAttribute('aria-modal');
    else root.setAttribute('aria-modal', 'true');
    card.hidden = next === 'replay' || next === 'collapsed';
    podium.hidden = next !== 'podium';
    times.hidden = next !== 'times';
    replayControls.hidden = next !== 'replay';
    open.hidden = next !== 'collapsed';
    toggle.textContent = next === 'times' ? 'Ver podio' : 'Ver tiempos';
    toggle.setAttribute('aria-expanded', String(next === 'times'));
    document.body.classList.toggle('showing-results', !root.hidden && next !== 'collapsed');
    if (focus) (next === 'replay' ? stop : next === 'collapsed' ? open : heading).focus();
  }
  toggle.addEventListener('click', () => show(view === 'times' ? 'podium' : 'times'));
  recap.addEventListener('click', async () => {
    const pending = ++request;
    recap.disabled = true;
    recap.textContent = 'Preparando resumen…';
    try {
      await prepareReplay();
      if (pending === request && !root.hidden && replay.startSummary(performance.now())) show('replay', true);
    } catch (error) {
      console.error('No se pudo preparar el resumen.', error);
      if (pending === request) status.textContent = 'No se pudo cargar el resumen. Podés volver a intentarlo.';
    } finally {
      if (pending === request) { recap.disabled = false; recap.textContent = 'Ver resumen'; }
    }
  });
  const returnToPodium = () => { replay.stop(); show('podium', true); };
  stop.addEventListener('click', returnToPodium);
  open.addEventListener('click', () => show('podium', true));
  root.querySelector<HTMLButtonElement>('[data-dismiss]')!.addEventListener('click', () => {
    show('collapsed', true);
  });
  root.addEventListener('keydown', event => {
    if (event.key === 'Tab' && view !== 'collapsed') {
      const buttons = [...root.querySelectorAll<HTMLButtonElement>('button')].filter(button => !button.disabled && button.getClientRects().length);
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === heading)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    if (event.key !== 'Escape') return;
    event.preventDefault();
    if (view === 'replay') returnToPodium();
    else show(view === 'podium' ? 'collapsed' : 'podium', true);
  });

  return {
    update(state: RaceSnapshot) {
      const showing = state.phase === 'results';
      const entering = showing && (root.hidden || heat !== state.heat);
      root.hidden = !showing;
      if (!showing) {
        request++; recap.disabled = false; recap.textContent = 'Ver resumen';
        if (view === 'replay') replay.stop();
        show('podium');
        rows = '';
        return;
      }
      heat = state.heat;
      if (entering) { request++; recap.disabled = false; recap.textContent = 'Ver resumen'; show('podium', true); }
      recap.hidden = !replay.available;
      const results = raceClassification(state);
      const key = JSON.stringify([state.config?.course, state.config?.laps, results]);
      if (key === rows) return;
      rows = key;
      course.textContent = COURSE_OPTIONS[state.config?.course ?? 'taller'].label;
      const finishers = results.filter(result => result.place !== null);
      status.textContent = finishers.length ? `${finishers.length} de ${results.length} autos en la meta` : 'No se registraron llegadas';
      podium.replaceChildren(...finishers.slice(0, 3).map(result => {
        const step = document.createElement('li');
        step.className = `race-podium-place race-podium-place-${result.place}`;
        step.style.setProperty('--car-color', result.spec.color);
        step.innerHTML = `${podiumCar(result.slot)}<div class="race-podium-step"><span class="race-podium-rank">${result.place}<span>º</span></span><strong>${result.spec.number} · ${result.spec.name}</strong><span class="race-podium-time">${result.time}</span></div>`;
        return step;
      }));
      tbody.replaceChildren(...results.map(({ spec, place, time, bestLap, gap }) => {
        const row = document.createElement('tr');
        for (const value of [place ?? 'DNF', `${spec.number} · ${spec.name}`, time, gap, bestLap]) {
          row.insertCell().textContent = String(value);
        }
        return row;
      }));
    },
    showReplay(moment: ReturnType<ReplayHistory['sample']>) {
      if (moment) {
        if (view !== 'replay') show('replay');
        const text = `${moment.clip + 1}/${moment.count} · ${replayLabels[moment.kind]}`;
        if (caption.textContent !== text) caption.textContent = text;
      } else if (view === 'replay' && !replay.playing) show('podium', true);
    },
  };
}
