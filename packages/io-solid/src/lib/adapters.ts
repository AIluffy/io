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
