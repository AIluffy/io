import type { IoSchedule, IoUnit } from '@iostore/store';
import type { Readable, Writable } from 'svelte/store';

import { scheduleTask } from '@iostore/store';

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
): { push: (value: T) => void; cancel: () => void } {
  if (schedule === 'sync') {
    return {
      push: (value) => apply(value),
      cancel: () => undefined,
    };
  }

  let active = true;
  let pending = false;
  let token = 0;
  let last: T;
  return {
    push: (value: T) => {
      last = value;
      if (pending) return;
      pending = true;
      token += 1;
      const currentToken = token;
      scheduleTask(schedule, () => {
        if (!active || !pending || currentToken !== token) return;
        pending = false;
        apply(last);
      });
    },
    cancel: () => {
      active = false;
      pending = false;
      token += 1;
    },
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
      const updater = createUpdater<T>(schedule, (value) => {
        run(value);
      });
      const unsub = source.subscribe((v) => updater.push(v));
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
      const updater = createUpdater<T>(schedule, (value) => {
        run(value);
      });
      const unsub = unit.subscribe((v) => updater.push(v));
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
