import { customRef, onScopeDispose, shallowRef } from 'vue';
import type { Ref, ShallowRef } from 'vue';
import type { OinUnit } from '@oin/store';

type OinSource<T> = {
  snapshot(): T;
  subscribe(fn: (v: T) => void): () => void;
};

export function useOin<T>(source: OinSource<T>): ShallowRef<T> {
  const state = shallowRef(source.snapshot()) as ShallowRef<T>;
  const unsub = source.subscribe((v) => {
    state.value = v;
  });
  onScopeDispose(unsub);
  return state;
}

export function oinRef<T>(unit: OinUnit<T>): Ref<T> {
  return customRef<T>((track, trigger) => {
    let current = unit();
    const unsub = unit.subscribe((v) => {
      current = v;
      trigger();
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
