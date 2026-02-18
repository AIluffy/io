export type IoSchedule = 'sync' | 'microtask' | 'animationFrame';

import { ioGlobal } from '../env/global.js';

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

export type ScheduledDispatcher<TArgs extends unknown[]> = {
  dispatch: (...args: TArgs) => void;
  cancel: () => void;
};

export function createScheduledDispatcher<TArgs extends unknown[]>(
  kind: IoSchedule,
  apply: (...args: TArgs) => void,
): ScheduledDispatcher<TArgs> {
  if (kind === 'sync') {
    return {
      dispatch: (...args: TArgs) => apply(...args),
      cancel: () => undefined,
    };
  }

  let active = true;
  let pending = false;
  let token = 0;
  let lastArgs: TArgs | undefined;

  return {
    dispatch: (...args: TArgs) => {
      lastArgs = args;
      if (pending) return;
      pending = true;
      token += 1;
      const currentToken = token;
      scheduleTask(kind, () => {
        if (!active || !pending || currentToken !== token || !lastArgs) return;
        pending = false;
        apply(...lastArgs);
      });
    },
    cancel: () => {
      active = false;
      pending = false;
      token += 1;
      lastArgs = undefined;
    },
  };
}
