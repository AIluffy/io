import { io } from '../core/api/io.js';
import { batch } from '../utils/reactive/batch.js';
import type { IoUnit } from '../utils/types/types.js';

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
  createAbortError,
  defaultRetryDelay,
  hashKey,
  isAbortError,
  reportBackgroundError,
  shouldRetry,
  sleep,
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
  const holder = io(
    { value: initialState },
    { shallow: true },
  ) as unknown as QueryUnitBox<TData, TError>;
  const unit = holder.value;

  let resolvedOptions = normalizeOptions(internalOptions);
  let inFlightPromise: Promise<TData> | null = null;
  let abortController: AbortController | null = null;
  let gcTimer: ReturnType<typeof setTimeout> | null = null;
  let observerCount = 0;
  let invalidated = false;
  let runId = 0;

  const clearGcTimer = (): void => {
    if (!gcTimer) {
      return;
    }
    clearTimeout(gcTimer);
    gcTimer = null;
  };

  const touch = (): void => {
    clearGcTimer();
  };

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

  const query: QueryWithInternal<TData, TError> = {
    get: () => {
      touch();
      return unit.get();
    },
    set: (next) => {
      touch();
      unit.set(next);
    },
    snapshot: () => {
      touch();
      return unit.snapshot();
    },
    subscribe: (fn) => {
      touch();
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
        scheduleGc();
      };
    },
    subscribeUpdate: (fn) => {
      touch();
      return unit.subscribeUpdate(fn);
    },
    reset: () => {
      invalidated = false;
      cancelInFlight();
      batch(() => {
        unit.reset();
      });
      scheduleGc();
    },
    key: options.key,
    keyHash,
    fetch: () => executeFetch(false),
    prefetch: () =>
      executeFetch(false)
        .then(() => undefined)
        .catch((error: unknown) => {
          reportBackgroundError('query.prefetch()', error);
        }),
    read: () => {
      touch();
      const state = unit.get();
      if (state.status === 'error' && state.error !== null) {
        throw state.error;
      }
      if (state.status === 'pending') {
        const pending = inFlightPromise ?? executeFetch(false);
        throw pending;
      }
      return state.data as TData;
    },
    invalidate: (refetch = true) => {
      invalidated = true;
      batch(() => {
        const current = unit.snapshot();
        unit.set({
          ...current,
          dataUpdatedAt: 0,
        });
      });
      if (refetch && resolvedOptions.canFetch) {
        void executeFetch(true).catch((error: unknown) => {
          reportBackgroundError('query.invalidate()', error);
        });
      }
    },
    cancel: () => {
      cancelInFlight();
    },
    setData: (updater) => {
      invalidated = false;
      touch();
      batch(() => {
        const current = unit.snapshot();
        const nextData =
          typeof updater === 'function'
            ? (updater as (prev: TData | undefined) => TData)(current.data)
            : updater;
        unit.set({
          ...current,
          status: 'success',
          data: nextData,
          error: null,
          dataUpdatedAt: Date.now(),
          failureCount: 0,
        });
      });
    },
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

  const scheduleGc = (): void => {
    clearGcTimer();
    if (observerCount > 0 || inFlightPromise) {
      return;
    }
    if (!Number.isFinite(resolvedOptions.gcTime) || resolvedOptions.gcTime < 0) {
      return;
    }

    gcTimer = setTimeout(() => {
      gcTimer = null;
      if (observerCount > 0 || inFlightPromise) {
        return;
      }
      resolvedOptions.onGarbageCollect?.(query);
    }, resolvedOptions.gcTime);

    if (gcTimer && typeof (gcTimer as { unref?: () => void }).unref === 'function') {
      (gcTimer as { unref: () => void }).unref();
    }
  };

  const cancelInFlight = (): void => {
    if (!inFlightPromise && !abortController) {
      return;
    }

    runId += 1;
    abortController?.abort();
    abortController = null;
    inFlightPromise = null;

    batch(() => {
      const current = unit.snapshot();
      if (current.fetchStatus === 'idle') {
        return;
      }
      unit.set({
        ...current,
        fetchStatus: 'idle',
      });
    });

    scheduleGc();
  };

  const executeFetch = (force = false): Promise<TData> => {
    touch();

    if (!resolvedOptions.canFetch) {
      return Promise.reject(
        new Error(`query.fetch: queryFn is not available for key ${keyHash}`),
      );
    }

    const state = unit.snapshot();
    if (!force && state.status === 'success' && !isStale(state)) {
      return Promise.resolve(state.data as TData);
    }

    if (inFlightPromise) {
      return inFlightPromise;
    }

    runId += 1;
    const currentRunId = runId;
    abortController = new AbortController();
    const { signal } = abortController;

    batch(() => {
      const current = unit.snapshot();
      const nextStatus =
        current.status === 'success'
          ? 'success'
          : current.data === undefined
            ? 'pending'
            : 'success';
      unit.set({
        ...current,
        status: nextStatus,
        fetchStatus: 'fetching',
        error: null,
        failureCount: 0,
      });
    });

    const promise = (async () => {
      let failureCount = 0;

      while (true) {
        try {
          if (signal.aborted || currentRunId !== runId) {
            throw createAbortError();
          }

          const data = await resolvedOptions.queryFn({ signal });

          if (signal.aborted || currentRunId !== runId) {
            throw createAbortError();
          }

          invalidated = false;
          batch(() => {
            const current = unit.snapshot();
            unit.set({
              ...current,
              status: 'success',
              fetchStatus: 'idle',
              data,
              error: null,
              dataUpdatedAt: Date.now(),
              failureCount: 0,
            });
          });

          resolvedOptions.onSuccess?.(data);
          resolvedOptions.onSettled?.(data, null);
          return data;
        } catch (error) {
          if (isAbortError(error) || signal.aborted || currentRunId !== runId) {
            batch(() => {
              if (currentRunId !== runId) {
                return;
              }
              const current = unit.snapshot();
              if (current.fetchStatus === 'idle') {
                return;
              }
              unit.set({
                ...current,
                fetchStatus: 'idle',
              });
            });
            throw createAbortError();
          }

          failureCount += 1;
          if (!shouldRetry(failureCount, resolvedOptions.retry, error)) {
            batch(() => {
              const current = unit.snapshot();
              unit.set({
                ...current,
                status: 'error',
                fetchStatus: 'idle',
                error: error as TError,
                errorUpdatedAt: Date.now(),
                failureCount,
              });
            });

            resolvedOptions.onError?.(error as TError);
            resolvedOptions.onSettled?.(undefined, error as TError);
            throw error;
          }

          await sleep(resolvedOptions.retryDelay(failureCount - 1), signal);
        }
      }
    })();

    inFlightPromise = promise;
    void promise
      .finally(() => {
        if (inFlightPromise === promise) {
          inFlightPromise = null;
        }
        if (abortController?.signal === signal) {
          abortController = null;
        }
        if (currentRunId === runId) {
          scheduleGc();
        }
      })
      .catch(() => undefined);

    return promise;
  };

  const internalApi: QueryInternalApi<TData, TError> = {
    updateOptions: (next) => {
      if (hashKey(next.key) !== keyHash) {
        throw new Error('createQuery: key mismatch while updating options');
      }
      resolvedOptions = normalizeOptions(next);
      if (
        resolvedOptions.canFetch &&
        resolvedOptions.autoFetch &&
        unit.snapshot().status === 'pending' &&
        unit.snapshot().fetchStatus === 'idle'
      ) {
        void executeFetch(false).catch((error: unknown) => {
          reportBackgroundError('query.updateOptions(autoFetch)', error);
        });
      }
      scheduleGc();
    },
    touch,
  };

  Object.defineProperty(query, QUERY_INTERNAL, {
    value: internalApi,
  });

  if (resolvedOptions.autoFetch && resolvedOptions.canFetch) {
    void executeFetch(false).catch((error: unknown) => {
      reportBackgroundError('query.create(autoFetch)', error);
    });
  } else {
    scheduleGc();
  }

  return query;
}
