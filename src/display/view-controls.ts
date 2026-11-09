import './style.css';
import type { ViewMode } from './race-views';

export function buildViewControls(multiplayer = true) {
  const root = document.createElement('div');
  root.className = 'view-tools';
  root.innerHTML = `
    <button type="button" class="view-tools-trigger" aria-expanded="false"
      aria-controls="view-tools-panel" aria-keyshortcuts="C">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3.5" y="6.5" width="12.5" height="11" rx="2" stroke="currentColor" stroke-width="1.6" />
        <path d="M16 10l4.5-2.2v8.4L16 14" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
      </svg>
      Cámaras
    </button>
    <section class="view-tools-panel" id="view-tools-panel" aria-label="Configuración de cámaras" hidden>
      <fieldset class="view-tools-views">
        <legend>Cámara principal</legend>
        <label><input type="radio" name="camera-view" value="general" aria-keyshortcuts="1" checked>
          <span>General</span><kbd aria-hidden="true">1</kbd></label>
        <label><input type="radio" name="camera-view" value="chase" aria-keyshortcuts="2">
          <span>Persecución</span><kbd aria-hidden="true">2</kbd></label>
        <label><input type="radio" name="camera-view" value="trackside" aria-keyshortcuts="3">
          <span>A ras</span><kbd aria-hidden="true">3</kbd></label>
      </fieldset>
      ${multiplayer ? `<label class="view-tools-split"><input type="checkbox" aria-keyshortcuts="M" aria-describedby="view-tools-status">
        <span>Pantalla dividida</span><kbd aria-hidden="true">M</kbd></label>
      <p id="view-tools-status" class="view-tools-status" role="status"></p>` : ''}
    </section>`;
  document.body.append(root);

  const trigger = root.querySelector<HTMLButtonElement>('button')!;
  const panel = root.querySelector<HTMLElement>('section')!;
  const split = root.querySelector<HTMLInputElement>('input[type=checkbox]');
  const status = root.querySelector<HTMLParagraphElement>('.view-tools-status');
  const modes = {
    general: root.querySelector<HTMLInputElement>('input[value=general]')!,
    chase: root.querySelector<HTMLInputElement>('input[value=chase]')!,
    trackside: root.querySelector<HTMLInputElement>('input[value=trackside]')!,
  };
  let currentMode: ViewMode = 'general';
  let playerCount = 0;

  function selectMode(mode: ViewMode, moveFocus = false) {
    currentMode = mode;
    modes[mode].checked = true;
    if (moveFocus) modes[mode].focus();
  }

  function setOpen(open: boolean, moveFocus = false) {
    panel.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
    if (moveFocus) (open ? modes[currentMode] : trigger).focus();
  }

  function updateStatus() {
    if (!split || !status) return;
    let message = 'La división arranca con dos mandos conectados.';
    if (split.checked && playerCount < 2) message = 'Activada. Esperando dos mandos.';
    else if (playerCount >= 2) message = `${playerCount} mandos conectados. Vista dividida disponible.`;
    if (status.textContent !== message) status.textContent = message;
  }

  for (const mode of Object.keys(modes) as ViewMode[]) {
    modes[mode].addEventListener('change', () => { if (modes[mode].checked) selectMode(mode); });
  }
  trigger.addEventListener('click', () => setOpen(panel.hidden));
  split?.addEventListener('change', updateStatus);
  document.addEventListener('pointerdown', event => {
    if (!panel.hidden && event.target instanceof Node && !root.contains(event.target)) setOpen(false);
  });
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || target.matches('textarea, select, input:not([type=radio]):not([type=checkbox])'))) return;

    const key = event.key.toLowerCase();
    if (key === 'escape' && !panel.hidden) {
      event.preventDefault();
      setOpen(false, root.contains(document.activeElement));
    } else if (key === 'c') {
      event.preventDefault();
      setOpen(panel.hidden, true);
    } else if (key === 'm' && split) {
      event.preventDefault();
      split.checked = !split.checked;
      updateStatus();
    } else if (key === '1' || key === '2' || key === '3') {
      event.preventDefault();
      const next = key === '1' ? 'general' : key === '2' ? 'chase' : 'trackside';
      selectMode(next, !panel.hidden && target instanceof HTMLInputElement && target.type === 'radio');
    }
  });
  updateStatus();

  return {
    get mode(): ViewMode { return currentMode; },
    get split(): boolean { return split?.checked ?? false; },
    setPlayerCount(count: number) {
      if (playerCount === count) return;
      playerCount = count;
      updateStatus();
    },
  };
}
