import type { OinUnit } from '@oin/store';
import type { Readable, Writable } from 'svelte/store';

type OinSource<T> = {
  snapshot(): T;
  subscribe(fn: (v: T) => void): () => void;
};

export function toReadable<T>(source: OinSource<T>): Readable<T> {
  return {
    subscribe(run) {
      run(source.snapshot());
      const unsub = source.subscribe((v) => {
        run(v);
      });
      return () => {
        unsub();
      };
    },
  };
}

export function toWritable<T>(unit: OinUnit<T>): Writable<T> {
  return {
    subscribe(run) {
      run(unit());
      const unsub = unit.subscribe((v) => {
        run(v);
      });
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
