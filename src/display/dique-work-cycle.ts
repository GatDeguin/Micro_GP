export interface DiqueWorkCycle {
  engage: number;
  working: number;
  stroke: number;
  spin: number;
  arc: number;
  wheelGrip: number;
}

export function createDiqueWorkCycle(): DiqueWorkCycle {
  return { engage: 0, working: 0, stroke: 0, spin: 0, arc: 0, wheelGrip: 0 };
}

function ease(value: number, start: number, end: number) {
  const x = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return x * x * (3 - 2 * x);
}

/** A complete reach, work, inspect and release cycle, shared by hands and machines. */
export function sampleDiqueWork(seconds: number, offset: number, out = createDiqueWorkCycle()): DiqueWorkCycle {
  const phase = ((seconds + offset) % 14 + 14) % 14;
  out.engage = ease(phase, .55, 2.3) * (1 - ease(phase, 10.9, 12.75));
  out.working = ease(phase, 3, 3.7) * (1 - ease(phase, 9.3, 10));
  // Tighten, withdraw, measure without contact, then inspect the stopped wheel.
  const clearOfWheel = ease(phase, 2.3, 2.9) * (1 - ease(phase, 10.1, 10.7));
  out.wheelGrip = out.engage * (1 - clearOfWheel);
  out.stroke = Math.sin((phase - 3) * 5.8) * out.working;
  // Twelve complete turns stop in the starting orientation: no cycle-boundary snap.
  out.spin = Math.PI * 24 * ease(phase, 3, 10);
  out.arc = out.working * (Math.sin(phase * 47) > -.15 ? .72 + .28 * Math.abs(Math.sin(phase * 91)) : .04);
  return out;
}
