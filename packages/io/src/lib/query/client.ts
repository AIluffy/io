import { createMutation } from './mutation.js';
import { createQuery, getQueryInternal } from './query.js';
import type {
  IoMutation,
  IoMutationOptions,
  IoQuery,
  IoQueryCacheEvent,
  IoQueryClient,
  IoQueryClientOptions,
  IoQueryFilter,
  IoQueryKey,
  IoQueryOptions,
  IoUnsubscribe,
} from './types.js';
import {
  DEFAULT_GC_TIME,
  DEFAULT_RETRY_ATTEMPTS,
  DEFAULT_STALE_TIME,
  defaultRetryDelay,
  hashKey,
  keyMatches,
} from './utils.js';

type AnyQuery = IoQuery<unknown, unknown>;

type QueryDefaults = {
  staleTime: number;
  gcTime: number;
  retry: number;
  retryDelay: (attempt: number) => number;
};

type InternalQueryOptions<TData, TError> = IoQueryOptions<TData, TError> &
  QueryDefaults & {
    onGarbageCollect?: (query: IoQuery<TData, TError>) => void;
    canFetch?: boolean;
  };

type QueryOptionsInput<TData, TError> = IoQueryOptions<TData, TError> & {
  canFetch?: boolean;
};

function matchesFilter(
  query: AnyQuery,
  filter?: IoQueryFilter,
  filterKeyHash?: string,
): boolean {
  if (!filter) {
    return true;
  }

  if (filter.key) {
    if (filter.exact ?? false) {
      if (query.keyHash !== (filterKeyHash ?? hashKey(filter.key))) {
        return false;
      }
    } else if (!keyMatches(query.key, filter.key, false, query.keyHash)) {
      return false;
    }
  }

  if (filter.predicate && !filter.predicate(query)) {
    return false;
  }

  return true;
}

let defaultClient: IoQueryClient | undefined;

