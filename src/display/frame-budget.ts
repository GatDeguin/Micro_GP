const scales = [1, 0.86, 0.74, 0.63, 0.53, 0.45];

export function frameBudget() {
  let level = 0;
  let started = 0;
  let frames = 0;
  let missed = 0;
  let goodWindows = 0;
  let slowWindows = 0;

  function reset(now: number) {
    started = now;
    frames = missed = goodWindows = slowWindows = 0;
  }

  return {
    get scale() { return scales[level]; },
    reset,
    sample(now: number, elapsed: number) {
      if (elapsed <= 0 || elapsed > 500) { reset(now); return false; }
      if (!started) started = now;
      frames++;
      if (elapsed > 21) missed++;
      if (now - started < 1200) return false;
      const late = missed / frames;
      started = now;
      frames = missed = 0;
      slowWindows = late > 0.02 ? slowWindows + 1 : 0;
      goodWindows = late < 0.01 ? goodWindows + 1 : 0;
      const previous = level;
      if (late > 0.10 || slowWindows >= 2) level = Math.min(scales.length - 1, level + 1);
      else if (goodWindows >= 24) level = Math.max(0, level - 1);
      if (previous !== level) reset(now);
      return previous !== level;
    },
  };
}
