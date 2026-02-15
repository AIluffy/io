export type IoSchedule = 'sync' | 'microtask' | 'animationFrame';

import { ioGlobal } from './global.js';

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
