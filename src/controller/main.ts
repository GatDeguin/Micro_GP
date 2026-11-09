import { CAR_SPECS } from "../shared/protocol.ts";
import { bindControls } from "./controls.ts";
import { controllerLink, type LinkStatus } from "./link.ts";
import "./panel.css";

const panel = document.querySelector<HTMLElement>(".panel")!;
const carNumber = document.querySelector<HTMLElement>("#car-number")!;
const carName = document.querySelector<HTMLElement>("#car-name")!;
const statusLabel = document.querySelector<HTMLElement>("#link-status")!;
const labels: Record<LinkStatus, string> = {
  connecting: "Conectando",
  reconnecting: "Reconectando",
  connected: "Conectado",
  full: "Sala completa",
  invalid: "Sala no disponible",
  replaced: "Mando en otra pestaña",
};

let foreground = !document.hidden;
const room = /^\/mando\/([\w-]+)\/?$/.exec(location.pathname)?.[1];
const link = room ? controllerLink(room, showStatus) : null;
const controls = bindControls({
  steering: document.querySelector<HTMLElement>("#steering")!,
  brake: document.querySelector<HTMLButtonElement>("#brake")!,
  gas: document.querySelector<HTMLButtonElement>("#gas")!,
}, () => foreground && !document.hidden, (input) => link?.send(input));

function showStatus(status: LinkStatus, slot?: number) {
  panel.dataset.link = status;
  statusLabel.textContent = labels[status];
  if (slot !== undefined || status === "full" || status === "invalid" || status === "replaced") {
    const car = slot === undefined ? undefined : CAR_SPECS[slot];
    carNumber.textContent = car?.number ?? "—";
    carName.textContent = car?.name ?? "Sin auto";
    panel.style.setProperty("--car-color", car?.color ?? "var(--ivory)");
  }
  controls.setEnabled(status === "connected");
  if (status === "connected") link?.send(controls.input);
}

function suspend() {
  foreground = false;
  controls.reset();
}

function resume() {
  if (document.hidden) return;
  foreground = true;
  link?.connect();
}

window.addEventListener("blur", suspend);
window.addEventListener("focus", resume);
document.addEventListener("visibilitychange", () => document.hidden ? suspend() : resume());
window.addEventListener("pagehide", () => {
  suspend();
  link?.close();
});
window.addEventListener("pageshow", resume);
window.addEventListener("offline", () => {
  controls.reset();
  link?.close();
});
window.addEventListener("online", resume);

if (link) {
  link.connect();
  window.setInterval(() => {
    if (foreground && !document.hidden) link.send(controls.input);
  }, 1000 / 30);
} else {
  showStatus("invalid");
}
