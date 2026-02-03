import { useSyncExternalStore } from 'react';

type OinSource<T> = {
  snapshot(): T;
  subscribe(fn: (v: T) => void): () => void;
};

type OinSchedule = 'sync' | 'microtask' | 'animationFrame';

export type OinReactOptions = {
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

function createSubscriber<T>(
  source: OinSource<T>,
  options?: OinReactOptions,
): (onStoreChange: () => void) => () => void {
  const schedule = options?.schedule ?? 'microtask';
  const ssr = options?.ssr ?? isServerEnv;
  if (ssr) return () => () => undefined;
  return (onStoreChange) => {
    let pending = false;
    const scheduleNotify = () => {
      if (pending) return;
      pending = true;
      scheduleTask(schedule, () => {
        pending = false;
        onStoreChange();
      });
    };
    const unsub = source.subscribe(() => scheduleNotify());
    return () => {
      pending = false;
      unsub();
    };
  };
}

export function useOin<T>(source: OinSource<T>, options?: OinReactOptions): T {
  return useSyncExternalStore(
    createSubscriber(source, options),
    () => source.snapshot(),
    () => source.snapshot(),
  );
}
