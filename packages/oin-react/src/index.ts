import { useSyncExternalStore } from 'react';

type OinSource<T> = {
  snapshot(): T;
  subscribe(fn: (v: T) => void): () => void;
};

export function useOin<T>(source: OinSource<T>): T {
  return useSyncExternalStore(
    (onStoreChange) => source.subscribe(() => onStoreChange()),
    () => source.snapshot(),
    () => source.snapshot()
  );
}
