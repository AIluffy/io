import { io } from '../core/api/io.js';
import { batch } from '../utils/reactive/batch.js';
import type { IoUnit } from '../utils/types/types.js';

import { createFetchController } from './fetch-controller.js';
import { createGcScheduler } from './gc-scheduler.js';
import type {
  IoQuery,
  IoQueryDerivedFlags,
  IoQueryOptions,
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

const QUERY_INTERNAL = Symbol.for('@iostore/store/query/internal');

type QueryUnitBox<TData, TError> = {
  value: IoUnit<IoQueryState<TData, TError>>;
};

type InternalQueryOptions<TData, TError> = IoQueryOptions<TData, TError> & {
  onGarbageCollect?: (query: IoQuery<TData, TError>) => void;
  canFetch?: boolean;
};

type NormalizedQueryOptions<TData, TError> = {
  key: IoQueryOptions<TData, TError>['key'];
  queryFn: IoQueryOptions<TData, TError>['queryFn'];
  staleTime: number;
  gcTime: number;
  retry: number;
  retryDelay: (attempt: number) => number;
  autoFetch: boolean;
  canFetch: boolean;
  onGarbageCollect?: (query: IoQuery<TData, TError>) => void;
  onSuccess?: (data: TData) => void;
  onError?: (error: TError) => void;
  onSettled?: (data: TData | undefined, error: TError | null) => void;
};

type QueryInternalApi<TData, TError> = {
  updateOptions: (next: InternalQueryOptions<TData, TError>) => void;
  touch: () => void;
};

type QueryWithInternal<TData, TError> = IoQuery<TData, TError> & {
  [QUERY_INTERNAL]?: QueryInternalApi<TData, TError>;
};

function resolvePlaceholderData<TData>(
  value: TData | (() => TData) | undefined,
): TData | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'function') {
    return (value as () => TData)();
  }
  return value;
}

function createInitialState<TData, TError>(
  options: IoQueryOptions<TData, TError>,
): IoQueryState<TData, TError> {
  return {
    status: 'pending',
    fetchStatus: 'idle',
    data: resolvePlaceholderData(options.placeholderData),
    error: null,
    dataUpdatedAt: 0,
    errorUpdatedAt: 0,
    failureCount: 0,
  };
}

function normalizeOptions<TData, TError>(
  options: InternalQueryOptions<TData, TError>,
): NormalizedQueryOptions<TData, TError> {
  return {
    key: options.key,
    queryFn: options.queryFn,
    staleTime: options.staleTime ?? DEFAULT_STALE_TIME,
    gcTime: options.gcTime ?? DEFAULT_GC_TIME,
    retry: options.retry ?? DEFAULT_RETRY_ATTEMPTS,
    retryDelay: options.retryDelay ?? defaultRetryDelay,
    autoFetch: options.autoFetch ?? false,
    canFetch: options.canFetch ?? true,
    onGarbageCollect: options.onGarbageCollect,
    onSuccess: options.onSuccess,
    onError: options.onError,
    onSettled: options.onSettled,
  };
}

function patchState<TData, TError>(
  unit: IoUnit<IoQueryState<TData, TError>>,
  patch: Partial<IoQueryState<TData, TError>>,
): void {
  batch(() => {
    unit.set({
      ...unit.snapshot(),
      ...patch,
    });
  });
}

export function deriveQueryFlags<TData, TError>(
  state: IoQueryState<TData, TError>,
): IoQueryDerivedFlags {
  const isPending = state.status === 'pending';
  const isSuccess = state.status === 'success';
  const isError = state.status === 'error';
  const isFetching = state.fetchStatus === 'fetching';

  return {
    isPending,
    isSuccess,
    isError,
    isFetching,
    isLoading: isPending && isFetching,
    isRefetching: isSuccess && isFetching,
  };
}

export function getQueryInternal<TData, TError>(
  query: IoQuery<TData, TError>,
): QueryInternalApi<TData, TError> | undefined {
  return (query as QueryWithInternal<TData, TError>)[QUERY_INTERNAL];
}

