import type { Readable, Writable } from 'svelte/store';
import type { OinUnit } from '@org/oin';

type OinSource<T> = {
  snapshot(): T;
  subscribe(fn: (v: T) => void): () => void;
};

export function toReadable<T>(source: OinSource<T>): Readable<T> {
  return {
    subscribe(run) {
      run(source.snapshot());
      return source.subscribe(run);
    },
  };
}

export function toWritable<T>(unit: OinUnit<T>): Writable<T> {
  return {
    subscribe(run) {
      run(unit());
      return unit.subscribe(run);
    },
    set(value) {
      unit(value);
    },
    update(updater) {
      unit((prev) => updater(prev));
    },
  };
}