export function createQueryClient(
  options: IoQueryClientOptions = {},
): IoQueryClient {
  const defaults: QueryDefaults = {
    staleTime: options.defaultStaleTime ?? DEFAULT_STALE_TIME,
    gcTime: options.defaultGcTime ?? DEFAULT_GC_TIME,
    retry: options.defaultRetry ?? DEFAULT_RETRY_ATTEMPTS,
    retryDelay: options.defaultRetryDelay ?? defaultRetryDelay,
  };

  const queries = new Map<string, AnyQuery>();
  const queryUpdateUnsubs = new Map<string, IoUnsubscribe>();
  const listeners = new Set<(event: IoQueryCacheEvent) => void>();

  const notify = (event: IoQueryCacheEvent): void => {
    for (const listener of listeners) {
      listener(event);
    }
  };

  const removeByHash = (keyHash: string, reset = false): void => {
    const query = queries.get(keyHash);
    if (!query) {
      return;
    }

    query.cancel();
    if (reset) {
      query.reset();
    }

    queryUpdateUnsubs.get(keyHash)?.();
    queryUpdateUnsubs.delete(keyHash);

    queries.delete(keyHash);
    notify({
      type: 'query-removed',
      query,
    });
  };

  const registerQuery = (query: AnyQuery): void => {
    queries.set(query.keyHash, query);

    const updateUnsub = query.subscribeUpdate(() => {
      notify({
        type: 'query-updated',
        query,
      });
    });
    queryUpdateUnsubs.set(query.keyHash, updateUnsub);

    notify({
      type: 'query-added',
      query,
    });
  };

  const getQueries = (filter?: IoQueryFilter): AnyQuery[] => {
    if (!filter) {
      return Array.from(queries.values());
    }

    const filterKeyHash =
      filter.key && (filter.exact ?? false) ? hashKey(filter.key) : undefined;

    return Array.from(queries.values()).filter((query) => {
      return matchesFilter(query, filter, filterKeyHash);
    });
  };

  const resolveQueryOptions = <TData, TError>(
    queryOptions: QueryOptionsInput<TData, TError>,
    onGarbageCollect: (query: IoQuery<TData, TError>) => void,
  ): InternalQueryOptions<TData, TError> => ({
    ...queryOptions,
    staleTime: queryOptions.staleTime ?? defaults.staleTime,
    gcTime: queryOptions.gcTime ?? defaults.gcTime,
    retry: queryOptions.retry ?? defaults.retry,
    retryDelay: queryOptions.retryDelay ?? defaults.retryDelay,
    onGarbageCollect,
  });

  const queryInternal = <TData = unknown, TError = Error>(
    queryOptions: QueryOptionsInput<TData, TError>,
  ): IoQuery<TData, TError> => {
    const keyHash = hashKey(queryOptions.key);
    const existing = queries.get(keyHash) as IoQuery<TData, TError> | undefined;

    if (existing) {
      const internal = getQueryInternal(existing);
      if (!internal) {
        throw new Error(
          `createQueryClient: internal query API is unavailable for key ${keyHash}`,
        );
      }

      internal.updateOptions(
        resolveQueryOptions(queryOptions, () => {
          removeByHash(keyHash, false);
        }),
      );
      internal.touch();
      return existing;
    }

    const created = createQuery(
      resolveQueryOptions(queryOptions, () => {
        removeByHash(keyHash, false);
      }),
    );

    registerQuery(created as AnyQuery);
    return created;
  };

  const query = <TData = unknown, TError = Error>(
    queryOptions: IoQueryOptions<TData, TError>,
  ): IoQuery<TData, TError> => queryInternal(queryOptions);

  const mutation = <
    TData = unknown,
    TVariables = void,
    TError = Error,
    TContext = unknown,
  >(
    mutationOptions: IoMutationOptions<TData, TVariables, TError, TContext>,
  ): IoMutation<TData, TVariables, TError> => createMutation(mutationOptions);

  const invalidateQueries = (
    filter?: IoQueryFilter,
    refetch = true,
  ): void => {
    for (const matchedQuery of getQueries(filter)) {
      matchedQuery.invalidate(refetch);
    }
  };

  const cancelQueries = (filter?: IoQueryFilter): void => {
    for (const matchedQuery of getQueries(filter)) {
      matchedQuery.cancel();
    }
  };

  const removeQueries = (filter?: IoQueryFilter): void => {
    for (const matchedQuery of getQueries(filter)) {
      removeByHash(matchedQuery.keyHash, false);
    }
  };

  const getQuery = <TData = unknown, TError = Error>(
    key: IoQueryKey,
  ): IoQuery<TData, TError> | undefined =>
    queries.get(hashKey(key)) as IoQuery<TData, TError> | undefined;

  const getQueryData = <TData = unknown>(key: IoQueryKey): TData | undefined =>
    getQuery<TData>(key)?.snapshot().data;

  const setQueryData = <TData = unknown>(
    key: IoQueryKey,
    updater: TData | ((prev: TData | undefined) => TData),
  ): void => {
    const existing = getQuery<TData>(key);

    if (existing) {
      existing.setData(updater);
      return;
    }

    const created = queryInternal<TData>({
      key,
      queryFn: async () => {
        throw new Error(
          `setQueryData: seeded query has no queryFn for key ${hashKey(key)}. Call client.query(...) first to attach a queryFn.`,
        );
      },
      autoFetch: false,
      canFetch: false,
    });
    created.setData(updater);
  };

  const clear = (): void => {
    for (const keyHash of Array.from(queries.keys())) {
      removeByHash(keyHash, true);
    }
  };

  const subscribe = (fn: (event: IoQueryCacheEvent) => void): IoUnsubscribe => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  };

  return {
    query,
    mutation,
    invalidateQueries,
    cancelQueries,
    removeQueries,
    getQueryData,
    setQueryData,
    getQuery,
    getQueries,
    clear,
    subscribe,
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
