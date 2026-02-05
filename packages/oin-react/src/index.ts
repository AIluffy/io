import type { OinSchedule } from '@oin/store';

import { isServerEnv, scheduleTask } from '@oin/store';
import { useSyncExternalStore } from 'react';

type OinSource<T> = {
  snapshot(): T;
  subscribe(fn: (v: T) => void): () => void;
};

type OinReactOptions = {
  schedule?: OinSchedule;
};

function createSubscriber<T>(
  source: OinSource<T>,
  options?: OinReactOptions,
): (onStoreChange: () => void) => () => void {
  if (isServerEnv) return () => () => undefined;
  const schedule = options?.schedule ?? 'microtask';
  return (onStoreChange) => {
    if (schedule === 'sync') {
      return source.subscribe(() => onStoreChange());
    }

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
