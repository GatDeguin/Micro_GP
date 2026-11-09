import type { DriveInput, Driver, RaceSnapshot } from '../shared/protocol';
import { Race } from '../sim/race';

type Action = 'left' | 'right' | 'gas' | 'brake';
const keys = new Map<string, Action>([
  ['ArrowLeft', 'left'], ['KeyA', 'left'], ['ArrowRight', 'right'], ['KeyD', 'right'],
  ['ArrowUp', 'gas'], ['KeyW', 'gas'], ['ArrowDown', 'brake'], ['KeyS', 'brake'],
]);
const step = 1 / 60;

export function startSolo(onState: (snapshot: RaceSnapshot) => void) {
  const panel = document.createElement('div');
  panel.className = 'solo';
  panel.innerHTML = `
    <div class="solo-menu">
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
  const pedals = panel.querySelector<HTMLElement>('.solo-pedals')!;
  const race = new Race();
  const input: DriveInput = { x: 0, gas: false, brake: false };
  const driver: Driver = { owned: false, input };
  const drivers = [driver];
  const heldKeys = new Set<string>();
  const heldPointers = new Map<number, Action>();
  let elapsed = 0;
  let ticks = 0;

  function resetInput() {
    heldKeys.clear();
    heldPointers.clear();
  }

  toggle.addEventListener('click', () => {
    resetInput();
    driver.owned = !driver.owned;
    toggle.textContent = driver.owned ? 'Volver a exhibición' : 'Jugar';
    pedals.hidden = !driver.owned;
  });
  addEventListener('keydown', event => {
    if (!driver.owned || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || !keys.has(event.code)) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || target.matches('input, textarea, select'))) return;
    event.preventDefault();
    heldKeys.add(event.code);
  });
  addEventListener('keyup', event => heldKeys.delete(event.code));
  addEventListener('blur', resetInput);
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

  onState(race.snapshot());
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
        onState(race.snapshot());
      }
    },
  };
}
