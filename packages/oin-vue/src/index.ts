import type { OinUnit } from '@oin/store';
import type { Ref, ShallowRef } from 'vue';

import { scheduleTask } from '@oin/store';
import { customRef, onScopeDispose, shallowRef } from 'vue';

type OinSource<T> = {
  snapshot(): T;
  subscribe(fn: (v: T) => void): () => void;
};

export function useOin<T>(source: OinSource<T>): ShallowRef<T> {
  const state = shallowRef(source.snapshot()) as ShallowRef<T>;

  let pending = false;
  let last = state.value;
  const unsub = source.subscribe((v) => {
    last = v;
    if (pending) return;
    pending = true;
    scheduleTask('microtask', () => {
      pending = false;
      state.value = last;
    });
  });
  onScopeDispose(unsub);

  return state;
}

export function oinRef<T>(unit: OinUnit<T>): Ref<T> {
  return customRef<T>((track, trigger) => {
    let current = unit();
    let pending = false;
    let last = current;
    const unsub = unit.subscribe((v) => {
      last = v;
      if (pending) return;
      pending = true;
      scheduleTask('microtask', () => {
        pending = false;
        current = last;
        trigger();
      });
    });
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
