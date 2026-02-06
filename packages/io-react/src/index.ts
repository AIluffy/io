import type { IoSchedule } from 'io-store';

import { isServerEnv, scheduleTask } from 'io-store';
import { useSyncExternalStore } from 'react';

type IoSource<T> = {
  snapshot(): T;
  subscribe(fn: (v: T) => void): () => void;
};

type IoReactOptions = {
  schedule?: IoSchedule;
};

function createSubscriber<T>(
  source: IoSource<T>,
  options?: IoReactOptions,
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

export function useIO<T>(source: IoSource<T>, options?: IoReactOptions): T {
  return useSyncExternalStore(
    createSubscriber(source, options),
    () => source.snapshot(),
    () => source.snapshot(),
  );
}
