import './style.css';
import type { ViewMode } from './race-views';
import { applyQuality, audioLimits, defaultAudioSettings, saveAudioSettings, type AudioChannel, type AudioSettings } from './settings';

const audioLabels: Record<AudioChannel, string> = {
  master: 'Volumen general', music: 'Música', engines: 'Motores', effects: 'Efectos',
};
const audioChannels = Object.keys(audioLabels) as AudioChannel[];

interface ViewControlsOptions {
  multiplayer: boolean;
  lowQuality: boolean;
  audio: AudioSettings;
  onAudioChange: (settings: AudioSettings) => void;
}

export function buildViewControls({ multiplayer, lowQuality, audio, onAudioChange }: ViewControlsOptions) {
  const root = document.createElement('div');
  root.className = 'view-tools';
  root.innerHTML = `
    <button type="button" class="view-tools-trigger" aria-expanded="false"
      aria-controls="view-tools-panel" aria-keyshortcuts="C">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 5h16M4 12h16M4 19h16M8 3v4m8 3v4M9 17v4"
          stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
      </svg>
      Configuración
    </button>
    <section class="view-tools-panel" id="view-tools-panel" aria-label="Configuración del juego" hidden>
      <fieldset class="view-tools-sound">
        <legend>Sonido</legend>
        ${audioChannels.map(channel => `<label class="view-tools-slider">
          <span>${audioLabels[channel]}</span><span class="view-tools-value" aria-hidden="true"></span>
          <input type="range" data-channel="${channel}" min="0" max="${audioLimits[channel] * 100}" step="1">
        </label>`).join('')}
        <div class="view-tools-actions">
          <label class="view-tools-mute"><input type="checkbox" data-mute><span>Silenciar todo</span></label>
          <button type="button" data-reset>Restablecer sonido</button>
        </div>
      </fieldset>
      <fieldset class="view-tools-views">
        <legend>Cámara principal</legend>
        <label><input type="radio" name="camera-view" value="general" aria-keyshortcuts="1" checked>
          <span>General</span><kbd aria-hidden="true">1</kbd></label>
        <label><input type="radio" name="camera-view" value="chase" aria-keyshortcuts="2">
          <span>Persecución</span><kbd aria-hidden="true">2</kbd></label>
        <label><input type="radio" name="camera-view" value="trackside" aria-keyshortcuts="3">
          <span>A ras</span><kbd aria-hidden="true">3</kbd></label>
      </fieldset>
      ${multiplayer ? `<label class="view-tools-split"><input type="checkbox" data-split aria-keyshortcuts="M" aria-describedby="view-tools-status">
        <span>Pantalla dividida</span><kbd aria-hidden="true">M</kbd></label>
      <p id="view-tools-status" class="view-tools-status" role="status"></p>` : ''}
      <fieldset class="view-tools-graphics">
        <legend>Gráficos</legend>
        <label class="view-tools-quality">
          <span>Calidad gráfica</span>
          <select><option value="full">Completa</option><option value="low">Ligera</option></select>
        </label>
        <button type="button" data-apply-quality disabled>Aplicar y recargar</button>
      </fieldset>
    </section>`;
  document.body.append(root);

  const trigger = root.querySelector<HTMLButtonElement>('button')!;
  const panel = root.querySelector<HTMLElement>('section')!;
  const split = root.querySelector<HTMLInputElement>('[data-split]');
  const status = root.querySelector<HTMLParagraphElement>('.view-tools-status');
  const mute = root.querySelector<HTMLInputElement>('[data-mute]')!;
  const reset = root.querySelector<HTMLButtonElement>('[data-reset]')!;
  const quality = root.querySelector<HTMLSelectElement>('select')!;
  const apply = root.querySelector<HTMLButtonElement>('[data-apply-quality]')!;
  const sliders = Array.from(root.querySelectorAll<HTMLInputElement>('[data-channel]'), slider => ({
    slider,
    channel: slider.dataset.channel as AudioChannel,
    output: slider.parentElement!.querySelector<HTMLElement>('.view-tools-value')!,
  }));
  let audioSettings = { ...audio };
  const initialQuality = lowQuality ? 'low' : 'full';
  quality.value = initialQuality;
  const modes = {
    general: root.querySelector<HTMLInputElement>('input[value=general]')!,
    chase: root.querySelector<HTMLInputElement>('input[value=chase]')!,
    trackside: root.querySelector<HTMLInputElement>('input[value=trackside]')!,
  };
  let currentMode: ViewMode = 'general';
  let playerCount = 0;

  function showAudioSettings() {
    mute.checked = audioSettings.muted;
    for (const { slider, channel, output } of sliders) {
      slider.value = String(Math.round(audioSettings[channel] * 100));
      const value = `${slider.value} %`;
      output.textContent = value;
      slider.setAttribute('aria-valuetext', value);
    }
  }

  function commitAudioSettings() {
    saveAudioSettings(audioSettings);
    onAudioChange(audioSettings);
  }

  showAudioSettings();
  for (const { slider, channel } of sliders) {
    slider.addEventListener('input', () => {
      audioSettings = { ...audioSettings, [channel]: slider.valueAsNumber / 100 };
      showAudioSettings();
      commitAudioSettings();
    });
  }
  mute.addEventListener('change', () => {
    audioSettings = { ...audioSettings, muted: mute.checked };
    commitAudioSettings();
  });
  reset.addEventListener('click', () => {
    audioSettings = { ...defaultAudioSettings };
    showAudioSettings();
    commitAudioSettings();
  });
  quality.addEventListener('change', () => { apply.disabled = quality.value === initialQuality; });
  apply.addEventListener('click', () => applyQuality(quality.value === 'low' ? 'low' : 'full'));

  function selectMode(mode: ViewMode, moveFocus = false) {
    currentMode = mode;
    modes[mode].checked = true;
    if (moveFocus) modes[mode].focus();
  }

  function setOpen(open: boolean, moveFocus = false) {
    panel.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
    if (moveFocus) (open ? sliders[0].slider : trigger).focus();
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
    if (event.key === 'Escape' && !panel.hidden) {
      event.preventDefault();
      setOpen(false, root.contains(document.activeElement));
      return;
    }
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || target.matches('textarea, select'))) return;

    const key = event.key.toLowerCase();
    if (key === 'c') {
      event.preventDefault();
      setOpen(panel.hidden, true);
    } else if (key === 'm' && split) {
      event.preventDefault();
      split.checked = !split.checked;
      updateStatus();
    } else if (['1', '2', '3'].includes(key) && !(target instanceof HTMLInputElement && target.type === 'range')) {
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
