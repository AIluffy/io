import { createInfiniteQueryRecord } from './infinite-query-record.js';
import type {
  InfiniteQueryRecord,
  NormalizedInfiniteQueryDefinition,
} from './infinite-query-record.js';
import { createQueryRecord } from './query-record.js';
import type { NormalizedQueryDefinition, QueryRecord } from './query-record.js';
import type {
  IoInfiniteQueryHandle,
  IoInfiniteQueryState,
  IoQueryCacheEvent,
  IoQueryFilter,
  IoQueryHandle,
  IoQueryState,
  IoUnsubscribe,
} from './types.js';
import { hashKey, keyMatches } from './utils.js';

type CacheEntry<TData = unknown, TError = unknown> = {
  record: QueryRecord<TData, TError>;
  handle: IoQueryHandle<TData, TError>;
  updateUnsub: IoUnsubscribe;
};

type AnyEntry = CacheEntry<unknown, unknown>;

type InfiniteCacheEntry<TData = unknown, TError = unknown, TPageParam = unknown> = {
  record: InfiniteQueryRecord<TData, TError, TPageParam>;
  handle: IoInfiniteQueryHandle<TData, TError, TPageParam>;
  updateUnsub: IoUnsubscribe;
};

type AnyInfiniteEntry = InfiniteCacheEntry<unknown, unknown, unknown>;

type QueryCache = {
  define<TData, TError>(
    definition: NormalizedQueryDefinition<TData, TError>,
  ): IoQueryHandle<TData, TError>;
  defineInfinite<TData, TError, TPageParam>(
    definition: NormalizedInfiniteQueryDefinition<TData, TError, TPageParam>,
  ): IoInfiniteQueryHandle<TData, TError, TPageParam>;
  getHandle<TData, TError>(
    key: readonly unknown[],
  ): IoQueryHandle<TData, TError> | undefined;
  getRecord<TData, TError>(key: readonly unknown[]): QueryRecord<TData, TError> | undefined;
  getInfiniteHandle<TData, TError, TPageParam>(
    key: readonly unknown[],
  ): IoInfiniteQueryHandle<TData, TError, TPageParam> | undefined;
  getInfiniteRecord<TData, TError, TPageParam>(
    key: readonly unknown[],
  ): InfiniteQueryRecord<TData, TError, TPageParam> | undefined;
  getAll(filter?: IoQueryFilter): IoQueryHandle<unknown, unknown>[];
  getAllInfinite(filter?: IoQueryFilter): IoInfiniteQueryHandle<unknown, unknown, unknown>[];
  removeByHash(keyHash: string, reset: boolean): void;
  clear(reset: boolean): void;
  subscribe(fn: (event: IoQueryCacheEvent) => void): IoUnsubscribe;
  seed<TData, TError>(
    definition: NormalizedQueryDefinition<TData, TError>,
    state: IoQueryState<TData, TError>,
  ): IoQueryHandle<TData, TError>;
  seedInfinite<TData, TError, TPageParam>(
    definition: NormalizedInfiniteQueryDefinition<TData, TError, TPageParam>,
    state: IoInfiniteQueryState<TData, TError, TPageParam>,
  ): IoInfiniteQueryHandle<TData, TError, TPageParam>;
};

function matchesFilter(
  query: IoQueryHandle<unknown, unknown>,
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

  if (filter.active !== undefined && query.isActive !== filter.active) {
    return false;
  }

  const state = query.getState();
  if (filter.fetching !== undefined) {
    const isFetching = state.fetchStatus === 'fetching';
    if (isFetching !== filter.fetching) {
      return false;
    }
  }

  if (filter.stale !== undefined) {
    const stale = query.getFlags().isStale;
    if (stale !== filter.stale) {
      return false;
    }
  }

  if (filter.predicate && !filter.predicate(query)) {
    return false;
  }

  return true;
}

function createHandle<TData, TError>(
  record: QueryRecord<TData, TError>,
): IoQueryHandle<TData, TError> {
  return {
    get key() {
      return record.key;
    },
    get keyHash() {
      return record.keyHash;
    },
    fetch: (force = false) => record.fetch(force),
    prefetch: () => record.prefetch(),
    ensureData: () => record.ensureData(),
    invalidate: (refetch = true) => {
      record.invalidate(refetch);
    },
    cancel: () => {
      record.cancel();
    },
    reset: () => {
      record.reset();
    },
    setData: (updater) => {
      record.setData(updater);
    },
    getData: () => record.getState().data,
    getState: () => record.getState(),
    getFlags: () => record.getFlags(false),
    get isActive() {
      return record.isActive;
    },
    get observerCount() {
      return record.observerCount;
    },
    subscribe: (fn) => record.subscribe(fn),
    subscribeUpdate: (fn) => record.subscribeUpdate(fn),
  };
}

