import { createMutation } from './mutation.js';
import { createQueryObserver } from './query-observer.js';
import { createQueryCache } from './query-cache.js';
import type { NormalizedQueryDefinition } from './query-record.js';
import type {
  IoDehydrateOptions,
  IoDehydratedQuery,
  IoDehydratedState,
  IoHydrateOptions,
  IoInfiniteQueryDefinition,
  IoInfiniteQueryHandle,
  IoInfiniteQueryObserver,
  IoInfiniteQueryObserverOptions,
  IoMutation,
  IoMutationOptions,
  IoQueryClient,
  IoQueryClientOptions,
  IoQueryDefinition,
  IoQueryFilter,
  IoQueryHandle,
  IoQueryInput,
  IoQueryObserver,
  IoQueryObserverOptions,
  IoQueryState,
} from './types.js';
import {
  DEFAULT_GC_TIME,
  DEFAULT_RETRY_ATTEMPTS,
  DEFAULT_STALE_TIME,
  defaultRetryDelay,
  hashKey,
  reportBackgroundError,
} from './utils.js';
import { dehydrateQueries, filterHydrationQueries } from './hydration.js';

type QueryDefaults = {
  staleTime: number;
  gcTime: number;
  retry: number;
  retryDelay: (attempt: number) => number;
  refetchOnMount: false | 'stale' | 'always';
  refetchOnWindowFocus: boolean;
  refetchOnReconnect: boolean;
};

let defaultClient: IoQueryClient | undefined;

function isHandle<TData, TError>(
  value: IoQueryInput<TData, TError>,
): value is IoQueryHandle<TData, TError> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'keyHash' in value &&
    'fetch' in value &&
    typeof (value as { fetch?: unknown }).fetch === 'function'
  );
}

function createSeededQueryFn(keyHash: string): (context: {
  signal: AbortSignal;
}) => Promise<never> {
  return async () => {
    throw new Error(
      `query.fetch: queryFn is not available for key ${keyHash}. Call defineQuery(...) first.`,
    );
  };
}

