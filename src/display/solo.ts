import { CAR_SPECS, defaultRaceConfig, normalizeRaceConfig, type DriveInput, type Driver, type Livery, type RaceConfig, type RaceSnapshot } from '../shared/protocol';
import { advanceLiveryProgress, createLiveryProgress, LIVERIES, unlockedLiveries, type LiveryProgress } from '../shared/liveries';
import { Race } from '../sim/race';

type Action = 'left' | 'right' | 'gas' | 'brake';
const keys = new Map<string, Action>([
  ['ArrowLeft', 'left'], ['KeyA', 'left'], ['ArrowRight', 'right'], ['KeyD', 'right'],
  ['ArrowUp', 'gas'], ['KeyW', 'gas'], ['ArrowDown', 'brake'], ['KeyS', 'brake'],
]);
const step = 1 / 60;
const soloSaveKey = 'micro-gp:solo';

function loadGarage() {
  let saved: { config?: unknown; slot?: number; progress?: Partial<LiveryProgress>[]; liveries?: Livery[] } | null = null;
  try { saved = JSON.parse(localStorage.getItem(soloSaveKey) ?? 'null'); } catch { /* Use defaults. */ }
  const slot = CAR_SPECS.findIndex((_, index) => index === saved?.slot);
  const progress = CAR_SPECS.map((_, index) => {
    const entry = saved?.progress?.[index];
    const current = createLiveryProgress();
    current.clean = entry?.clean === true;
    current.sector = entry?.sector === true;
    current.bestSectors = current.bestSectors.map((_, sector) => {
      const time = entry?.bestSectors?.[sector];
      return typeof time === 'number' && Number.isFinite(time) && time > 0 ? time : null;
    });
    return current;
  });
  const liveries = progress.map((record, index): Livery => {
    const savedLivery = saved?.liveries?.[index];
    return savedLivery && unlockedLiveries(record).includes(savedLivery) ? savedLivery : 'original';
  });
  return { slot: Math.max(0, slot), config: normalizeRaceConfig(saved?.config ?? defaultRaceConfig), progress, liveries };
}

