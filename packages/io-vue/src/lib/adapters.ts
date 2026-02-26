import type { IoSchedule, IoUnit } from '@iostore/store';
import type { Ref, ShallowRef } from 'vue';

import { createScheduledDispatcher } from '@iostore/store';
import { customRef, onScopeDispose, shallowRef } from 'vue';

type IoSource<T> = {
  snapshot(): T;
  subscribe(fn: (v: T) => void): () => void;
};

type IoVueOptions = {
  schedule?: IoSchedule;
};

type IoSelectorOptions<TSelected> = IoVueOptions & {
  isEqual?: (prev: TSelected, next: TSelected) => boolean;
};

export function useIO<T>(
  source: IoSource<T>,
  options?: IoVueOptions,
): ShallowRef<T> {
  const state = shallowRef(source.snapshot()) as ShallowRef<T>;

  const schedule = options?.schedule ?? 'microtask';
  const updater = createScheduledDispatcher<[T]>(schedule, (value) => {
    state.value = value;
  });
  const unsub = source.subscribe((v) => updater.dispatch(v));
  onScopeDispose(() => {
    updater.cancel();
    unsub();
  });

  return state;
}

export function useIOSelector<TSource, TSelected>(
  source: IoSource<TSource>,
  selector: (value: TSource) => TSelected,
  options?: IoSelectorOptions<TSelected>,
): ShallowRef<TSelected> {
  const isEqual = options?.isEqual ?? Object.is;
  let selected = selector(source.snapshot());
  const state = shallowRef(selected) as ShallowRef<TSelected>;

  const schedule = options?.schedule ?? 'microtask';
  const updater = createScheduledDispatcher<[TSelected]>(schedule, (value) => {
    state.value = value;
  });
  const unsub = source.subscribe((nextSource) => {
    const nextSelected = selector(nextSource);
    if (isEqual(selected, nextSelected)) {
      return;
    }
    selected = nextSelected;
    updater.dispatch(nextSelected);
  });
  onScopeDispose(() => {
    updater.cancel();
    unsub();
  });

  return state;
}

export function ioRef<T>(unit: IoUnit<T>, options?: IoVueOptions): Ref<T> {
  return customRef<T>((track, trigger) => {
    let current = unit.get();
    const schedule = options?.schedule ?? 'microtask';
    const updater = createScheduledDispatcher<[T]>(schedule, (value) => {
      current = value;
      trigger();
    });
    const unsub = unit.subscribe((v) => updater.dispatch(v));
    onScopeDispose(() => {
      updater.cancel();
      unsub();
    });
    return {
      get() {
        track();
        return current;
      },
      set(value) {
        unit.set(value);
      },
    };
  });
}