export function createQueryClient(
  options: IoQueryClientOptions = {},
): IoQueryClient {
  const defaults: QueryDefaults = {
    staleTime: options.defaultStaleTime ?? DEFAULT_STALE_TIME,
    gcTime: options.defaultGcTime ?? DEFAULT_GC_TIME,
    retry: options.defaultRetry ?? DEFAULT_RETRY_ATTEMPTS,
    retryDelay: options.defaultRetryDelay ?? defaultRetryDelay,
    refetchOnMount: options.defaultRefetchOnMount ?? 'stale',
    refetchOnWindowFocus: options.defaultRefetchOnWindowFocus ?? false,
    refetchOnReconnect: options.defaultRefetchOnReconnect ?? false,
  };

  const cache = createQueryCache();

  const normalizeDefinition = <TData, TError>(
    definition: IoQueryDefinition<TData, TError>,
    canFetch = true,
  ): NormalizedQueryDefinition<TData, TError> => ({
    key: definition.key,
    keyHash: hashKey(definition.key),
    queryFn: definition.queryFn,
    staleTime: definition.staleTime ?? defaults.staleTime,
    gcTime: definition.gcTime ?? defaults.gcTime,
    retry: definition.retry ?? defaults.retry,
    retryDelay: definition.retryDelay ?? defaults.retryDelay,
    canFetch,
  });

  const defineQuery = <TData = unknown, TError = Error>(
    definition: IoQueryDefinition<TData, TError>,
  ): IoQueryHandle<TData, TError> => {
    const normalized = normalizeDefinition(definition, true);
    return cache.define(normalized);
  };

  const resolveHandle = <TData = unknown, TError = Error>(
    input: IoQueryInput<TData, TError>,
  ): IoQueryHandle<TData, TError> => {
    if (isHandle(input)) {
      return input;
    }
    return defineQuery<TData, TError>(input);
  };

  const fetchQuery = <TData = unknown, TError = Error>(
    input: IoQueryInput<TData, TError>,
  ): Promise<TData> => resolveHandle(input).fetch(true);

  const prefetchQuery = <TData = unknown, TError = Error>(
    input: IoQueryInput<TData, TError>,
  ): Promise<void> => resolveHandle(input).prefetch();


  const prefetchInfiniteQuery = <
    TData = unknown,
    TError = Error,
    TPageParam = unknown,
  >(
    _input: IoInfiniteQueryDefinition<TData, TError, TPageParam>,
    _pages?: number,
  ): Promise<void> => {
    void _input;
    void _pages;
    throw new Error('query.prefetchInfiniteQuery: not implemented');
  };

  const ensureQueryData = <TData = unknown, TError = Error>(
    input: IoQueryInput<TData, TError>,
  ): Promise<TData> => resolveHandle(input).ensureData();


  const defineInfiniteQuery = <
    TData = unknown,
    TError = Error,
    TPageParam = unknown,
  >(
    _definition: IoInfiniteQueryDefinition<TData, TError, TPageParam>,
  ): IoInfiniteQueryHandle<TData, TError, TPageParam> => {
    void _definition;
    throw new Error('query.defineInfiniteQuery: not implemented');
  };

  const observeInfiniteQuery = <
    TData = unknown,
    TError = Error,
    TPageParam = unknown,
    TSelected = TData,
  >(
    _options: IoInfiniteQueryObserverOptions<
      TData,
      TError,
      TPageParam,
      TSelected
    >,
  ): IoInfiniteQueryObserver<TSelected, TError, TPageParam> => {
    void _options;
    throw new Error('query.observeInfiniteQuery: not implemented');
  };

  const observeQuery = <TData = unknown, TError = Error, TSelected = TData>(
    observerOptions: IoQueryObserverOptions<TData, TError, TSelected>,
  ): IoQueryObserver<TSelected, TError> => {
    const handle = resolveHandle(observerOptions.query);
    const record = cache.getRecord<TData, TError>(handle.key);

    if (!record) {
      throw new Error(
        `observeQuery: query record is unavailable for key ${handle.keyHash}`,
      );
    }

    return createQueryObserver<TData, TError, TSelected>({
      record,
      observerOptions,
      defaultRefetchOnMount: defaults.refetchOnMount,
      defaultRefetchOnWindowFocus: defaults.refetchOnWindowFocus,
      defaultRefetchOnReconnect: defaults.refetchOnReconnect,
    });
  };

  const mutation = <
    TData = unknown,
    TVariables = void,
    TError = Error,
    TContext = unknown,
  >(
    mutationOptions: IoMutationOptions<TData, TVariables, TError, TContext>,
  ): IoMutation<TData, TVariables, TError> => createMutation(mutationOptions);

  const getQuery = <TData = unknown, TError = Error>(
    key: readonly unknown[],
  ): IoQueryHandle<TData, TError> | undefined =>
    cache.getHandle<TData, TError>(key);

  const getQueries = (filter?: IoQueryFilter): IoQueryHandle<unknown, unknown>[] =>
    cache.getAll(filter);

  const getQueryData = <TData = unknown>(
    key: readonly unknown[],
  ): TData | undefined => getQuery<TData>(key)?.getData();

  const getQueryState = <TData = unknown, TError = Error>(
    key: readonly unknown[],
  ): IoQueryState<TData, TError> | undefined => getQuery<TData, TError>(key)?.getState();

  const setQueryData = <TData = unknown>(
    key: readonly unknown[],
    updater: TData | ((prev: TData | undefined) => TData),
  ): void => {
    const existing = getQuery<TData>(key);
    if (existing) {
      existing.setData(updater);
      return;
    }

    const keyHash = hashKey(key);
    const seeded = cache.define(
      normalizeDefinition<TData, Error>(
        {
          key,
          queryFn: createSeededQueryFn(keyHash),
        },
        false,
      ),
    );
    seeded.setData(updater);
  };

  const setQueriesData = <TData = unknown>(
    filter: IoQueryFilter,
    updater: (prev: TData | undefined) => TData,
  ): void => {
    for (const query of getQueries(filter)) {
      query.setData((prev: unknown) => updater(prev as TData | undefined));
    }
  };

  const invalidateQueries = (filter?: IoQueryFilter, refetch = true): void => {
    for (const query of getQueries(filter)) {
      query.invalidate(refetch);
    }
  };

  const refetchQueries = async (filter?: IoQueryFilter): Promise<void> => {
    await Promise.all(
      getQueries(filter).map((query) => {
        return query.fetch(true).then(() => undefined);
      }),
    );
  };

  const cancelQueries = (filter?: IoQueryFilter): void => {
    for (const query of getQueries(filter)) {
      query.cancel();
    }
  };

  const resetQueries = (filter?: IoQueryFilter): void => {
    for (const query of getQueries(filter)) {
      query.reset();
    }
  };

  const removeQueries = (filter?: IoQueryFilter): void => {
    for (const query of getQueries(filter)) {
      cache.removeByHash(query.keyHash, false);
    }
  };

  const clear = (): void => {
    cache.clear(true);
  };

  const dehydrate = (dehydrateOptions?: IoDehydrateOptions): IoDehydratedState => {
    return dehydrateQueries(getQueries(), dehydrateOptions);
  };

  const hydrate = (
    state: IoDehydratedState,
    hydrateOptions?: IoHydrateOptions,
  ): void => {
    const filtered = filterHydrationQueries(state, hydrateOptions);

    for (const query of filtered.queries) {
      const existing = cache.getRecord<unknown, unknown>(query.key);
      if (existing) {
        existing.hydrate(query.state);
        continue;
      }

      cache.seed(
        normalizeDefinition<unknown, Error>(
          {
            key: query.key,
            queryFn: createSeededQueryFn(query.keyHash),
          },
          false,
        ),
        query.state,
      );
    }
  };

  return {
    defineQuery,
    defineInfiniteQuery,
    observeQuery,
    observeInfiniteQuery,
    fetchQuery,
    prefetchQuery,
    prefetchInfiniteQuery,
    ensureQueryData,
    mutation,
    invalidateQueries,
    refetchQueries,
    cancelQueries,
    resetQueries,
    removeQueries,
    getQueryData,
    setQueryData,
    setQueriesData,
    getQueryState,
    getQuery,
    getQueries,
    dehydrate,
    hydrate,
    clear,
    subscribe: cache.subscribe,
  };
}

export function getDefaultClient(): IoQueryClient {
  if (!defaultClient) {
    defaultClient = createQueryClient();
  }
  return defaultClient;
}

export function resetDefaultClient(): void {
  defaultClient?.clear();
  defaultClient = undefined;
}

export function isDehydratedQuery(
  value: unknown,
): value is IoDehydratedQuery {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  if (!('key' in value) || !('keyHash' in value) || !('state' in value)) {
    return false;
  }

  return true;
}

export function safeRefetch(
  client: IoQueryClient,
  filter?: IoQueryFilter,
): void {
  void client.refetchQueries(filter).catch((error: unknown) => {
    reportBackgroundError('queryClient.safeRefetch()', error);
  });
}
