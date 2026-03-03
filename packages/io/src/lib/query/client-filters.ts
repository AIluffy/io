/**
 * Query client data accessors and batch filter operations.
 */
import type { QueryCache } from './query-cache.js';
import type {
  InfiniteData,
  IoInfiniteQueryHandle,
  IoInfiniteQueryState,
  IoQueryFilter,
  IoQueryHandle,
  IoQueryState,
} from './types.js';

export type ClientFilters = {
  getQuery: <TData = unknown, TError = Error>(
    key: readonly unknown[],
  ) => IoQueryHandle<TData, TError> | undefined;
  getInfiniteQuery: <TData = unknown, TError = Error, TPageParam = unknown>(
    key: readonly unknown[],
  ) => IoInfiniteQueryHandle<TData, TError, TPageParam> | undefined;
  getQueries: (filter?: IoQueryFilter) => IoQueryHandle<unknown, unknown>[];
  getQueryData: <TData = unknown>(key: readonly unknown[]) => TData | undefined;
  setQueryData: <TData = unknown>(
    key: readonly unknown[],
    updater: TData | ((prev: TData | undefined) => TData),
  ) => void;
  getInfiniteQueryData: <TData = unknown, TPageParam = unknown>(
    key: readonly unknown[],
  ) => InfiniteData<TData, TPageParam> | undefined;
  setInfiniteQueryData: <TData = unknown, TPageParam = unknown>(
    key: readonly unknown[],
    updater:
      | InfiniteData<TData, TPageParam>
      | ((prev: InfiniteData<TData, TPageParam> | undefined) => InfiniteData<TData, TPageParam>),
  ) => void;
  setQueriesData: <TData = unknown>(
    filter: IoQueryFilter,
    updater: (prev: TData | undefined) => TData,
  ) => void;
  getQueryState: <TData = unknown, TError = Error>(
    key: readonly unknown[],
  ) => IoQueryState<TData, TError> | undefined;
  getInfiniteQueryState: <TData = unknown, TError = Error, TPageParam = unknown>(
    key: readonly unknown[],
  ) => IoInfiniteQueryState<TData, TError, TPageParam> | undefined;
  invalidateQueries: (filter?: IoQueryFilter, refetch?: boolean) => void;
  refetchQueries: (filter?: IoQueryFilter) => Promise<void>;
  cancelQueries: (filter?: IoQueryFilter) => void;
  resetQueries: (filter?: IoQueryFilter) => void;
  removeQueries: (filter?: IoQueryFilter) => void;
};

type FiltersDeps = {
  cache: QueryCache;
  createSeededQuery: <TData = unknown>(key: readonly unknown[]) => IoQueryHandle<TData, Error>;
  createSeededInfiniteQuery: <TData = unknown, TPageParam = unknown>(
    key: readonly unknown[],
  ) => IoInfiniteQueryHandle<TData, Error, TPageParam>;
};

export function createClientFilters({
  cache,
  createSeededQuery,
  createSeededInfiniteQuery,
}: FiltersDeps): ClientFilters {
  const getQuery = <TData = unknown, TError = Error>(key: readonly unknown[]) =>
    cache.getHandle<TData, TError>(key);
  const getInfiniteQuery = <TData = unknown, TError = Error, TPageParam = unknown>(
    key: readonly unknown[],
  ) => cache.getInfiniteHandle<TData, TError, TPageParam>(key);
  const getQueries = (filter?: IoQueryFilter) => cache.getAll(filter);

  const setQueryData = <TData = unknown>(
    key: readonly unknown[],
    updater: TData | ((prev: TData | undefined) => TData),
  ): void => {
    const existing = getQuery<TData>(key);
    (existing ?? createSeededQuery<TData>(key)).setData(updater);
  };

  const setInfiniteQueryData = <TData = unknown, TPageParam = unknown>(
    key: readonly unknown[],
    updater:
      | InfiniteData<TData, TPageParam>
      | ((prev: InfiniteData<TData, TPageParam> | undefined) => InfiniteData<TData, TPageParam>),
  ): void => {
    const existing = getInfiniteQuery<TData, Error, TPageParam>(key);
    (existing ?? createSeededInfiniteQuery<TData, TPageParam>(key)).setData(updater);
  };

  return {
    getQuery,
    getInfiniteQuery,
    getQueries,
    getQueryData: <TData = unknown>(key: readonly unknown[]) => getQuery<TData>(key)?.getData(),
    setQueryData,
    getInfiniteQueryData: <TData = unknown, TPageParam = unknown>(key: readonly unknown[]) =>
      getInfiniteQuery<TData, Error, TPageParam>(key)?.getData(),
    setInfiniteQueryData,
    setQueriesData: <TData = unknown>(filter: IoQueryFilter, updater: (prev: TData | undefined) => TData): void => {
      for (const query of getQueries(filter)) {
        query.setData((prev: unknown) => updater(prev as TData | undefined));
      }
    },
    getQueryState: <TData = unknown, TError = Error>(key: readonly unknown[]) =>
      getQuery<TData, TError>(key)?.getState(),
    getInfiniteQueryState: <TData = unknown, TError = Error, TPageParam = unknown>(
      key: readonly unknown[],
    ) => getInfiniteQuery<TData, TError, TPageParam>(key)?.getState(),
    invalidateQueries: (filter?: IoQueryFilter, refetch = true): void => {
      for (const query of getQueries(filter)) query.invalidate(refetch);
      for (const query of cache.getAllInfinite(filter)) query.invalidate(refetch);
    },
    refetchQueries: async (filter?: IoQueryFilter): Promise<void> => {
      await Promise.all(getQueries(filter).map((query) => query.fetch(true).then(() => undefined)));
      await Promise.all(cache.getAllInfinite(filter).map((query) => query.refetchAllPages().then(() => undefined)));
    },
    cancelQueries: (filter?: IoQueryFilter): void => {
      for (const query of getQueries(filter)) query.cancel();
      for (const query of cache.getAllInfinite(filter)) query.cancel();
    },
    resetQueries: (filter?: IoQueryFilter): void => {
      for (const query of getQueries(filter)) query.reset();
      for (const query of cache.getAllInfinite(filter)) query.reset();
    },
    removeQueries: (filter?: IoQueryFilter): void => {
      for (const query of getQueries(filter)) cache.removeByHash(query.keyHash, false);
      for (const query of cache.getAllInfinite(filter)) cache.removeByHash(query.keyHash, false);
    },
  };
}
