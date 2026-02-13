import type { IoSchedule, IoUnit } from '@iostore/store';
import type { Ref, ShallowRef } from 'vue';

import { scheduleTask } from '@iostore/store';
import { customRef, onScopeDispose, shallowRef } from 'vue';

type IoSource<T> = {
  snapshot(): T;
  subscribe(fn: (v: T) => void): () => void;
};

type IoVueOptions = {
  schedule?: IoSchedule;
};

function createUpdater<T>(
  schedule: IoSchedule,
  apply: (value: T) => void,
): { push: (value: T) => void; cancel: () => void } {
  if (schedule === 'sync') {
    return {
      push: (value) => apply(value),
      cancel: () => undefined,
    };
  }

  let active = true;
  let pending = false;
  let token = 0;
  let last: T;
  return {
    push: (value: T) => {
      last = value;
      if (pending) return;
      pending = true;
      token += 1;
      const currentToken = token;
      scheduleTask(schedule, () => {
        if (!active || !pending || currentToken !== token) return;
        pending = false;
        apply(last);
      });
    },
    cancel: () => {
      active = false;
      pending = false;
      token += 1;
    },
  };
}

export function useIO<T>(
  source: IoSource<T>,
  options?: IoVueOptions,
): ShallowRef<T> {
  const state = shallowRef(source.snapshot()) as ShallowRef<T>;

  const schedule = options?.schedule ?? 'microtask';
  const updater = createUpdater<T>(schedule, (value) => {
    state.value = value;
  });
  const unsub = source.subscribe((v) => updater.push(v));
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
    const updater = createUpdater<T>(schedule, (value) => {
      current = value;
      trigger();
    });
    const unsub = unit.subscribe((v) => updater.push(v));
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
