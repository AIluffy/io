export type OinSchedule = 'sync' | 'microtask' | 'animationFrame';

type OinGlobal = {
  requestAnimationFrame?: (cb: () => void) => number;
};

const oinGlobal: OinGlobal | undefined =
  typeof globalThis === 'undefined'
    ? undefined
    : (globalThis as unknown as OinGlobal);

export function scheduleTask(kind: OinSchedule, fn: () => void): void {
  if (kind === 'sync') {
    fn();
    return;
  }
  const raf = oinGlobal?.requestAnimationFrame;
  if (kind === 'animationFrame' && typeof raf === 'function') {
    raf(() => fn());
    return;
  }
  queueMicrotask(fn);
}
