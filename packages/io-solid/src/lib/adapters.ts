import type { IoSchedule } from 'io-store';
import type { Accessor } from 'solid-js';

import { scheduleTask } from 'io-store';
import { createSignal, onCleanup } from 'solid-js';

type IoSource<T> = {
  snapshot(): T;
  subscribe(fn: (value: T) => void): () => void;
};

type IoSolidOptions = {
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

export function useIO<T>(source: IoSource<T>, options?: IoSolidOptions): Accessor<T> {
  const [state, setState] = createSignal(source.snapshot());

  const schedule = options?.schedule ?? 'microtask';
  const updater = createUpdater<T>(schedule, (value) => {
    setState(() => value);
  });
  const unsub = source.subscribe((value) => updater.push(value));

  onCleanup(() => {
    updater.cancel();
    unsub();
  });

  return state;
}