function createInfiniteHandle<TData, TError, TPageParam>(
  record: InfiniteQueryRecord<TData, TError, TPageParam>,
): IoInfiniteQueryHandle<TData, TError, TPageParam> {
  return {
    get key() {
      return record.key;
    },
    get keyHash() {
      return record.keyHash;
    },
    fetchNextPage: (signal?: AbortSignal) => record.fetchNextPage(signal),
    fetchPreviousPage: (signal?: AbortSignal) => record.fetchPreviousPage(signal),
    refetchAllPages: (signal?: AbortSignal) => record.refetchAllPages(signal),
    prefetch: () => record.prefetch(),
    ensureData: () => record.ensureData(),
    invalidate: (refetch = true) => {
      record.invalidate(refetch);
    },
    cancel: () => {
      record.cancel();
    },
    reset: () => {
      record.reset();
    },
    setData: (updater) => {
      record.setData(updater);
    },
    getData: () => record.getState().data,
    getState: () => record.getState(),
    getFlags: () => record.getFlags(false),
    get isActive() {
      return record.isActive;
    },
    get observerCount() {
      return record.observerCount;
    },
    subscribe: (fn) => record.subscribe(fn),
    subscribeUpdate: (fn) => record.subscribeUpdate(fn),
  };
}

export function createQueryCache(): QueryCache {
  const entries = new Map<string, AnyEntry>();
  const infiniteEntries = new Map<string, AnyInfiniteEntry>();
  const listeners = new Set<(event: IoQueryCacheEvent) => void>();

  const notify = (event: IoQueryCacheEvent): void => {
    for (const listener of listeners) {
      listener(event);
    }
  };

  const removeByHash = (keyHash: string, reset: boolean): void => {
    const entry = entries.get(keyHash);
    if (entry) {
      entry.record.cancel();
      if (reset) {
        entry.record.reset();
      }

      entry.updateUnsub();
      entries.delete(keyHash);
      notify({
        type: 'query-removed',
        query: entry.handle,
      });
    }

    const infiniteEntry = infiniteEntries.get(keyHash);
    if (!infiniteEntry) {
      return;
    }

    infiniteEntry.record.cancel();
    if (reset) {
      infiniteEntry.record.reset();
    }

    infiniteEntry.updateUnsub();
    infiniteEntries.delete(keyHash);
  };

  const define = <TData, TError>(
    definition: NormalizedQueryDefinition<TData, TError>,
  ): IoQueryHandle<TData, TError> => {
    if (infiniteEntries.has(definition.keyHash)) {
      throw new Error(
        `defineQuery: key "${definition.keyHash}" is already registered as an infinite query. ` +
          'A key cannot be used for both regular and infinite queries.',
      );
    }

    const existing = entries.get(definition.keyHash) as CacheEntry<
      TData,
      TError
    > | null;

    if (existing) {
      existing.record.setDefinition(definition);
      existing.record.touch();
      return existing.handle;
    }

    const record = createQueryRecord<TData, TError>({
      definition,
      onGarbageCollect: () => {
        removeByHash(definition.keyHash, false);
      },
    });

    const handle = createHandle(record);
    const updateUnsub = record.subscribeUpdate(() => {
      notify({
        type: 'query-updated',
        query: handle as IoQueryHandle<unknown, unknown>,
      });
    });

    entries.set(definition.keyHash, {
      record: record as QueryRecord<unknown, unknown>,
      handle: handle as IoQueryHandle<unknown, unknown>,
      updateUnsub,
    });

    notify({
      type: 'query-added',
      query: handle as IoQueryHandle<unknown, unknown>,
    });

    return handle;
  };

  const defineInfinite = <TData, TError, TPageParam>(
    definition: NormalizedInfiniteQueryDefinition<TData, TError, TPageParam>,
  ): IoInfiniteQueryHandle<TData, TError, TPageParam> => {
    if (entries.has(definition.keyHash)) {
      throw new Error(
        `defineInfiniteQuery: key "${definition.keyHash}" is already registered as a regular query. ` +
          'A key cannot be used for both regular and infinite queries.',
      );
    }

    const existing = infiniteEntries.get(definition.keyHash) as InfiniteCacheEntry<
      TData,
      TError,
      TPageParam
    > | null;

    if (existing) {
      existing.record.setDefinition(definition);
      existing.record.touch();
      return existing.handle;
    }

    const record = createInfiniteQueryRecord<TData, TError, TPageParam>({
      definition,
      onGarbageCollect: () => {
        const entry = infiniteEntries.get(definition.keyHash);
        if (!entry) {
          return;
        }
        entry.record.cancel();
        entry.updateUnsub();
        infiniteEntries.delete(definition.keyHash);
      },
    });

    const handle = createInfiniteHandle(record);
    const updateUnsub = record.subscribeUpdate(() => {
      notify({
        type: 'query-updated',
        query: handle as unknown as IoQueryHandle<unknown, unknown>,
      });
    });

    infiniteEntries.set(definition.keyHash, {
      record: record as InfiniteQueryRecord<unknown, unknown, unknown>,
      handle: handle as IoInfiniteQueryHandle<unknown, unknown, unknown>,
      updateUnsub,
    });

    return handle;
  };

  const seed = <TData, TError>(
    definition: NormalizedQueryDefinition<TData, TError>,
    state: IoQueryState<TData, TError>,
  ): IoQueryHandle<TData, TError> => {
    const handle = define(definition);
    const entry = entries.get(definition.keyHash) as CacheEntry<TData, TError>;
    entry.record.hydrate(state);
    return handle;
  };

  const getRecord = <TData, TError>(
    key: readonly unknown[],
  ): QueryRecord<TData, TError> | undefined => {
    const entry = entries.get(hashKey(key)) as CacheEntry<TData, TError> | undefined;
    return entry?.record;
  };

  const getHandle = <TData, TError>(
    key: readonly unknown[],
  ): IoQueryHandle<TData, TError> | undefined => {
    const entry = entries.get(hashKey(key)) as CacheEntry<TData, TError> | undefined;
    return entry?.handle;
  };

  const getInfiniteRecord = <TData, TError, TPageParam>(
    key: readonly unknown[],
  ): InfiniteQueryRecord<TData, TError, TPageParam> | undefined => {
    const entry = infiniteEntries.get(hashKey(key)) as
      | InfiniteCacheEntry<TData, TError, TPageParam>
      | undefined;
    return entry?.record;
  };

  const getInfiniteHandle = <TData, TError, TPageParam>(
    key: readonly unknown[],
  ): IoInfiniteQueryHandle<TData, TError, TPageParam> | undefined => {
    const entry = infiniteEntries.get(hashKey(key)) as
      | InfiniteCacheEntry<TData, TError, TPageParam>
      | undefined;
    return entry?.handle;
  };

  const getAll = (filter?: IoQueryFilter): IoQueryHandle<unknown, unknown>[] => {
    const filterKeyHash =
      filter?.key && (filter.exact ?? false) ? hashKey(filter.key) : undefined;

    const handles = Array.from(entries.values()).map((entry) => entry.handle);
    return handles.filter((handle) => matchesFilter(handle, filter, filterKeyHash));
  };

  const clear = (reset: boolean): void => {
    for (const keyHash of Array.from(entries.keys())) {
      removeByHash(keyHash, reset);
    }
    for (const keyHash of Array.from(infiniteEntries.keys())) {
      const entry = infiniteEntries.get(keyHash);
      if (!entry) {
        continue;
      }

      entry.record.cancel();
      if (reset) {
        entry.record.reset();
      }

      entry.updateUnsub();
      infiniteEntries.delete(keyHash);
    }
  };

  const getAllInfinite = (
    filter?: IoQueryFilter,
  ): IoInfiniteQueryHandle<unknown, unknown, unknown>[] => {
    const filterKeyHash =
      filter?.key && (filter.exact ?? false) ? hashKey(filter.key) : undefined;

    const handles = Array.from(infiniteEntries.values()).map((entry) => entry.handle);
    return handles.filter((handle) => {
      if (!filter) {
        return true;
      }

      if (filter.key) {
        if (filter.exact ?? false) {
          if (handle.keyHash !== (filterKeyHash ?? hashKey(filter.key))) {
            return false;
          }
        } else if (!keyMatches(handle.key, filter.key, false, handle.keyHash)) {
          return false;
        }
      }

      if (filter.active !== undefined && handle.isActive !== filter.active) {
        return false;
      }

      const state = handle.getState();
      if (filter.fetching !== undefined) {
        const isFetching = state.fetchStatus === 'fetching';
        if (isFetching !== filter.fetching) {
          return false;
        }
      }

      if (filter.stale !== undefined) {
        const stale = handle.getFlags().isStale;
        if (stale !== filter.stale) {
          return false;
        }
      }

      if (
        filter.predicate &&
        !filter.predicate(handle as unknown as IoQueryHandle<unknown, unknown>)
      ) {
        return false;
      }

      return true;
    });
  };

  const seedInfinite = <TData, TError, TPageParam>(
    definition: NormalizedInfiniteQueryDefinition<TData, TError, TPageParam>,
    state: IoInfiniteQueryState<TData, TError, TPageParam>,
  ): IoInfiniteQueryHandle<TData, TError, TPageParam> => {
    const handle = defineInfinite(definition);
    const entry = infiniteEntries.get(definition.keyHash) as InfiniteCacheEntry<
      TData,
      TError,
      TPageParam
    >;
    entry.record.hydrate(state);
    return handle;
  };

  const subscribe = (fn: (event: IoQueryCacheEvent) => void): IoUnsubscribe => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  };

  return {
    define,
    defineInfinite,
    getHandle,
    getRecord,
    getInfiniteHandle,
    getInfiniteRecord,
    getAll,
    getAllInfinite,
    removeByHash,
    clear,
    subscribe,
    seed,
    seedInfinite,
  };
}

export type { QueryCache };
