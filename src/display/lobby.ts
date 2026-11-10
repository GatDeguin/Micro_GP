import { CAR_SPECS, type RaceConfig } from '../shared/protocol.ts';
import { LIVERIES } from '../shared/liveries.ts';
import type { DisplayLobbyPacket } from '../shared/lobby.ts';
import { placardLayout } from './signs';
import './lobby.css';

export function buildMultiplayerLobby() {
  const panel = document.createElement('section');
  panel.className = 'lan-lobby';
  panel.setAttribute('aria-labelledby', 'lan-lobby-title');
  panel.innerHTML = `
    <header class="lan-lobby-header">
      <p class="lan-lobby-kicker">Micro GP <span>·</span> Taller 07</p>
      <h2 id="lan-lobby-title">Sala de carrera</h2>
    </header>
    <div class="lan-lobby-content">
      <div class="lan-lobby-invite">
        <strong>Mandos por QR</strong>
        <p>Escaneá la placa de abajo a la derecha desde la misma red Wi-Fi.</p>
        <a target="_blank" rel="noopener" hidden>Abrir mando</a>
      </div>
      <fieldset class="lan-lobby-config" disabled>
        <legend>Configuración de la pista</legend>
        <label>Modo<select name="mode"><option value="race">Carrera</option><option value="practice">Práctica</option></select></label>
        <label>Vueltas<select name="laps">${Array.from({ length: 12 }, (_, i) => `<option>${i + 1}</option>`).join('')}</select></label>
        <label>Bots<select name="bots">${Array.from({ length: 4 }, (_, i) => `<option>${i}</option>`).join('')}</select></label>
        <label>Dificultad<select name="difficulty"><option value="rookie">Principiante</option><option value="club">Club</option><option value="pro">Pro</option></select></label>
        <label class="lan-lobby-night"><input name="night" type="checkbox"> Iluminación nocturna</label>
      </fieldset>
    </div>
    <ul class="lan-lobby-slots" aria-label="Plazas" aria-live="polite" aria-atomic="true"></ul>
    <footer class="lan-lobby-footer">
      <p role="status">Conectando con la sala…</p>
      <button type="button" disabled>Confirmar salida</button>
    </footer>`;

  const end = document.createElement('div');
  end.className = 'lan-lobby-return';
  end.hidden = true;
  end.innerHTML = '<span role="status"></span><button type="button">Volver a la sala</button>';
  document.body.append(panel, end);

  const invite = panel.querySelector<HTMLAnchorElement>('a')!;
  const config = panel.querySelector<HTMLFieldSetElement>('fieldset')!;
  const laps = config.querySelector<HTMLSelectElement>('[name="laps"]')!;
  const bots = config.querySelector<HTMLSelectElement>('[name="bots"]')!;
  const difficulty = config.querySelector<HTMLSelectElement>('[name="difficulty"]')!;
  const mode = config.querySelector<HTMLSelectElement>('[name="mode"]')!;
  const night = config.querySelector<HTMLInputElement>('[name="night"]')!;
  const status = panel.querySelector<HTMLElement>('[role="status"]')!;
  const roster = panel.querySelector<HTMLUListElement>('ul')!;
  const launch = panel.querySelector<HTMLButtonElement>('button')!;
  const returnStatus = end.querySelector<HTMLElement>('span')!;
  const returnButton = end.querySelector<HTMLButtonElement>('button')!;
  const slots = CAR_SPECS.map((car) => {
    const item = document.createElement('li');
    item.style.setProperty('--lobby-car', car.color);
    item.innerHTML = `<strong>${car.number}</strong><span>${car.name}</span><small></small>`;
    roster.append(item);
    return { item, label: item.querySelector<HTMLElement>('small')! };
  });

  let connection: WebSocket | undefined;
  let latest: DisplayLobbyPacket | undefined;

  function leavePlacardClear() {
    const rect = panel.getBoundingClientRect();
    const plate = placardLayout(innerWidth, innerHeight);
    const reserved = rect.right + 12 >= plate.left ? Math.ceil(innerHeight - plate.top + 12) : 16;
    panel.style.setProperty('--lobby-reserved', `${reserved}px`);
  }
  addEventListener('resize', leavePlacardClear);
  leavePlacardClear();

  function send(message: object) {
    if (connection?.readyState === WebSocket.OPEN && latest?.host) connection.send(JSON.stringify(message));
  }

  function render({ lobby, host }: DisplayLobbyPacket) {
    panel.hidden = lobby.phase !== 'lobby';
    end.hidden = !host || (lobby.phase !== 'results' && lobby.phase !== 'practice');
    returnButton.textContent = lobby.phase === 'practice' ? 'Terminar práctica' : 'Volver a la sala';
    returnButton.disabled = false;
    returnStatus.textContent = '';
    if (panel.hidden) return;
    leavePlacardClear();

    config.disabled = !host;
    laps.value = String(lobby.config.laps);
    laps.disabled = lobby.config.mode === 'practice';
    bots.value = String(lobby.config.bots);
    difficulty.value = lobby.config.difficulty;
    mode.value = lobby.config.mode;
    night.checked = lobby.config.night;

    const players = lobby.slots.filter(slot => slot !== null);
    const ready = players.filter(slot => slot.connected && slot.ready).length;
    for (const [index, { item, label }] of slots.entries()) {
      const slot = lobby.slots[index];
      item.dataset.status = slot ? slot.connected ? slot.ready ? 'ready' : 'joined' : 'reserved' : 'free';
      const livery = LIVERIES.find(option => option.id === slot?.livery);
      const state = slot ? slot.connected ? slot.ready ? 'Listo' : 'En sala' : 'Reconectando' : 'Libre';
      const text = livery && livery.id !== 'original' ? `${state} · ${livery.label}` : state;
      if (label.textContent !== text) label.textContent = text;
    }
    const effectiveBots = Math.min(lobby.config.bots, CAR_SPECS.length - players.length);
    status.textContent = host
      ? players.length ? `${ready}/${players.length} listos · ${effectiveBots} ${effectiveBots === 1 ? 'bot' : 'bots'} en pista` : 'Esperando al primer mando.'
      : 'La pantalla anfitriona confirma la salida.';
    launch.textContent = lobby.config.mode === 'practice' ? 'Iniciar práctica' : 'Confirmar salida';
    launch.disabled = !host || !lobby.canLaunch;
  }

  config.addEventListener('change', () => {
    const settings: RaceConfig = {
      laps: Number(laps.value), bots: Number(bots.value), difficulty: difficulty.value as RaceConfig['difficulty'],
      mode: mode.value as RaceConfig['mode'], night: night.checked,
    };
    send({ type: 'configure', config: settings });
  });
  launch.addEventListener('click', () => {
    launch.disabled = true;
    send({ type: 'launch' });
  });
  returnButton.addEventListener('click', () => {
    returnButton.disabled = true;
    send({ type: 'return' });
  });

  return {
    handle(message: unknown, socket: WebSocket): boolean {
      if (!message || typeof message !== 'object' || !('type' in message)) return false;
      if (message.type === 'hello' && 'url' in message && typeof message.url === 'string') {
        invite.href = message.url;
        invite.hidden = false;
        return false;
      }
      if (message.type === 'lobby' && 'lobby' in message && 'host' in message) {
        connection = socket;
        latest = message as DisplayLobbyPacket;
        render(latest);
        return true;
      }
      if (message.type === 'error' && 'message' in message && typeof message.message === 'string') {
        if (latest) render(latest);
        if (panel.hidden) returnStatus.textContent = message.message;
        else status.textContent = message.message;
        return true;
      }
      return false;
    },
    disconnect() {
      connection = undefined;
      latest = undefined;
      config.disabled = true;
      launch.disabled = true;
      returnButton.disabled = true;
      status.textContent = 'Reconectando con la sala…';
      returnStatus.textContent = 'Reconectando…';
    },
  };
}
