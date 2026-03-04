/**
 * Core query client construction and primary APIs.
 */
import { createInfiniteQueryObserver } from './infinite-query-observer.js';
import { createMutation } from './mutation.js';
import { createQueryObserver } from './query-observer.js';
import { createQueryCache } from './query-cache.js';
import type {
  IoInfiniteQueryDefinition,
  IoInfiniteQueryObserver,
  IoInfiniteQueryObserverOptions,
  IoMutation,
  IoMutationOptions,
  IoQueryClient,
  IoQueryClientOptions,
  IoQueryDefinition,
  IoQueryHandle,
  IoQueryInput,
  IoQueryObserver,
  IoQueryObserverOptions,
} from './types.js';
import { hashKey, reportBackgroundError } from './utils.js';
import {
  createQueryDefaults,
  normalizeDefinition,
  normalizeInfiniteDefinition,
} from './client-defaults.js';
import {
  createSeededInfiniteQueryFn,
  createSeededQueryFn,
  isHandle,
  isInfiniteHandle,
} from './client-helpers.js';
import { createClientFilters } from './client-filters.js';
import { createClientHydration } from './client-hydration.js';

export function createQueryClient(options: IoQueryClientOptions = {}): IoQueryClient {
  const defaults = createQueryDefaults(options);
  const cache = createQueryCache();

  const defineQuery = <TData = unknown, TError = Error>(definition: IoQueryDefinition<TData, TError>) =>
    cache.define(normalizeDefinition(defaults, definition, true));

  const defineInfiniteQuery = <TData = unknown, TError = Error, TPageParam = unknown>(
    definition: IoInfiniteQueryDefinition<TData, TError, TPageParam>,
  ) => cache.defineInfinite(normalizeInfiniteDefinition(defaults, definition, true));

  const resolveHandle = <TData = unknown, TError = Error>(
    input: IoQueryInput<TData, TError>,
  ): IoQueryHandle<TData, TError> => (isHandle(input) ? input : defineQuery<TData, TError>(input));

  const observeQuery = <TData = unknown, TError = Error, TSelected = TData>(
    observerOptions: IoQueryObserverOptions<TData, TError, TSelected>,
  ): IoQueryObserver<TSelected, TError> => {
    const handle = resolveHandle(observerOptions.query);
    const record = cache.getRecord<TData, TError>(handle.key);
    if (!record) throw new Error(`observeQuery: query record is unavailable for key ${handle.keyHash}`);
    return createQueryObserver({
      record,
      observerOptions,
      defaultRefetchOnMount: defaults.refetchOnMount,
      defaultRefetchOnWindowFocus: defaults.refetchOnWindowFocus,
      defaultRefetchOnReconnect: defaults.refetchOnReconnect,
    });
  };

  const observeInfiniteQuery = <TData = unknown, TError = Error, TPageParam = unknown, TSelected = TData>(
    observerOptions: IoInfiniteQueryObserverOptions<TData, TError, TPageParam, TSelected>,
  ): IoInfiniteQueryObserver<TSelected, TError, TPageParam> => {
    const handle = isInfiniteHandle(observerOptions.query)
      ? observerOptions.query
      : defineInfiniteQuery(observerOptions.query);
    const record = cache.getInfiniteRecord<TData, TError, TPageParam>(handle.key);
    if (!record) {
      throw new Error(`observeInfiniteQuery: query record is unavailable for key ${handle.keyHash}`);
    }
    return createInfiniteQueryObserver({
      record,
      observerOptions,
      defaultRefetchOnMount: defaults.refetchOnMount,
      defaultRefetchOnWindowFocus: defaults.refetchOnWindowFocus,
      defaultRefetchOnReconnect: defaults.refetchOnReconnect,
    });
  };

  const mutation = <TData = unknown, TVariables = void, TError = Error, TContext = unknown>(
    mutationOptions: IoMutationOptions<TData, TVariables, TError, TContext>,
  ): IoMutation<TData, TVariables, TError> => createMutation(mutationOptions);

  const filters = createClientFilters({
    cache,
    createSeededQuery: <TData = unknown>(key: readonly unknown[]) =>
      cache.define(
        normalizeDefinition<TData, Error>(
          defaults,
          { key, queryFn: createSeededQueryFn(hashKey(key)) },
          false,
        ),
      ),
    createSeededInfiniteQuery: <TData = unknown, TPageParam = unknown>(key: readonly unknown[]) =>
      cache.defineInfinite(
        normalizeInfiniteDefinition<TData, Error, TPageParam>(
          defaults,
          {
            key,
            queryFn: createSeededInfiniteQueryFn<TPageParam>(hashKey(key)),
            initialPageParam: undefined as TPageParam,
            getNextPageParam: () => null,
          },
          false,
        ),
      ),
  });

  const hydration = createClientHydration({ cache, defaults, getQueries: () => filters.getQueries() });

  return {
    defineQuery,
    defineInfiniteQuery,
    observeQuery,
    observeInfiniteQuery,
    fetchQuery: <TData = unknown, TError = Error>(input: IoQueryInput<TData, TError>) => resolveHandle(input).fetch(true),
    prefetchQuery: <TData = unknown, TError = Error>(input: IoQueryInput<TData, TError>) => resolveHandle(input).prefetch(),
    prefetchInfiniteQuery: <TData = unknown, TError = Error, TPageParam = unknown>(
      input: IoInfiniteQueryDefinition<TData, TError, TPageParam>,
      pages = 1,
    ) =>
      Array.from({ length: Math.max(1, pages) })
        .reduce<Promise<void>>(
          (promise) => promise.then(() => defineInfiniteQuery<TData, TError, TPageParam>(input).fetchNextPage().then(() => undefined)),
          Promise.resolve(),
        )
        .catch((error: unknown) => {
          reportBackgroundError('query.prefetchInfiniteQuery()', error);
        }),
    ensureQueryData: <TData = unknown, TError = Error>(input: IoQueryInput<TData, TError>) => resolveHandle(input).ensureData(),
    mutation,
    ...filters,
    ...hydration,
    clear: () => cache.clear(true),
    subscribe: cache.subscribe,
  };
}
