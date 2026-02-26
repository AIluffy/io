import type { IoSchedule } from '@iostore/store';
import type { Accessor } from 'solid-js';

import { createScheduledDispatcher } from '@iostore/store';
import { createSignal, onCleanup } from 'solid-js';

type IoSource<T> = {
  snapshot(): T;
  subscribe(fn: (value: T) => void): () => void;
};

type IoSolidOptions = {
  schedule?: IoSchedule;
};

type IoSelectorOptions<TSelected> = IoSolidOptions & {
  isEqual?: (prev: TSelected, next: TSelected) => boolean;
};

export function useIO<T>(source: IoSource<T>, options?: IoSolidOptions): Accessor<T> {
  const [state, setState] = createSignal(source.snapshot());

  const schedule = options?.schedule ?? 'microtask';
  const updater = createScheduledDispatcher<[T]>(schedule, (value) => {
    setState(() => value);
  });
  const unsub = source.subscribe((value) => updater.dispatch(value));

  onCleanup(() => {
    updater.cancel();
    unsub();
  });

  return state;
}

export function useIOSelector<TSource, TSelected>(
  source: IoSource<TSource>,
  selector: (value: TSource) => TSelected,
  options?: IoSelectorOptions<TSelected>,
): Accessor<TSelected> {
  const isEqual = options?.isEqual ?? Object.is;
  let selected = selector(source.snapshot());
  const [state, setState] = createSignal(selected);

  const schedule = options?.schedule ?? 'microtask';
  const updater = createScheduledDispatcher<[TSelected]>(schedule, (value) => {
    setState(() => value);
  });
  const unsub = source.subscribe((nextSource) => {
    const nextSelected = selector(nextSource);
    if (isEqual(selected, nextSelected)) {
      return;
    }
    selected = nextSelected;
    updater.dispatch(nextSelected);
  });

  onCleanup(() => {
    updater.cancel();
    unsub();
  });

  return state;
}
