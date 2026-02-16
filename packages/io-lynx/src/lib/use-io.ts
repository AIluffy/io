import type { IoSchedule } from '@iostore/store';

import { isServerEnv, scheduleTask } from '@iostore/store';
import { useSyncExternalStore } from '@lynx-js/react';

type IoSource<T> = {
  snapshot(): T;
  subscribe(fn: (v: T) => void): () => void;
};

type IoLynxOptions = {
  schedule?: IoSchedule;
};

function createSubscriber<T>(
  source: IoSource<T>,
  options?: IoLynxOptions,
): (onStoreChange: () => void) => () => void {
  if (isServerEnv) return () => () => undefined;
  const schedule = options?.schedule ?? 'microtask';
  return (onStoreChange) => {
    if (schedule === 'sync') {
      return source.subscribe(() => onStoreChange());
    }

    let active = true;
    let pending = false;
    let token = 0;
    const scheduleNotify = () => {
      if (pending) return;
      pending = true;
      token += 1;
      const currentToken = token;
      scheduleTask(schedule, () => {
        if (!active || !pending || currentToken !== token) return;
        pending = false;
        onStoreChange();
      });
    };
    const unsub = source.subscribe(() => scheduleNotify());
    return () => {
      active = false;
      pending = false;
      token += 1;
      unsub();
    };
  };
}

export function useIO<T>(source: IoSource<T>, options?: IoLynxOptions): T {
  return useSyncExternalStore(
    createSubscriber(source, options),
    () => source.snapshot(),
    () => source.snapshot(),
  );
}