export function createQuery<TData = unknown, TError = Error>(
  options: IoQueryOptions<TData, TError>,
): IoQuery<TData, TError> {
  const internalOptions = options as InternalQueryOptions<TData, TError>;
  const keyHash = hashKey(options.key);
  const initialState = createInitialState(options);
  const stateContainer = io(
    { value: initialState },
    { shallow: true },
  ) as unknown as QueryUnitBox<TData, TError>;
  const unit = stateContainer.value;

  let resolvedOptions = normalizeOptions(internalOptions);
  let observerCount = 0;
  let invalidated = false;
  const queryRef: { current?: QueryWithInternal<TData, TError> } = {};
  let hasInFlight = (): boolean => false;

  const gcScheduler = createGcScheduler({
    getGcTime: () => resolvedOptions.gcTime,
    hasObservers: () => observerCount > 0,
    hasInFlight: () => hasInFlight(),
    onCollect: () => {
      if (queryRef.current) {
        resolvedOptions.onGarbageCollect?.(queryRef.current);
      }
    },
  });

  const isStale = (state: IoQueryState<TData, TError>): boolean => {
    if (invalidated) {
      return true;
    }
    if (state.status !== 'success') {
      return true;
    }
    if (!Number.isFinite(resolvedOptions.staleTime)) {
      return false;
    }
    return Date.now() - state.dataUpdatedAt >= resolvedOptions.staleTime;
  };

  const fetchController = createFetchController<TData, TError>({
    keyHash,
    unit,
    touch: gcScheduler.touch,
    scheduleGc: gcScheduler.schedule,
    clearInvalidated: () => {
      invalidated = false;
    },
    isStale,
    getOptions: () => resolvedOptions,
  });
  hasInFlight = fetchController.hasInFlight;

  const runFetchQuietly = (scope: string, force = false): void => {
    void fetchController.execute(force).catch((error: unknown) => {
      reportBackgroundError(scope, error);
    });
  };

  const query: QueryWithInternal<TData, TError> = {
    get: () => {
      gcScheduler.touch();
      return unit.get();
    },
    set: (next) => {
      gcScheduler.touch();
      unit.set(next);
    },
    snapshot: () => {
      gcScheduler.touch();
      return unit.snapshot();
    },
    subscribe: (fn) => {
      gcScheduler.touch();
      observerCount += 1;
      const unsub = unit.subscribe(fn);
      let unsubscribed = false;
      return () => {
        if (unsubscribed) {
          return;
        }
        unsubscribed = true;
        unsub();
        observerCount = Math.max(0, observerCount - 1);
        gcScheduler.schedule();
      };
    },
    subscribeUpdate: (fn) => {
      gcScheduler.touch();
      return unit.subscribeUpdate(fn);
    },
    reset: () => {
      invalidated = false;
      fetchController.cancel();
      batch(() => {
        unit.reset();
      });
      gcScheduler.schedule();
    },
    key: options.key,
    keyHash,
    fetch: () => fetchController.execute(false),
    fetchQuietly: () => {
      runFetchQuietly('query.fetchQuietly()', false);
    },
    refetch: () => fetchController.execute(true),
    prefetch: () =>
      fetchController.execute(false)
        .then(() => undefined)
        .catch((error: unknown) => {
          reportBackgroundError('query.prefetch()', error);
        }),
    read: () => {
      gcScheduler.touch();
      const state = unit.get();
      if (state.status === 'error' && state.error !== null) {
        throw state.error;
      }
      if (state.status === 'pending') {
        const pending =
          fetchController.getInFlightPromise() ?? fetchController.execute(false);
        throw pending;
      }
      return state.data as TData;
    },
    invalidate: (refetch = true) => {
      invalidated = true;
      patchState(unit, {
        dataUpdatedAt: 0,
      });

      if (refetch && resolvedOptions.canFetch) {
        runFetchQuietly('query.invalidate()', true);
      }
    },
    cancel: () => {
      fetchController.cancel();
    },
    setData: (updater) => {
      invalidated = false;
      gcScheduler.touch();
      const current = unit.snapshot();
      const nextData =
        typeof updater === 'function'
          ? (updater as (prev: TData | undefined) => TData)(current.data)
          : updater;

      patchState(unit, {
        status: 'success',
        data: nextData,
        error: null,
        dataUpdatedAt: Date.now(),
        failureCount: 0,
      });
    },
    getData: () => unit.snapshot().data,
    get isActive() {
      return observerCount > 0;
    },
    get observerCount() {
      return observerCount;
    },
    get flags() {
      return deriveQueryFlags(unit.get());
    },
  };
  queryRef.current = query;

  const internalApi: QueryInternalApi<TData, TError> = {
    updateOptions: (next) => {
      const nextKeyHash = hashKey(next.key);
      if (nextKeyHash !== keyHash) {
        throw new Error(
          `createQuery: key mismatch while updating options. Expected "${keyHash}", got "${nextKeyHash}".`,
        );
      }

      resolvedOptions = normalizeOptions(next);
      if (
        resolvedOptions.canFetch &&
        resolvedOptions.autoFetch &&
        unit.snapshot().status === 'pending' &&
        unit.snapshot().fetchStatus === 'idle'
      ) {
        runFetchQuietly('query.updateOptions(autoFetch)', false);
      }
      gcScheduler.schedule();
    },
    touch: gcScheduler.touch,
  };

  Object.defineProperty(query, QUERY_INTERNAL, {
    value: internalApi,
  });

  if (resolvedOptions.autoFetch && resolvedOptions.canFetch) {
    runFetchQuietly('query.create(autoFetch)', false);
  } else {
    gcScheduler.schedule();
  }

  return query;
}
