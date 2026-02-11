import type { IoSchedule, IoUnit } from 'io-store';
import type { Readable, Writable } from 'svelte/store';

import { scheduleTask } from 'io-store';

type IoSource<T> = {
  snapshot(): T;
  subscribe(fn: (v: T) => void): () => void;
};

type IoSvelteOptions = {
  schedule?: IoSchedule;
};

function createUpdater<T>(
  schedule: IoSchedule,
  apply: (value: T) => void,
): (value: T) => void {
  if (schedule === 'sync') return (value) => apply(value);

  let pending = false;
  let last: T;
  return (value: T) => {
    last = value;
    if (pending) return;
    pending = true;
    scheduleTask(schedule, () => {
      pending = false;
      apply(last);
    });
  };
}

export function toReadable<T>(
  source: IoSource<T>,
  options?: IoSvelteOptions,
): Readable<T> {
  return {
    subscribe(run) {
      run(source.snapshot());
      const schedule = options?.schedule ?? 'sync';
      const update = createUpdater<T>(schedule, (value) => {
        run(value);
      });
      const unsub = source.subscribe((v) => update(v));
      return () => {
        unsub();
      };
    },
  };
}

export function toWritable<T>(
  unit: IoUnit<T>,
  options?: IoSvelteOptions,
): Writable<T> {
  return {
    subscribe(run) {
      run(unit.get());
      const schedule = options?.schedule ?? 'sync';
      const update = createUpdater<T>(schedule, (value) => {
        run(value);
      });
      const unsub = unit.subscribe((v) => update(v));
      return () => {
        unsub();
      };
    },
    set(value) {
      unit.set(value);
    },
    update(updater) {
      unit.set((prev) => updater(prev));
    },
  };
}
