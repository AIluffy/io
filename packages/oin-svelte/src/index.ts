import type { Readable, Writable } from 'svelte/store';
import type { OinUnit } from '@oin/store';

type OinSource<T> = {
  snapshot(): T;
  subscribe(fn: (v: T) => void): () => void;
};

type OinSchedule = 'sync' | 'microtask' | 'animationFrame';

export type OinSvelteOptions = {
  schedule?: OinSchedule;
  ssr?: boolean;
};

type OinGlobal = {
  window?: unknown;
  document?: unknown;
  requestAnimationFrame?: (cb: () => void) => number;
};

const oinGlobal: OinGlobal | undefined =
  typeof globalThis === 'undefined'
    ? undefined
    : (globalThis as unknown as OinGlobal);

const isServerEnv = !oinGlobal?.window && !oinGlobal?.document;

function scheduleTask(kind: OinSchedule, fn: () => void): void {
  if (kind === 'sync') {
    fn();
    return;
  }
  const raf = oinGlobal?.requestAnimationFrame;
  if (kind === 'animationFrame' && typeof raf === 'function') {
    raf(() => fn());
    return;
  }
  queueMicrotask(fn);
}

export function toReadable<T>(
  source: OinSource<T>,
  options?: OinSvelteOptions
): Readable<T> {
  return {
    subscribe(run) {
      run(source.snapshot());
      const schedule = options?.schedule ?? 'microtask';
      const ssr = options?.ssr ?? isServerEnv;
      if (ssr) return () => undefined;
      let pending = false;
      let last = source.snapshot();
      const unsub = source.subscribe((v) => {
        last = v;
        if (pending) return;
        pending = true;
        scheduleTask(schedule, () => {
          pending = false;
          run(last);
        });
      });
      return () => {
        pending = false;
        unsub();
      };
    },
  };
}

export function toWritable<T>(
  unit: OinUnit<T>,
  options?: OinSvelteOptions
): Writable<T> {
  return {
    subscribe(run) {
      run(unit());
      const schedule = options?.schedule ?? 'microtask';
      const ssr = options?.ssr ?? isServerEnv;
      if (ssr) return () => undefined;
      let pending = false;
      let last = unit();
      const unsub = unit.subscribe((v) => {
        last = v;
        if (pending) return;
        pending = true;
        scheduleTask(schedule, () => {
          pending = false;
          run(last);
        });
      });
      return () => {
        pending = false;
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
