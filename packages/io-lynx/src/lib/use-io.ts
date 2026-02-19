import type { IoSchedule } from '@iostore/store';

import { createScheduledDispatcher, isServerEnv } from '@iostore/store';
import { useRef, useSyncExternalStore } from '@lynx-js/react';

type IoSource<T> = {
  snapshot(): T;
  subscribe(fn: (v: T) => void): () => void;
};

type IoLynxOptions = {
  schedule?: IoSchedule;
};

type IoSelectorOptions<TSelected> = IoLynxOptions & {
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
    const sourceSnapshot = source.snapshot();
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
