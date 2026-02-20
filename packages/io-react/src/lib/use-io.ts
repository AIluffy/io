import type { IoSchedule } from '@iostore/store';

import { createScheduledDispatcher, isServerEnv } from '@iostore/store';
import { useRef, useSyncExternalStore } from 'react';

type IoSource<T> = {
  snapshot?: () => T;
  get?: () => T;
  subscribe?: (fn: (v: T) => void) => () => void;
};

type IoReactOptions = {
  schedule?: IoSchedule;
};

type IoSelectorOptions<TSelected> = IoReactOptions & {
  isEqual?: (prev: TSelected, next: TSelected) => boolean;
};

type SelectorMemo<TSource, TSelected> = {
  sourceSnapshot?: TSource;
  selected?: TSelected;
  initialized: boolean;
  selector?: (value: TSource) => TSelected;
  isEqual?: (prev: TSelected, next: TSelected) => boolean;
};

function createSubscriber<T>(
  source: IoSource<T>,
  options?: IoReactOptions,
): (onStoreChange: () => void) => () => void {
  if (isServerEnv) return () => () => undefined;
  if (typeof source.subscribe !== 'function') {
    throw new Error('useIO: source must provide subscribe()');
  }
  const subscribe = source.subscribe;

  const schedule = options?.schedule ?? 'microtask';
  return (onStoreChange) => {
    if (schedule === 'sync') {
      return subscribe(() => onStoreChange());
    }

    const notify = createScheduledDispatcher(schedule, () => onStoreChange());
    const unsub = subscribe(() => notify.dispatch());
    return () => {
      notify.cancel();
      unsub();
    };
  };
}

function getSnapshotValue<T>(source: IoSource<T>): T {
  if (typeof source.snapshot === 'function') {
    return source.snapshot();
  }
  if (typeof source.get === 'function') {
    return source.get();
  }
  throw new Error(
    'useIO: source must provide snapshot() or get()',
  );
}

export function useIO<T>(source: IoSource<T>, options?: IoReactOptions): T {
  return useSyncExternalStore(
    createSubscriber(source, options),
    () => getSnapshotValue(source),
    () => getSnapshotValue(source),
  );
}

export function useIOSelector<TSource, TSelected>(
  source: IoSource<TSource>,
  selector: (value: TSource) => TSelected,
  options?: IoSelectorOptions<TSelected>,
): TSelected {
  const isEqual = options?.isEqual ?? Object.is;
  const memoRef = useRef<SelectorMemo<TSource, TSelected>>({
    initialized: false,
  });

  const getSelectedSnapshot = (): TSelected => {
    const sourceSnapshot = getSnapshotValue(source);
    const memo = memoRef.current;

    if (memo.selector !== selector || memo.isEqual !== isEqual) {
      memo.selector = selector;
      memo.isEqual = isEqual;
      memo.initialized = false;
      memo.sourceSnapshot = undefined;
      memo.selected = undefined;
    }

    if (memo.initialized && Object.is(memo.sourceSnapshot, sourceSnapshot)) {
      return memo.selected as TSelected;
    }

    const nextSelected = selector(sourceSnapshot);
    if (memo.initialized && isEqual(memo.selected as TSelected, nextSelected)) {
      memo.sourceSnapshot = sourceSnapshot;
      return memo.selected as TSelected;
    }

    memo.initialized = true;
    memo.sourceSnapshot = sourceSnapshot;
    memo.selected = nextSelected;
    return nextSelected;
  };

  return useSyncExternalStore(
    createSubscriber(source, options),
    getSelectedSnapshot,
    getSelectedSnapshot,
  );
}
