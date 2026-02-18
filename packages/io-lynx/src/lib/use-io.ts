import type { IoSchedule } from '@iostore/store';

import { createScheduledDispatcher, isServerEnv } from '@iostore/store';
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

    const notify = createScheduledDispatcher(schedule, () => onStoreChange());
    const unsub = source.subscribe(() => notify.dispatch());
    return () => {
      notify.cancel();
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
