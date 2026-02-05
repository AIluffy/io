import type { IoSchedule, IoUnit } from 'io-store';
import type { Ref, ShallowRef } from 'vue';

import { scheduleTask } from 'io-store';
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
): (value: T) => void {
  if (schedule === 'sync') return (value) => apply(value);

  let pending = false;
  let last: T;
  return (value: T) => {
    last = value;
    if (pending) return;
    pending = true;
    scheduleTask(schedule, () => {
      pending = false;
      apply(last);
    });
  };
}

export function useIo<T>(
  source: IoSource<T>,
  options?: IoVueOptions,
): ShallowRef<T> {
  const state = shallowRef(source.snapshot()) as ShallowRef<T>;

  const schedule = options?.schedule ?? 'microtask';
  const update = createUpdater<T>(schedule, (value) => {
    state.value = value;
  });
  const unsub = source.subscribe((v) => update(v));
  onScopeDispose(unsub);

  return state;
}

export function ioRef<T>(
  unit: IoUnit<T>,
  options?: IoVueOptions,
): Ref<T> {
  return customRef<T>((track, trigger) => {
    let current = unit();
    const schedule = options?.schedule ?? 'microtask';
    const update = createUpdater<T>(schedule, (value) => {
      current = value;
      trigger();
    });
    const unsub = unit.subscribe((v) => update(v));
    onScopeDispose(unsub);
    return {
      get() {
        track();
        return current;
      },
      set(value) {
        unit(value);
      },
    };
  });
}
