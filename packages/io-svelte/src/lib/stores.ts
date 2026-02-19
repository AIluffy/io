import type {
  IoQueryState,
  IoResource,
  IoResourceOptions,
  IoResourceRequestOptions,
} from '@iostore/query';
import type { IoSchedule, IoUnit } from '@iostore/store';
import type { Readable, Writable } from 'svelte/store';

import { createResource } from '@iostore/query';
import { createScheduledDispatcher } from '@iostore/store';

type IoSource<T> = {
  snapshot(): T;
  subscribe(fn: (v: T) => void): () => void;
};

type IoSvelteOptions = {
  schedule?: IoSchedule;
};

type IoSelectorOptions<TSelected> = IoSvelteOptions & {
  isEqual?: (prev: TSelected, next: TSelected) => boolean;
};

type IoQueryStoreOptions = {
  enabled?: boolean;
  cancelOnUnsubscribe?: boolean;
};

export type IoQueryStore<TData> = Readable<IoQueryState<TData>> & {
  getState: () => IoQueryState<TData>;
  fetch: (options?: IoResourceRequestOptions) => Promise<TData>;
  refetch: () => Promise<TData>;
  prefetch: (options?: IoResourceRequestOptions) => Promise<void>;
  invalidate: (options?: {
    action?: string;
    meta?: Record<string, unknown>;
  }) => number;
  cancel: () => number;
};

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function shouldAutoFetch<TData>(state: IoQueryState<TData>): boolean {
  if (state.fetchStatus === 'fetching') {
    return false;
  }
  return state.status === 'idle' || state.invalidated;
}

export function toReadable<T>(
  source: IoSource<T>,
  options?: IoSvelteOptions,
): Readable<T> {
  return {
    subscribe(run) {
      run(source.snapshot());
      const schedule = options?.schedule ?? 'microtask';
      const updater = createScheduledDispatcher<[T]>(schedule, (value) => {
        run(value);
      });
      const unsub = source.subscribe((v) => updater.dispatch(v));
      return () => {
        updater.cancel();
        unsub();
      };
    },
  };
}

export function toWritable<T>(
  unit: IoUnit<T>,
  options?: IoSvelteOptions,
): Writable<T> {
  return {
    subscribe(run) {
      run(unit.get());
      const schedule = options?.schedule ?? 'microtask';
      const updater = createScheduledDispatcher<[T]>(schedule, (value) => {
        run(value);
      });
      const unsub = unit.subscribe((v) => updater.dispatch(v));
      return () => {
        updater.cancel();
        unsub();
      };
    },
    set(value) {
      unit.set(value);
    },
    update(updater) {
      unit.set((prev) => updater(prev));
    },
  };
}

export function toReadableSelector<TSource, TSelected>(
  source: IoSource<TSource>,
  selector: (value: TSource) => TSelected,
  options?: IoSelectorOptions<TSelected>,
): Readable<TSelected> {
  return {
    subscribe(run) {
      const isEqual = options?.isEqual ?? Object.is;
      let selected = selector(source.snapshot());
      run(selected);

      const schedule = options?.schedule ?? 'microtask';
      const updater = createScheduledDispatcher<[TSelected]>(schedule, (value) => {
        run(value);
      });
      const unsub = source.subscribe((nextSource) => {
        const nextSelected = selector(nextSource);
        if (isEqual(selected, nextSelected)) {
          return;
        }
        selected = nextSelected;
        updater.dispatch(nextSelected);
      });
      return () => {
        updater.cancel();
        unsub();
      };
    },
  };
}

export function toQueryStore<TData>(
  resource: IoResource<TData>,
  options?: IoQueryStoreOptions,
): IoQueryStore<TData> {
  let subscriberCount = 0;
  const enabled = options?.enabled ?? true;
  const cancelOnUnsubscribe = options?.cancelOnUnsubscribe ?? false;

  return {
    subscribe(run) {
      subscriberCount += 1;
      run(resource.getState());
      const unsubscribe = resource.subscribe(() => {
        run(resource.getState());
      });

      if (enabled && subscriberCount === 1 && shouldAutoFetch(resource.getState())) {
        void resource.fetch().catch((error: unknown) => {
          if (isAbortError(error)) {
            return;
          }
        });
      }

      return () => {
        subscriberCount = Math.max(0, subscriberCount - 1);
        unsubscribe();
        if (cancelOnUnsubscribe && subscriberCount === 0) {
          resource.cancel();
        }
      };
    },
    getState: () => resource.getState(),
    fetch: (requestOptions?: IoResourceRequestOptions) =>
      resource.fetch(requestOptions),
    refetch: () => resource.fetch({ force: true }),
    prefetch: (requestOptions?: IoResourceRequestOptions) =>
      resource.prefetch(requestOptions),
    invalidate: (invalidateOptions?: {
      action?: string;
      meta?: Record<string, unknown>;
    }) => resource.invalidate(invalidateOptions),
    cancel: () => resource.cancel(),
  };
}

export function createQueryStore<TData>(
  options: IoResourceOptions<TData> & IoQueryStoreOptions,
): IoQueryStore<TData> {
  const {
    enabled,
    cancelOnUnsubscribe,
    client,
    key,
    queryFn,
    staleTime,
    gcTime,
    retry,
    retryDelay,
    action,
    meta,
  } = options;

  const resource = createResource<TData>({
    client,
    key,
    queryFn,
    staleTime,
    gcTime,
    retry,
    retryDelay,
    action,
    meta,
  });

  return toQueryStore(resource, {
    enabled,
    cancelOnUnsubscribe,
  });
}
