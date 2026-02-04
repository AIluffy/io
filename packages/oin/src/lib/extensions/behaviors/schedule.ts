import type { OinBehavior } from '../types.js';
import type { OinSchedule } from '../../utils/schedule.js';

import { scheduleTask } from '../../utils/schedule.js';

export function schedule<T>(kind: OinSchedule = 'microtask'): OinBehavior<T> {
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
