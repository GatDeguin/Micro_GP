import { bindControls } from '../controller/controls';
import { CAR_SPECS, COURSE_OPTIONS, isCourseId, normalizeRaceConfig, type CourseId, type DriveInput, type Driver, type Livery, type RaceSnapshot } from '../shared/protocol';
import { advanceLiveryProgress, bestSectorsFor, LIVERIES, normalizeLiveryProgress, unlockedLiveries } from '../shared/liveries';
import { Race } from '../sim/race';
import { preferLandscape } from './landscape';

type Action = 'left' | 'right' | 'gas' | 'brake';
const keys = new Map<string, Action>([
  ['ArrowLeft', 'left'], ['KeyA', 'left'], ['ArrowRight', 'right'], ['KeyD', 'right'],
  ['ArrowUp', 'gas'], ['KeyW', 'gas'], ['ArrowDown', 'brake'], ['KeyS', 'brake'],
]);
const step = 1 / 60;
const soloSaveKey = 'micro-gp:solo';

function loadGarage() {
  let saved: { config?: unknown; slot?: number; progress?: unknown[]; liveries?: Livery[]; lapsByCourse?: Partial<Record<CourseId, number>> } | null = null;
  try { saved = JSON.parse(localStorage.getItem(soloSaveKey) ?? 'null'); } catch { /* Use defaults. */ }
  const slot = CAR_SPECS.findIndex((_, index) => index === saved?.slot);
  const config = normalizeRaceConfig(saved?.config);
  const lapsByCourse = {
    taller: normalizeRaceConfig({ course: 'taller', laps: saved?.lapsByCourse?.taller }).laps,
    dique: normalizeRaceConfig({ course: 'dique', laps: saved?.lapsByCourse?.dique }).laps,
    [config.course]: config.laps,
  };
  const progress = CAR_SPECS.map((_, index) => normalizeLiveryProgress(saved?.progress?.[index]));
  const liveries = progress.map((record, index): Livery => {
    const savedLivery = saved?.liveries?.[index];
    return savedLivery && unlockedLiveries(record).includes(savedLivery) ? savedLivery : 'original';
  });
  return { slot: Math.max(0, slot), config, lapsByCourse, progress, liveries };
}

