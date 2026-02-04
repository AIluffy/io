import { isServerEnv, scheduleTask } from '@oin/store';
import { useSyncExternalStore } from 'react';

type OinSource<T> = {
  snapshot(): T;
  subscribe(fn: (v: T) => void): () => void;
};

function createSubscriber<T>(
  source: OinSource<T>,
): (onStoreChange: () => void) => () => void {
  if (isServerEnv) return () => () => undefined;
  return (onStoreChange) => {
    let pending = false;
    const scheduleNotify = () => {
      if (pending) return;
      pending = true;
      scheduleTask('microtask', () => {
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

export function useOin<T>(source: OinSource<T>): T {
  return useSyncExternalStore(
    createSubscriber(source),
    () => source.snapshot(),
    () => source.snapshot(),
  );
}
