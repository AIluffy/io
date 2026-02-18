import type { IoSchedule, IoUnit } from '@iostore/store';
import type { Readable, Writable } from 'svelte/store';

import { createScheduledDispatcher } from '@iostore/store';

type IoSource<T> = {
  snapshot(): T;
  subscribe(fn: (v: T) => void): () => void;
};

type IoSvelteOptions = {
  schedule?: IoSchedule;
};

export function toReadable<T>(
  source: IoSource<T>,
  options?: IoSvelteOptions,
): Readable<T> {
  return {
    subscribe(run) {
      run(source.snapshot());
      const schedule = options?.schedule ?? 'sync';
      const updater = createScheduledDispatcher<[T]>(schedule, (value) => {
        run(value);
      });
      const unsub = source.subscribe((v) => updater.dispatch(v));
      return () => {
        updater.cancel();
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
      const updater = createScheduledDispatcher<[T]>(schedule, (value) => {
        run(value);
      });
      const unsub = unit.subscribe((v) => updater.dispatch(v));
      return () => {
        updater.cancel();
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
