import type { IoSchedule, IoUnit } from '@iostore/store';
import type {
  InfiniteData,
  IoInfiniteQueryDefinition,
  IoInfiniteQueryHandle,
  IoInfiniteQueryObserver,
  IoInfiniteQueryObserverOptions,
  IoInfiniteQueryObserverResult,
  IoQueryClient,
  IoQueryDefinition,
  IoQueryHandle,
  IoQueryObserver,
  IoQueryObserverOptions,
  IoQueryObserverResult,
} from '@iostore/store/query';
import type { Readable, Writable } from 'svelte/store';

import { createScheduledDispatcher } from '@iostore/store';
import { getDefaultClient } from '@iostore/store/query';

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
  cancelOnUnsubscribe?: boolean;
};

type IoCreateQueryStoreDefinitionOptions<TData, TError, TSelected> =
  IoQueryDefinition<TData, TError> &
    Omit<IoQueryObserverOptions<TData, TError, TSelected>, 'query'> &
    IoQueryStoreOptions & {
      client?: IoQueryClient;
    };

type IoCreateQueryStoreHandleOptions<TData, TError, TSelected> =
  Omit<IoQueryObserverOptions<TData, TError, TSelected>, 'query'> &
    IoQueryStoreOptions & {
      query: IoQueryHandle<TData, TError>;
      client?: IoQueryClient;
    };

type IoCreateQueryStoreOptions<TData, TError = Error, TSelected = TData> =
  | IoCreateQueryStoreDefinitionOptions<TData, TError, TSelected>
  | IoCreateQueryStoreHandleOptions<TData, TError, TSelected>;

export type IoQueryStore<TData, TError = Error, TSelected = TData> =
  Readable<IoQueryObserverResult<TSelected, TError>> & {
    getState: () => IoQueryObserverResult<TSelected, TError>;
    fetch: () => Promise<TData>;
    refetch: () => Promise<TData>;
    prefetch: () => Promise<void>;
    invalidate: (refetch?: boolean) => void;
    cancel: () => void;
    query: IoQueryHandle<TData, TError>;
    observer: IoQueryObserver<TSelected, TError>;
  };

function isHandleOptions<TData, TError, TSelected>(
  options: IoCreateQueryStoreOptions<TData, TError, TSelected>,
): options is IoCreateQueryStoreHandleOptions<TData, TError, TSelected> {
  return 'query' in options;
}

