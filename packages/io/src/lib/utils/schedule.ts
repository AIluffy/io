export type IoSchedule = 'sync' | 'microtask' | 'animationFrame';

type IoGlobal = {
  requestAnimationFrame?: (cb: () => void) => number;
};

const ioGlobal: IoGlobal | undefined =
  typeof globalThis === 'undefined'
    ? undefined
    : (globalThis as unknown as IoGlobal);

export function scheduleTask(kind: IoSchedule, fn: () => void): void {
  if (kind === 'sync') {
    fn();
    return;
  }
  const raf = ioGlobal?.requestAnimationFrame;
  if (kind === 'animationFrame' && typeof raf === 'function') {
    raf(() => fn());
    return;
  }
  queueMicrotask(fn);
}
