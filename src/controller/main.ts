import { CAR_SPECS, type Livery } from "../shared/protocol.ts";
import { LIVERIES } from "../shared/liveries.ts";
import type { ControllerLobbyPacket } from "../shared/lobby.ts";
import { bindControls } from "./controls.ts";
import { controllerLink, type LinkStatus } from "./link.ts";
import "./panel.css";

const panel = document.querySelector<HTMLElement>(".panel")!;
const carNumber = document.querySelector<HTMLElement>("#car-number")!;
const carName = document.querySelector<HTMLElement>("#car-name")!;
const statusLabel = document.querySelector<HTMLElement>("#link-status")!;
const garage = document.querySelector<HTMLElement>(".garage")!;
const deck = document.querySelector<HTMLElement>(".deck")!;
const roster = document.querySelector<HTMLElement>("#garage-cars")!;
const livery = document.querySelector<HTMLSelectElement>("#garage-livery")!;
const ready = document.querySelector<HTMLButtonElement>("#garage-ready")!;
const pit = document.querySelector<HTMLButtonElement>("#mando-pit")!;
const instruction = document.querySelector<HTMLElement>("#mando-instruction")!;
const garageStatus = document.querySelector<HTMLElement>("#garage-status")!;
const labels: Record<LinkStatus, string> = {
  connecting: "Conectando",
  reconnecting: "Reconectando",
  connected: "Conectado",
  full: "Sala completa",
  "in-progress": "Carrera en curso",
  invalid: "Sala no disponible",
  replaced: "Mando en otra pestaña",
};

let foreground = !document.hidden;
let status: LinkStatus = "connecting";
let latest: ControllerLobbyPacket | undefined;
let garageOpen = false;
let driving = false;
const room = /^\/mando\/([\w-]+)\/?$/.exec(location.pathname)?.[1];
const link = room ? controllerLink(room, showStatus, showLobby, showError) : null;
const controls = bindControls({
  steering: document.querySelector<HTMLElement>("#steering")!,
  brake: document.querySelector<HTMLButtonElement>("#brake")!,
  gas: document.querySelector<HTMLButtonElement>("#gas")!,
}, () => foreground && !document.hidden, (input) => {
  if (driving) link?.send(input);
});

const choices = CAR_SPECS.map((car, index) => {
  const button = document.createElement("button");
  button.type = "button";
  button.disabled = true;
  button.style.setProperty("--choice-color", car.color);
  button.innerHTML = `<strong>${car.number}</strong><span>${car.name}</span><small></small>`;
  button.setAttribute("aria-pressed", "false");
  button.addEventListener("click", () => {
    const selection = latest?.lobby.slots[latest.car];
    if (selection) link?.select(index, selection.livery);
  });
  roster.append(button);
  return { button, detail: button.querySelector("small")! };
});

const liveries = LIVERIES.map((option) => {
  const element = new Option(option.label, option.id);
  livery.add(element);
  return { ...option, element };
});

function paintCar(slot?: number) {
  const car = slot === undefined ? undefined : CAR_SPECS[slot];
  carNumber.textContent = car?.number ?? "—";
  carName.textContent = car?.name ?? "Sin auto";
  panel.style.setProperty("--car-color", car?.color ?? "var(--ivory)");
}

function render() {
  const lobby = latest?.lobby;
  const phase = lobby?.phase ?? "lobby";
  const car = latest?.car;
  const selection = car === undefined ? null : lobby?.slots[car];
  const connected = status === "connected" && !!selection;
  const inPit = connected && phase === "practice" && latest?.pitReady === true;
  if (!inPit) garageOpen = false;
  const choosing = phase === "lobby" || garageOpen;
  garage.hidden = !choosing;
  deck.hidden = choosing;
  pit.hidden = !inPit;
  instruction.hidden = inPit;
  instruction.textContent = phase === "grid" ? "En la grilla · esperá la salida" : phase === "results"
    ? "Carrera terminada · mirá los resultados" : "Mirá la pista compartida";
  pit.textContent = garageOpen ? "Volver al mando" : "Cambiar auto en boxes";
  ready.hidden = phase !== "lobby";
  ready.disabled = !connected || phase !== "lobby";
  ready.textContent = selection?.ready ? "Cancelar listo" : "Estoy listo";
  ready.setAttribute("aria-pressed", String(selection?.ready === true));
  livery.disabled = !connected || !choosing;
  livery.value = selection?.livery ?? "original";
  for (const { id, label, element } of liveries) {
    element.disabled = id !== "original" && !latest?.unlocked.includes(id);
    element.textContent = element.disabled ? `${label} · bloqueada` : label;
  }
  for (const [index, { button, detail }] of choices.entries()) {
    const owned = index === car;
    const reserved = lobby?.slots[index];
    button.disabled = !connected || !choosing || (!owned && !!reserved);
    button.setAttribute("aria-pressed", String(owned));
    detail.textContent = owned ? "Tu auto" : reserved ? reserved.connected ? "Ocupado" : "Reservado" : "Libre";
  }
  garageStatus.textContent = connected ? phase === "practice" ? "Elegí un auto libre para salir de boxes."
    : selection?.ready ? "Listo. La pantalla anfitriona confirma la salida." : "Elegí tu auto y marcate como listo."
    : status === "in-progress" ? "Podés unirte al volver a la sala." : labels[status];
  const wasDriving = driving;
  const canDrive = connected && !garageOpen && (phase === "race" || phase === "practice");
  controls.setEnabled(canDrive);
  driving = canDrive;
  if (canDrive && !wasDriving) link?.send(controls.input);
}

function showStatus(next: LinkStatus, slot?: number) {
  status = next;
  panel.dataset.link = next;
  statusLabel.textContent = labels[next];
  if (next === "full" || next === "in-progress" || next === "invalid" || next === "replaced") {
    latest = undefined;
    paintCar();
  } else if (slot !== undefined) {
    latest = undefined;
    paintCar(slot);
  }
  render();
}

function showLobby(state: ControllerLobbyPacket) {
  if (latest?.car !== state.car) garageOpen = false;
  latest = state;
  paintCar(state.car);
  render();
}

function showError(message: string) {
  render();
  garageStatus.textContent = message;
}

ready.addEventListener("click", () => {
  const selection = latest?.lobby.slots[latest.car];
  if (selection) link?.ready(!selection.ready);
});
livery.addEventListener("change", () => {
  if (latest) link?.select(latest.car, livery.value as Livery);
});
pit.addEventListener("click", () => {
  garageOpen = !garageOpen;
  render();
});

function suspend() {
  foreground = false;
  controls.reset();
}

function resume() {
  if (document.hidden) return;
  foreground = true;
  link?.connect();
}

function detach() {
  suspend();
  link?.close();
}

window.addEventListener("blur", suspend);
window.addEventListener("focus", resume);
document.addEventListener("visibilitychange", () => document.hidden ? detach() : resume());
window.addEventListener("pagehide", detach);
window.addEventListener("pageshow", resume);
window.addEventListener("offline", () => {
  controls.reset();
  link?.close();
});
window.addEventListener("online", resume);

if (link) {
  render();
  link.connect();
  window.setInterval(() => {
    if ((driving || latest?.lobby.phase === "grid") && foreground && !document.hidden) link.send(controls.input);
  }, 1000 / 30);
  window.setInterval(() => {
    if (!document.hidden) link.heartbeat();
  }, 1000);
} else {
  showStatus("invalid");
}