function resolveObserverOptions<TData, TError, TSelected>(
  options: IoCreateQueryStoreOptions<TData, TError, TSelected>,
  query: IoQueryHandle<TData, TError>,
): IoQueryObserverOptions<TData, TError, TSelected> {
  return {
    query,
    enabled: options.enabled,
    placeholderData: options.placeholderData,
    select: options.select,
    refetchOnMount: options.refetchOnMount,
    refetchOnWindowFocus: options.refetchOnWindowFocus,
    refetchOnReconnect: options.refetchOnReconnect,
    onSuccess: options.onSuccess,
    onError: options.onError,
    onSettled: options.onSettled,
  };
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

export function toQueryStore<TData, TError = Error, TSelected = TData>(
  observer: IoQueryObserver<TSelected, TError>,
  query: IoQueryHandle<TData, TError>,
  options?: IoQueryStoreOptions,
): IoQueryStore<TData, TError, TSelected> {
  let subscriberCount = 0;
  const cancelOnUnsubscribe = options?.cancelOnUnsubscribe ?? false;

  return {
    subscribe(run) {
      subscriberCount += 1;
      run(observer.snapshot());
      const unsubscribe = observer.subscribe((state) => {
        run(state);
      });

      return () => {
        subscriberCount = Math.max(0, subscriberCount - 1);
        unsubscribe();

        if (cancelOnUnsubscribe && subscriberCount === 0) {
          query.cancel();
        }
      };
    },
    getState: () => observer.snapshot(),
    fetch: () => query.fetch(false),
    refetch: () => query.fetch(true),
    prefetch: () => query.prefetch(),
    invalidate: (refetch = true) => query.invalidate(refetch),
    cancel: () => query.cancel(),
    query,
    observer,
  };
}

export function createQueryStore<TData, TError = Error, TSelected = TData>(
  options: IoCreateQueryStoreOptions<TData, TError, TSelected>,
): IoQueryStore<TData, TError, TSelected> {
  const client = options.client ?? getDefaultClient();

  const query = isHandleOptions(options)
    ? options.query
    : client.getQuery<TData, TError>(options.key) ??
      client.defineQuery<TData, TError>({
        key: options.key,
        queryFn: options.queryFn,
        staleTime: options.staleTime,
        gcTime: options.gcTime,
        retry: options.retry,
        retryDelay: options.retryDelay,
      });

  const observer = client.observeQuery<TData, TError, TSelected>(
    resolveObserverOptions(options, query),
  );

  return toQueryStore(observer, query, {
    cancelOnUnsubscribe: options.cancelOnUnsubscribe,
  });
}


type IoCreateInfiniteQueryStoreDefinitionOptions<
  TData,
  TError,
  TPageParam,
  TSelected,
> = IoInfiniteQueryDefinition<TData, TError, TPageParam> &
  Omit<IoInfiniteQueryObserverOptions<TData, TError, TPageParam, TSelected>, 'query'> &
  IoQueryStoreOptions & {
    client?: IoQueryClient;
  };

type IoCreateInfiniteQueryStoreHandleOptions<
  TData,
  TError,
  TPageParam,
  TSelected,
> = Omit<IoInfiniteQueryObserverOptions<TData, TError, TPageParam, TSelected>, 'query'> &
  IoQueryStoreOptions & {
    query: IoInfiniteQueryHandle<TData, TError, TPageParam>;
    client?: IoQueryClient;
  };

type IoCreateInfiniteQueryStoreOptions<
  TData,
  TError = Error,
  TPageParam = unknown,
  TSelected = InfiniteData<TData, TPageParam>,
> =
  | IoCreateInfiniteQueryStoreDefinitionOptions<TData, TError, TPageParam, TSelected>
  | IoCreateInfiniteQueryStoreHandleOptions<TData, TError, TPageParam, TSelected>;

export type IoInfiniteQueryStore<
  TData,
  TError = Error,
  TPageParam = unknown,
  TSelected = InfiniteData<TData, TPageParam>,
> = Readable<IoInfiniteQueryObserverResult<TSelected, TError, TPageParam>> & {
  getState: () => IoInfiniteQueryObserverResult<TSelected, TError, TPageParam>;
  fetchNextPage: () => Promise<InfiniteData<TData, TPageParam>>;
  fetchPreviousPage: () => Promise<InfiniteData<TData, TPageParam>>;
  refetch: () => Promise<InfiniteData<TData, TPageParam>>;
  prefetch: () => Promise<void>;
  invalidate: (refetch?: boolean) => void;
  cancel: () => void;
  query: IoInfiniteQueryHandle<TData, TError, TPageParam>;
  observer: IoInfiniteQueryObserver<TSelected, TError, TPageParam>;
};

function isInfiniteHandleOptions<TData, TError, TPageParam, TSelected>(
  options: IoCreateInfiniteQueryStoreOptions<TData, TError, TPageParam, TSelected>,
): options is IoCreateInfiniteQueryStoreHandleOptions<
  TData,
  TError,
  TPageParam,
  TSelected
> {
  return 'query' in options;
}

function resolveInfiniteObserverOptions<TData, TError, TPageParam, TSelected>(
  options: IoCreateInfiniteQueryStoreOptions<TData, TError, TPageParam, TSelected>,
  query: IoInfiniteQueryHandle<TData, TError, TPageParam>,
): IoInfiniteQueryObserverOptions<TData, TError, TPageParam, TSelected> {
  return {
    query,
    enabled: options.enabled,
    placeholderData: options.placeholderData,
    select: options.select,
    refetchOnMount: options.refetchOnMount,
    refetchOnWindowFocus: options.refetchOnWindowFocus,
    refetchOnReconnect: options.refetchOnReconnect,
    onSuccess: options.onSuccess,
    onError: options.onError,
    onSettled: options.onSettled,
  };
}

export function toInfiniteQueryStore<
  TData,
  TError = Error,
  TPageParam = unknown,
  TSelected = InfiniteData<TData, TPageParam>,
>(
  observer: IoInfiniteQueryObserver<TSelected, TError, TPageParam>,
  query: IoInfiniteQueryHandle<TData, TError, TPageParam>,
  options?: IoQueryStoreOptions,
): IoInfiniteQueryStore<TData, TError, TPageParam, TSelected> {
  let subscriberCount = 0;
  const cancelOnUnsubscribe = options?.cancelOnUnsubscribe ?? false;

  return {
    subscribe(run) {
      subscriberCount += 1;
      run(observer.snapshot());
      const unsubscribe = observer.subscribe((state) => {
        run(state);
      });

      return () => {
        subscriberCount = Math.max(0, subscriberCount - 1);
        unsubscribe();

        if (cancelOnUnsubscribe && subscriberCount === 0) {
          query.cancel();
        }
      };
    },
    getState: () => observer.snapshot(),
    fetchNextPage: () => query.fetchNextPage(),
    fetchPreviousPage: () => query.fetchPreviousPage(),
    refetch: () => query.refetchAllPages(),
    prefetch: () => query.prefetch(),
    invalidate: (refetch = true) => query.invalidate(refetch),
    cancel: () => query.cancel(),
    query,
    observer,
  };
}

export function createInfiniteQueryStore<
  TData,
  TError = Error,
  TPageParam = unknown,
  TSelected = InfiniteData<TData, TPageParam>,
>(
  options: IoCreateInfiniteQueryStoreOptions<TData, TError, TPageParam, TSelected>,
): IoInfiniteQueryStore<TData, TError, TPageParam, TSelected> {
  const client = options.client ?? getDefaultClient();

  const query = isInfiniteHandleOptions(options)
    ? options.query
    : client.defineInfiniteQuery<TData, TError, TPageParam>({
        key: options.key,
        queryFn: options.queryFn,
        staleTime: options.staleTime,
        gcTime: options.gcTime,
        retry: options.retry,
        retryDelay: options.retryDelay,
        initialPageParam: options.initialPageParam,
        getNextPageParam: options.getNextPageParam,
        getPreviousPageParam: options.getPreviousPageParam,
        maxPages: options.maxPages,
      });

  const observer = client.observeInfiniteQuery<TData, TError, TPageParam, TSelected>(
    resolveInfiniteObserverOptions(options, query),
  );

  return toInfiniteQueryStore(observer, query, {
    cancelOnUnsubscribe: options.cancelOnUnsubscribe,
  });
}
