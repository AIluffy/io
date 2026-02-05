import type { OinSchedule, OinUnit } from '@oin/store';
import type { Ref, ShallowRef } from 'vue';

import { scheduleTask } from '@oin/store';
import { customRef, onScopeDispose, shallowRef } from 'vue';

type OinSource<T> = {
  snapshot(): T;
  subscribe(fn: (v: T) => void): () => void;
};

type OinVueOptions = {
  schedule?: OinSchedule;
};

function createUpdater<T>(
  schedule: OinSchedule,
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

export function useOin<T>(
  source: OinSource<T>,
  options?: OinVueOptions,
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

export function oinRef<T>(
  unit: OinUnit<T>,
  options?: OinVueOptions,
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
