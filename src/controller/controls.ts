import { NEUTRAL, type DriveInput } from "../shared/protocol.ts";

const DEAD_ZONE = 0.12;

export function steeringAxis(displacement: number, travel: number): number {
  const ratio = displacement / travel;
  const magnitude = Math.min(1, Math.abs(ratio));
  if (magnitude <= DEAD_ZONE) return 0;
  return Math.sign(ratio) * (magnitude - DEAD_ZONE) / (1 - DEAD_ZONE);
}

type Controls = { steering: HTMLElement; brake: HTMLButtonElement; gas: HTMLButtonElement };
type Control = keyof Controls;
type KeyAction = "left" | "right" | "brake" | "gas";

export function bindControls(controls: Controls, canPress: () => boolean, sendEdge: (input: DriveInput) => void) {
  const pointers = new Map<Control, number>();
  const keys = new Map<string, KeyAction>();
  const { steering, brake, gas } = controls;
  let enabled = false;
  let origin = 0;
  let travel = 1;
  let touchX = 0;
  let input = NEUTRAL;

  function update(edge: boolean) {
    const held = [...keys.values()];
    const x = pointers.has("steering") ? touchX : Number(held.includes("right")) - Number(held.includes("left"));
    const next = { x, gas: pointers.has("gas") || held.includes("gas"), brake: pointers.has("brake") || held.includes("brake") };
    if (x !== input.x) {
      steering.style.setProperty("--steer", String(x));
      const percent = Math.round(x * 100);
      steering.setAttribute("aria-valuenow", String(percent));
      steering.setAttribute("aria-valuetext", percent === 0 ? "Centro" : `${Math.abs(percent)} % ${percent < 0 ? "a la izquierda" : "a la derecha"}`);
    }
    if (next.brake !== input.brake) brake.setAttribute("aria-pressed", String(next.brake));
    if (next.gas !== input.gas) gas.setAttribute("aria-pressed", String(next.gas));
    const steeringEdge = (input.x === 0) !== (x === 0);
    input = next;
    if (edge || steeringEdge) sendEdge(input);
  }

  function reset() {
    const captures = [...pointers];
    pointers.clear();
    keys.clear();
    touchX = 0;
    for (const [name, pointerId] of captures) {
      const control = controls[name];
      if (control.hasPointerCapture(pointerId)) control.releasePointerCapture(pointerId);
    }
    update(true);
  }

  function setEnabled(value: boolean) {
    if (value === enabled) return;
    enabled = value;
    if (!enabled) reset();
    steering.tabIndex = enabled ? 0 : -1;
    steering.setAttribute("aria-disabled", String(!enabled));
    brake.disabled = gas.disabled = !enabled;
  }

  for (const name of ["steering", "brake", "gas"] as const) {
    const control: HTMLElement = controls[name];
    control.addEventListener("pointerdown", (event) => {
      if (!enabled || !canPress() || event.button !== 0 || pointers.has(name)) return;
      event.preventDefault();
      control.setPointerCapture(event.pointerId);
      pointers.set(name, event.pointerId);
      if (name === "steering") {
        origin = event.clientX;
        travel = Math.max(24, control.clientWidth * 0.33);
      }
      update(true);
    });

    const release = (event: PointerEvent) => {
      if (pointers.get(name) !== event.pointerId) return;
      pointers.delete(name);
      if (name === "steering") touchX = 0;
      update(true);
    };
    control.addEventListener("pointerup", release);
    control.addEventListener("pointercancel", release);
    control.addEventListener("lostpointercapture", release);
    control.addEventListener("contextmenu", (event) => event.preventDefault());

    control.addEventListener("keydown", (event) => {
      if (!enabled || !canPress() || event.altKey || event.ctrlKey || event.metaKey) return;
      let action: KeyAction;
      if (event.key === "ArrowLeft") action = "left";
      else if (event.key === "ArrowRight") action = "right";
      else if (name !== "steering" && (event.key === " " || event.key === "Enter")) action = name;
      else return;
      event.preventDefault();
      if (event.repeat) return;
      keys.set(event.code, action);
      update(true);
    });
    control.addEventListener("blur", () => {
      if (keys.size === 0) return;
      keys.clear();
      update(true);
    });
  }

  steering.addEventListener("pointermove", (event) => {
    if (pointers.get("steering") !== event.pointerId) return;
    touchX = steeringAxis(event.clientX - origin, travel);
    update(false);
  });
  window.addEventListener("keyup", (event) => {
    if (!keys.delete(event.code)) return;
    event.preventDefault();
    update(true);
  });

  return { get input() { return input; }, reset, setEnabled };
}
