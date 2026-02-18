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
