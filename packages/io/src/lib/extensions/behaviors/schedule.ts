import type { IoBehavior } from '../types.js';
import type { IoSchedule } from '../../utils/schedule.js';

import { scheduleTask } from '../../utils/schedule.js';

export function schedule<T>(kind: IoSchedule = 'microtask'): IoBehavior<T> {
  return (view) => ({
    ...view,
    subscribe(fn) {
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
}