export function startSolo(onState: (snapshot: RaceSnapshot) => void) {
  const panel = document.createElement('div');
  panel.className = 'solo';
  const garage = loadGarage();
  const carOptions = CAR_SPECS.map((car, index) => `<option value="${index}">${car.number} · ${car.name}</option>`).join('');
  panel.innerHTML = `
    <div class="solo-menu">
      <form class="solo-setup" id="solo-setup" aria-label="Preparar partida" hidden>
        <h2>Preparar partida</h2>
        <label>Modo <select name="mode"><option value="race">Carrera</option><option value="practice">Práctica libre</option></select></label>
        <label>Vueltas <input name="laps" type="number" min="1" max="12" required></label>
        <label>Rivales <select name="bots">${[0, 1, 2, 3].map(value => `<option>${value}</option>`).join('')}</select></label>
        <label>Dificultad <select name="difficulty"><option value="rookie">Principiante</option><option value="club">Club</option><option value="pro">Pro</option></select></label>
        <label>Auto <select name="car">${carOptions}</select></label>
        <label>Librea <select name="livery"></select></label>
        <p data-challenges class="solo-challenges"></p>
        <label class="solo-night"><input name="night" type="checkbox"> Sesión nocturna</label>
        <button type="submit">Salir a pista</button>
      </form>
      <div class="solo-pit" aria-label="Boxes" hidden>
        <label>Cambiar auto en boxes <select name="pit-car">${carOptions}</select></label>
        <button type="button" data-pit-swap>Cambiar</button>
      </div>
      <p class="solo-practice-note" data-practice-note hidden></p>
      <p class="solo-practice-note" data-unlock role="status" hidden></p>
      <button type="button" class="solo-prepare" aria-controls="solo-setup" aria-expanded="false">Preparar partida</button>
      <button type="button" class="solo-toggle">Jugar</button>
      <p class="solo-hint">Flechas o WASD · Cámaras 1, 2 y 3</p>
    </div>
    <div class="solo-pedals" aria-label="Mandos táctiles" hidden>
      <div>
        <button type="button" data-action="left" aria-label="Girar a la izquierda">◀</button>
        <button type="button" data-action="right" aria-label="Girar a la derecha">▶</button>
      </div>
      <div>
        <button type="button" data-action="brake">Freno</button>
        <button type="button" data-action="gas">Gas</button>
      </div>
    </div>`;
  document.body.append(panel);

  const toggle = panel.querySelector<HTMLButtonElement>('.solo-toggle')!;
  const prepare = panel.querySelector<HTMLButtonElement>('.solo-prepare')!;
  const setup = panel.querySelector<HTMLFormElement>('.solo-setup')!;
  const pit = panel.querySelector<HTMLElement>('.solo-pit')!;
  const pitCar = pit.querySelector<HTMLSelectElement>('select')!;
  const pitSwap = pit.querySelector<HTMLButtonElement>('button')!;
  const practiceNote = panel.querySelector<HTMLParagraphElement>('[data-practice-note]')!;
  const unlock = panel.querySelector<HTMLParagraphElement>('[data-unlock]')!;
  const carSelect = setup.querySelector<HTMLSelectElement>('[name=car]')!;
  const livery = setup.querySelector<HTMLSelectElement>('[name=livery]')!;
  const mode = setup.querySelector<HTMLSelectElement>('[name=mode]')!;
  const laps = setup.querySelector<HTMLInputElement>('[name=laps]')!;
  const night = setup.querySelector<HTMLInputElement>('[name=night]')!;
  const bots = setup.querySelector<HTMLSelectElement>('[name=bots]')!;
  const difficulty = setup.querySelector<HTMLSelectElement>('[name=difficulty]')!;
  const challenges = setup.querySelector<HTMLParagraphElement>('[data-challenges]')!;
  const pedals = panel.querySelector<HTMLElement>('.solo-pedals')!;
  const race = new Race({ manual: true });
  const input: DriveInput = { x: 0, gas: false, brake: false };
  const driver: Driver = { owned: false, input };
  const drivers: (Driver | undefined)[] = [];
  const heldKeys = new Set<string>();
  const heldPointers = new Map<number, Action>();
  let elapsed = 0;
  let ticks = 0;
  let phase: RaceSnapshot['phase'] = 'demo';
  let unlockTimer = 0;

  function saveGarage() {
    try { localStorage.setItem(soloSaveKey, JSON.stringify(garage)); } catch { /* Use the current garage. */ }
  }

  function showLiveries() {
    const slot = Number(carSelect.value);
    const progress = garage.progress[slot];
    const unlocked = unlockedLiveries(progress);
    livery.replaceChildren(...LIVERIES.map(({ id, label }) => {
      const option = new Option(unlocked.includes(id) ? label : `${label} · bloqueada`, id);
      option.disabled = !unlocked.includes(id);
      return option;
    }));
    livery.value = garage.liveries[slot];
    const clean = progress.clean ? 'Vuelta limpia desbloqueada.' : 'Completá una vuelta limpia.';
    const sector = progress.sector ? 'Récord de sector desbloqueado.'
      : progress.bestSectors.some(time => time !== null) ? 'Mejorá un parcial propio por 0,05 s.'
      : 'Marcá un parcial y mejoralo para desbloquear Récord de sector.';
    challenges.textContent = `${clean} ${sector}`;
  }

  function showSetup(visible: boolean) {
    setup.hidden = !visible;
    prepare.setAttribute('aria-expanded', String(visible));
  }

  function syncMode() { laps.disabled = mode.value === 'practice'; }

  carSelect.value = String(garage.slot);
  mode.value = garage.config.mode;
  bots.value = String(garage.config.bots);
  difficulty.value = garage.config.difficulty;
  laps.value = String(garage.config.laps);
  night.checked = garage.config.night;
  syncMode();
  showLiveries();
  carSelect.addEventListener('change', showLiveries);
  mode.addEventListener('change', syncMode);
  livery.addEventListener('change', () => { garage.liveries[Number(carSelect.value)] = livery.value as Livery; });
  prepare.addEventListener('click', () => showSetup(setup.hidden));

  function resetInput() {
    heldKeys.clear();
    heldPointers.clear();
  }

  function start(config: RaceConfig, slot: number) {
    if (!race.configure(config) || !race.launch()) return;
    garage.config = config;
    garage.slot = slot;
    saveGarage();
    resetInput();
    driver.owned = true;
    driver.livery = garage.liveries[slot];
    drivers[slot] = driver;
    showSetup(false);
    prepare.hidden = true;
    toggle.textContent = 'Volver a exhibición';
    pedals.hidden = false;
  }

  setup.addEventListener('submit', event => {
    event.preventDefault();
    start(normalizeRaceConfig({
      mode: mode.value, laps: laps.valueAsNumber, bots: Number(bots.value), difficulty: difficulty.value, night: night.checked,
    }), Number(carSelect.value));
  });
  toggle.addEventListener('click', () => {
    if (!driver.owned) {
      if (!setup.hidden) setup.requestSubmit();
      else start(garage.config, garage.slot);
      return;
    }
    resetInput();
    driver.owned = false;
    drivers[garage.slot] = undefined;
    race.returnToDemo();
    toggle.textContent = 'Jugar';
    prepare.hidden = false;
    pit.hidden = practiceNote.hidden = pedals.hidden = unlock.hidden = true;
  });
  pitCar.addEventListener('change', () => { pitSwap.disabled = Number(pitCar.value) === garage.slot; });
  pitSwap.addEventListener('click', () => {
    const next = Number(pitCar.value);
    if (!race.swapPracticeCar(garage.slot, next)) return;
    drivers[garage.slot] = undefined;
    garage.slot = next;
    driver.livery = garage.liveries[next];
    drivers[next] = driver;
    carSelect.value = String(next);
    saveGarage();
    resetInput();
    pitSwap.disabled = true;
    showLiveries();
  });
  addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.defaultPrevented && !setup.hidden) {
      showSetup(false);
      prepare.focus();
      return;
    }
    if (!driver.owned || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || !keys.has(event.code)) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || target.matches('input, textarea, select'))) return;
    event.preventDefault();
    if (!event.repeat) heldKeys.add(event.code);
  });
  addEventListener('keyup', event => heldKeys.delete(event.code), { capture: true });
  addEventListener('blur', resetInput);
  addEventListener('pagehide', resetInput);
  document.addEventListener('visibilitychange', resetInput);

  for (const button of pedals.querySelectorAll<HTMLButtonElement>('[data-action]')) {
    const action = button.dataset.action as Action;
    button.addEventListener('pointerdown', event => {
      if (!driver.owned || event.button !== 0) return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      heldPointers.set(event.pointerId, action);
    });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
      button.addEventListener(event, pointer => heldPointers.delete(pointer.pointerId));
    }
  }

  function held(action: Action) {
    for (const key of heldKeys) if (keys.get(key) === action) return true;
    for (const pointer of heldPointers.values()) if (pointer === action) return true;
    return false;
  }

  function update(snapshot: RaceSnapshot) {
    onState(snapshot);
    if (phase !== snapshot.phase) {
      phase = snapshot.phase;
      pedals.hidden = !driver.owned || phase === 'results';
      if (phase === 'practice') practiceNote.textContent = 'Entrá al carril interior de boxes y detenete en una plaza para cambiar de auto.';
      practiceNote.hidden = phase !== 'practice';
    }
    if (!driver.owned) return;
    const car = snapshot.cars[garage.slot];
    const parked = phase === 'practice' && car.pitReady === true;
    if (parked && pit.hidden) {
      for (const option of pitCar.options) {
        const slot = Number(option.value);
        option.disabled = slot !== garage.slot && snapshot.cars[slot].owned;
      }
      pitCar.value = String(garage.slot);
      pitSwap.disabled = true;
    }
    pit.hidden = !parked;
    practiceNote.hidden = phase !== 'practice' || parked;
    const previous = garage.progress[garage.slot];
    const record = advanceLiveryProgress(previous, car);
    if (record !== previous) {
      garage.progress[garage.slot] = record;
      saveGarage();
      showLiveries();
      const earned = LIVERIES.filter(({ id }) => id !== 'original' && record[id] && !previous[id]);
      if (earned.length) {
        unlock.textContent = `Librea desbloqueada · ${earned.map(item => item.label).join(' y ')}`;
        unlock.hidden = false;
        clearTimeout(unlockTimer);
        unlockTimer = window.setTimeout(() => { unlock.hidden = true; }, 4500);
      }
    }
  }

  update(race.snapshot());
  return {
    advance(dt: number) {
      elapsed += dt;
      if (elapsed < step) return;
      input.x = Number(held('right')) - Number(held('left'));
      input.gas = held('gas');
      input.brake = held('brake');
      while (elapsed >= step) {
        race.step(step, drivers);
        elapsed -= step;
        ticks++;
      }
      if (ticks >= 3) {
        ticks %= 3;
        update(race.snapshot());
      }
    },
  };
}
