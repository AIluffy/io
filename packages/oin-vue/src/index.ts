import { customRef, onScopeDispose, shallowRef } from 'vue';
import type { Ref, ShallowRef } from 'vue';
import type { OinUnit } from '@oin/store';

type OinSource<T> = {
  snapshot(): T;
  subscribe(fn: (v: T) => void): () => void;
};

type OinSchedule = 'sync' | 'microtask' | 'animationFrame';

export type OinVueOptions = {
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

export function useOin<T>(
  source: OinSource<T>,
  options?: OinVueOptions,
): ShallowRef<T> {
  const state = shallowRef(source.snapshot()) as ShallowRef<T>;
  const schedule = options?.schedule ?? 'microtask';
  const ssr = options?.ssr ?? isServerEnv;

  if (!ssr) {
    let pending = false;
    let last = state.value;
    const unsub = source.subscribe((v) => {
      last = v;
      if (pending) return;
      pending = true;
      scheduleTask(schedule, () => {
        pending = false;
        state.value = last;
      });
    });
    onScopeDispose(unsub);
  }

  return state;
}

export function oinRef<T>(unit: OinUnit<T>, options?: OinVueOptions): Ref<T> {
  return customRef<T>((track, trigger) => {
    let current = unit();
    const schedule = options?.schedule ?? 'microtask';
    const ssr = options?.ssr ?? isServerEnv;
    if (!ssr) {
      let pending = false;
      let last = current;
      const unsub = unit.subscribe((v) => {
        last = v;
        if (pending) return;
        pending = true;
        scheduleTask(schedule, () => {
          pending = false;
          current = last;
          trigger();
        });
      });
      onScopeDispose(unsub);
    }
    return {
      get() {
        track();
        return current;
      },
      set(value) {
        unit(value);
      },
    };
  });
}
