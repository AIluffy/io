import type { OinSchedule, OinUnit } from '@oin/store';
import type { Readable, Writable } from 'svelte/store';

import { scheduleTask } from '@oin/store';

type OinSource<T> = {
  snapshot(): T;
  subscribe(fn: (v: T) => void): () => void;
};

type OinSvelteOptions = {
  schedule?: OinSchedule;
};

function createUpdater<T>(
  schedule: OinSchedule,
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
  source: OinSource<T>,
  options?: OinSvelteOptions,
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
  unit: OinUnit<T>,
  options?: OinSvelteOptions,
): Writable<T> {
  return {
    subscribe(run) {
      run(unit());
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
      unit(value);
    },
    update(updater) {
      unit((prev) => updater(prev));
    },
  };
}
