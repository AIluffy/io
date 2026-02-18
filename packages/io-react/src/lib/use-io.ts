import type { IoSchedule } from '@iostore/store';

import { createScheduledDispatcher, isServerEnv } from '@iostore/store';
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

    const notify = createScheduledDispatcher(schedule, () => onStoreChange());
    const unsub = source.subscribe(() => notify.dispatch());
    return () => {
      notify.cancel();
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
