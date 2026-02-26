import type { IoSchedule, IoUnit } from '@iostore/store';
import type {
  IoQuery,
  IoQueryClient,
  IoQueryOptions,
  IoQueryState,
} from '@iostore/store/query';
import type { Readable, Writable } from 'svelte/store';

import { createScheduledDispatcher } from '@iostore/store';
import { getDefaultClient, reportBackgroundError } from '@iostore/store/query';

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

export type IoQueryStore<TData, TError = Error> =
  Readable<IoQueryState<TData, TError>> & {
    getState: () => IoQueryState<TData, TError>;
    fetch: () => Promise<TData>;
    refetch: () => Promise<TData>;
    prefetch: () => Promise<void>;
    invalidate: (refetch?: boolean) => void;
    cancel: () => void;
    query: IoQuery<TData, TError>;
  };

function forceRefetch<TData, TError>(
  query: IoQuery<TData, TError>,
): Promise<TData> {
  query.invalidate(false);
  return query.fetch();
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

export function toQueryStore<TData, TError = Error>(
  query: IoQuery<TData, TError>,
  options?: IoQueryStoreOptions,
): IoQueryStore<TData, TError> {
  let subscriberCount = 0;
  const enabled = options?.enabled ?? true;
  const cancelOnUnsubscribe = options?.cancelOnUnsubscribe ?? false;

  return {
    subscribe(run) {
      subscriberCount += 1;
      run(query.snapshot());
      const unsubscribe = query.subscribe((state) => {
        run(state);
      });

      if (enabled && subscriberCount === 1) {
        void query.fetch().catch((error: unknown) => {
          reportBackgroundError('svelte.toQueryStore(fetch)', error);
        });
      }

      return () => {
        subscriberCount = Math.max(0, subscriberCount - 1);
        unsubscribe();
        if (cancelOnUnsubscribe && subscriberCount === 0) {
          query.cancel();
        }
      };
    },
    getState: () => query.snapshot(),
    fetch: () => query.fetch(),
    refetch: () => forceRefetch(query),
    prefetch: () => query.prefetch(),
    invalidate: (refetch = true) => query.invalidate(refetch),
    cancel: () => query.cancel(),
    query,
  };
}

export function createQueryStore<TData, TError = Error>(
  options: IoQueryOptions<TData, TError> &
    IoQueryStoreOptions & { client?: IoQueryClient },
): IoQueryStore<TData, TError> {
  const {
    enabled,
    cancelOnUnsubscribe,
    client: providedClient,
    ...queryOptions
  } = options;

  const client = providedClient ?? getDefaultClient();
  const query = client.query<TData, TError>(
    queryOptions as IoQueryOptions<TData, TError>,
  );
  const shouldFetchOnSubscribe =
    (enabled ?? true) && queryOptions.autoFetch !== true;

  return toQueryStore(query, {
    enabled: shouldFetchOnSubscribe,
    cancelOnUnsubscribe,
  });
}
