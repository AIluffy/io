import type { IoBehavior, IoView } from '../types.js';
import type { IoSchedule } from '../../utils/schedule.js';

import { scheduleTask } from '../../utils/schedule.js';

export function schedule<T>(kind: IoSchedule = 'microtask'): IoBehavior<T> {
  return (view) => {
    const wrapped = Object.create(view) as IoView<T> & {
      subscribe: (fn: (value: T) => void) => () => void;
    };

    Object.defineProperty(wrapped, 'subscribe', {
      configurable: true,
      enumerable: false,
      writable: false,
      value: (fn: (value: T) => void) => {
        let pending = false;
        let last = view.get();
        const unsub = view.subscribe((v) => {
          last = v;
          if (pending) return;
          pending = true;
          scheduleTask(kind, () => {
            pending = false;
            fn(last);
          });
        });
        return () => {
          pending = false;
          unsub();
        };
      },
    });

    return wrapped;
  };
}
