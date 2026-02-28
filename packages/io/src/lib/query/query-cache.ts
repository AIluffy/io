import { createQueryRecord } from './query-record.js';
import type { NormalizedQueryDefinition, QueryRecord } from './query-record.js';
import type {
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

type QueryCache = {
  define<TData, TError>(
    definition: NormalizedQueryDefinition<TData, TError>,
  ): IoQueryHandle<TData, TError>;
  getHandle<TData, TError>(
    key: readonly unknown[],
  ): IoQueryHandle<TData, TError> | undefined;
  getRecord<TData, TError>(key: readonly unknown[]): QueryRecord<TData, TError> | undefined;
  getAll(filter?: IoQueryFilter): IoQueryHandle<unknown, unknown>[];
  removeByHash(keyHash: string, reset: boolean): void;
  clear(reset: boolean): void;
  subscribe(fn: (event: IoQueryCacheEvent) => void): IoUnsubscribe;
  seed<TData, TError>(
    definition: NormalizedQueryDefinition<TData, TError>,
    state: IoQueryState<TData, TError>,
  ): IoQueryHandle<TData, TError>;
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

export function createQueryCache(): QueryCache {
  const entries = new Map<string, AnyEntry>();
  const listeners = new Set<(event: IoQueryCacheEvent) => void>();

  const notify = (event: IoQueryCacheEvent): void => {
    for (const listener of listeners) {
      listener(event);
    }
  };

  const removeByHash = (keyHash: string, reset: boolean): void => {
    const entry = entries.get(keyHash);
    if (!entry) {
      return;
    }

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
  };

  const define = <TData, TError>(
    definition: NormalizedQueryDefinition<TData, TError>,
  ): IoQueryHandle<TData, TError> => {
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
  };

  const subscribe = (fn: (event: IoQueryCacheEvent) => void): IoUnsubscribe => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  };

  return {
    define,
    getHandle,
    getRecord,
    getAll,
    removeByHash,
    clear,
    subscribe,
    seed,
  };
}

export type { QueryCache };