export function startSolo(
  onState: (snapshot: RaceSnapshot, now?: number) => void,
  onCourseSelected?: (course: CourseId) => void,
) {
  const panel = document.createElement('div');
  panel.className = 'solo';
  const garage = loadGarage();
  const carOptions = CAR_SPECS.map((car, index) => `<option value="${index}">${car.number} · ${car.name}</option>`).join('');
  const courseOptions = Object.entries(COURSE_OPTIONS).map(([id, option]) => `<option value="${id}">${option.label}</option>`).join('');
  panel.innerHTML = `
    <div class="solo-menu">
      <form class="solo-setup" id="solo-setup" aria-label="Preparar partida" hidden>
        <h2>Preparar partida</h2>
        <label>Circuito <select name="course">${courseOptions}</select></label>
        <label>Modo <select name="mode"><option value="race">Carrera</option><option value="practice">Práctica libre</option></select></label>
        <label>Vueltas <input name="laps" type="number" min="1" max="12" required></label>
        <label>Rivales <select name="bots">${[0, 1, 2, 3].map(value => `<option>${value}</option>`).join('')}</select></label>
        <label>Dificultad <select name="difficulty"><option value="rookie">Principiante</option><option value="club">Club</option><option value="pro">Pro</option></select></label>
        <label>Auto <select name="car">${carOptions}</select></label>
        <label>Librea <select name="livery"></select></label>
        <p data-challenges class="solo-challenges"></p>
        <label class="solo-night"><input name="night" type="checkbox"> Sesión nocturna</label>
        <label class="solo-arcade"><input name="arcade" type="checkbox" aria-describedby="solo-arcade-hint"> Modo Arcade</label>
        <p id="solo-arcade-hint" class="solo-arcade-hint">Recogé las cajas para activar su efecto. El aceite y los petardos quedan atrás.</p>
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
      <p class="landscape-hint">Girá el celular para jugar en horizontal.</p>
      <p class="solo-hint">Flechas o WASD · Cámaras 1 a 4</p>
    </div>
    <div class="solo-pedals" aria-label="Mandos táctiles" hidden>
      <div class="steering" tabindex="-1" role="slider" aria-label="Giro"
        aria-orientation="horizontal" aria-valuemin="-100" aria-valuemax="100" aria-valuenow="0"
        aria-valuetext="Centro" aria-disabled="true">
        <span class="steering-socket" aria-hidden="true"><span class="steering-boot"></span></span>
        <span class="steering-arm" aria-hidden="true">
          <span class="steering-shaft"></span>
          <span class="steering-knob"></span>
        </span>
      </div>
      <div>
        <button type="button" data-action="brake" aria-pressed="false" disabled>Freno</button>
        <button type="button" data-action="gas" aria-pressed="false" disabled>Gas</button>
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
  const course = setup.querySelector<HTMLSelectElement>('[name=course]')!;
  const mode = setup.querySelector<HTMLSelectElement>('[name=mode]')!;
  const laps = setup.querySelector<HTMLInputElement>('[name=laps]')!;
  const night = setup.querySelector<HTMLInputElement>('[name=night]')!;
  const arcade = setup.querySelector<HTMLInputElement>('[name=arcade]')!;
  const bots = setup.querySelector<HTMLSelectElement>('[name=bots]')!;
  const difficulty = setup.querySelector<HTMLSelectElement>('[name=difficulty]')!;
  const challenges = setup.querySelector<HTMLParagraphElement>('[data-challenges]')!;
  const pedals = panel.querySelector<HTMLElement>('.solo-pedals')!;
  const race = new Race({ manual: true });
  const input: DriveInput = { x: 0, gas: false, brake: false };
  const driver: Driver = { owned: false, input };
  const drivers: (Driver | undefined)[] = [];
  const heldKeys = new Set<string>();
  const touch = bindControls({
    steering: pedals.querySelector<HTMLElement>('.steering')!,
    brake: pedals.querySelector<HTMLButtonElement>('[data-action=brake]')!,
    gas: pedals.querySelector<HTMLButtonElement>('[data-action=gas]')!,
  }, () => driver.owned);
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
    if (arcade.checked) {
      challenges.textContent = 'Los récords y las libreas se consiguen en modo clásico.';
      return;
    }
    const clean = progress.clean ? 'Vuelta limpia desbloqueada.' : 'Completá una vuelta limpia.';
    const sector = progress.sector ? 'Récord de sector desbloqueado.'
      : bestSectorsFor(progress, garage.config.course).some(time => time !== null) ? 'Mejorá un parcial propio por 0,05 s.'
      : 'Marcá un parcial y mejoralo para desbloquear Récord de sector.';
    challenges.textContent = `${clean} ${sector}`;
  }

  function showSetup(visible: boolean) {
    setup.hidden = !visible;
    prepare.setAttribute('aria-expanded', String(visible));
  }

  function syncMode() { laps.disabled = mode.value === 'practice'; }

  carSelect.value = String(garage.slot);
  course.value = garage.config.course;
  mode.value = garage.config.mode;
  bots.value = String(garage.config.bots);
  difficulty.value = garage.config.difficulty;
  laps.value = String(garage.config.laps);
  night.checked = garage.config.night;
  arcade.checked = garage.config.arcade === true;
  syncMode();
  showLiveries();
  carSelect.addEventListener('change', showLiveries);
  course.addEventListener('change', () => {
    if (driver.owned || !isCourseId(course.value)) return;
    const selected = course.value;
    const previous = garage.config.course;
    if (previous === selected) return;
    const config = { ...garage.config, course: selected, laps: garage.lapsByCourse[selected] };
    if (!race.configure(config)) return;
    const editedLaps = laps.valueAsNumber;
    if (Number.isInteger(editedLaps) && editedLaps >= 1 && editedLaps <= 12) garage.lapsByCourse[previous] = editedLaps;
    garage.config = config;
    laps.value = String(config.laps);
    saveGarage();
    showLiveries();
    onCourseSelected?.(selected);
    update(race.snapshot());
  });
  mode.addEventListener('change', syncMode);
  arcade.addEventListener('change', showLiveries);
  livery.addEventListener('change', () => { garage.liveries[Number(carSelect.value)] = livery.value as Livery; });
  prepare.addEventListener('click', () => {
    if (setup.hidden) void preferLandscape();
    showSetup(setup.hidden);
  });

  function resetInput() {
    heldKeys.clear();
    touch.reset();
  }

  function showTouch(visible: boolean) {
    pedals.hidden = !visible;
    touch.setEnabled(visible);
  }

  function start(config: ReturnType<typeof normalizeRaceConfig>, slot: number) {
    if (!race.configure(config) || !race.launch()) return;
    void preferLandscape();
    garage.config = config;
    garage.lapsByCourse[config.course] = config.laps;
    garage.slot = slot;
    saveGarage();
    resetInput();
    driver.owned = true;
    driver.livery = garage.liveries[slot];
    drivers[slot] = driver;
    showSetup(false);
    prepare.hidden = true;
    toggle.textContent = 'Volver a exhibición';
    showTouch(true);
  }

  setup.addEventListener('submit', event => {
    event.preventDefault();
    start(normalizeRaceConfig({
      course: course.value, mode: mode.value, laps: laps.valueAsNumber, bots: Number(bots.value), difficulty: difficulty.value,
      night: night.checked, arcade: arcade.checked,
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
    showTouch(false);
    pit.hidden = practiceNote.hidden = unlock.hidden = true;
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

  function held(action: Action) {
    for (const key of heldKeys) if (keys.get(key) === action) return true;
    return false;
  }

  function update(snapshot: RaceSnapshot, now?: number) {
    onState(snapshot, now);
    if (phase !== snapshot.phase) {
      phase = snapshot.phase;
      showTouch(driver.owned && phase !== 'results');
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
    if (garage.config.arcade) return;
    const previous = garage.progress[garage.slot];
    const record = advanceLiveryProgress(previous, car, snapshot.config?.course ?? garage.config.course);
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

  race.configure(garage.config);
  onCourseSelected?.(garage.config.course);
  update(race.snapshot());
  return {
    advance(dt: number, now?: number) {
      elapsed += dt;
      if (elapsed < step) return;
      input.x = touch.input.x || Number(held('right')) - Number(held('left'));
      input.gas = touch.input.gas || held('gas');
      input.brake = touch.input.brake || held('brake');
      while (elapsed >= step) {
        race.step(step, drivers);
        elapsed -= step;
        ticks++;
      }
      if (ticks >= 3) {
        ticks %= 3;
        update(race.snapshot(), now);
      }
    },
  };
}
