import { io } from '../core/api/io.js';
import { batch } from '../utils/reactive/batch.js';
import type { IoUnit, IoUpdate } from '../utils/types/types.js';

import { createGcScheduler } from './gc-scheduler.js';
import { createInitialQueryState, deriveQueryFlags } from './query.js';
import { executeWithRetry } from './retry-executor.js';
import type {
  IoQueryDefinition,
  IoQueryDerivedFlags,
  IoQueryState,
  IoUnsubscribe,
} from './types.js';
import {
  createAbortError,
  isAbortError,
  reportBackgroundError,
} from './utils.js';

type QueryUnitBox<TData, TError> = {
  value: IoUnit<IoQueryState<TData, TError>>;
};

export type NormalizedQueryDefinition<TData, TError> =
  IoQueryDefinition<TData, TError> & {
    keyHash: string;
    staleTime: number;
    gcTime: number;
    retry: number;
    retryDelay: (attempt: number) => number;
    canFetch: boolean;
  };

export type QueryRecord<TData, TError> = {
  readonly key: readonly unknown[];
  readonly keyHash: string;
  readonly definition: NormalizedQueryDefinition<TData, TError>;
  readonly observerCount: number;
  readonly isActive: boolean;
  touch: () => void;
  setDefinition: (next: NormalizedQueryDefinition<TData, TError>) => void;
  getState: () => IoQueryState<TData, TError>;
  getFlags: (isFetchedAfterMount?: boolean) => IoQueryDerivedFlags;
  isStale: (state?: IoQueryState<TData, TError>) => boolean;
  getInFlightPromise: () => Promise<TData> | null;
  fetch: (force?: boolean) => Promise<TData>;
  prefetch: () => Promise<void>;
  ensureData: () => Promise<TData>;
  invalidate: (refetch?: boolean) => void;
  cancel: () => void;
  reset: () => void;
  setData: (updater: TData | ((prev: TData | undefined) => TData)) => void;
  hydrate: (state: IoQueryState<TData, TError>) => void;
  addObserver: () => void;
  removeObserver: () => void;
  subscribe: (fn: (state: IoQueryState<TData, TError>) => void) => IoUnsubscribe;
  subscribeUpdate: (fn: (update: IoUpdate) => void) => IoUnsubscribe;
};

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

function createDefinitionConflictError(
  keyHash: string,
  field: string,
  expected: unknown,
  received: unknown,
): Error {
  return new Error(
    `defineQuery: conflicting ${field} for key ${keyHash}. Expected ${String(
      expected,
    )}, received ${String(received)}.`,
  );
}

export function createQueryRecord<TData, TError>(options: {
  definition: NormalizedQueryDefinition<TData, TError>;
  onGarbageCollect: () => void;
}): QueryRecord<TData, TError> {
  const holder = io(
    { value: createInitialQueryState<TData, TError>() },
    { shallow: true },
  ) as unknown as QueryUnitBox<TData, TError>;
  const unit = holder.value;

  let definition = options.definition;
  let observerCount = 0;
  let inFlightPromise: Promise<TData> | null = null;
  let abortController: AbortController | null = null;
  let fetchGeneration = 0;

  const gcScheduler = createGcScheduler({
    getGcTime: () => definition.gcTime,
    hasObservers: () => observerCount > 0,
    hasInFlight: () => inFlightPromise !== null,
    onCollect: options.onGarbageCollect,
  });

  const touch = (): void => {
    gcScheduler.touch();
  };

  const isStale = (state = unit.snapshot()): boolean => {
    if (state.isInvalidated) {
      return true;
    }
    if (state.status !== 'success') {
      return true;
    }
    if (!Number.isFinite(definition.staleTime)) {
      return false;
    }
    return Date.now() - state.dataUpdatedAt >= definition.staleTime;
  };

  const cancel = (): void => {
    if (!inFlightPromise && !abortController) {
      return;
    }

    fetchGeneration += 1;
    abortController?.abort();
    abortController = null;
    inFlightPromise = null;

    const current = unit.snapshot();
    if (current.fetchStatus !== 'idle') {
      patchState(unit, {
        fetchStatus: 'idle',
      });
    }

    gcScheduler.schedule();
  };

  const fetch = (force = false): Promise<TData> => {
    touch();

    if (!definition.canFetch) {
      return Promise.reject(
        new Error(`query.fetch: queryFn is not available for key ${definition.keyHash}`),
      );
    }

    const state = unit.snapshot();
    if (!force && state.status === 'success' && !isStale(state)) {
      return Promise.resolve(state.data as TData);
    }

    if (inFlightPromise) {
      return inFlightPromise;
    }

    fetchGeneration += 1;
    const currentGeneration = fetchGeneration;
    const controller = new AbortController();
    const { signal } = controller;
    abortController = controller;

    const nextStatus =
      state.status === 'success' || state.data !== undefined ? 'success' : 'pending';
    patchState(unit, {
      status: nextStatus,
      fetchStatus: 'fetching',
      error: null,
      failureCount: 0,
      failureReason: null,
    });

    let failureCount = 0;
    const promise = (async () => {
      try {
        const data = await executeWithRetry<TData>({
          run: () => definition.queryFn({ signal }),
          retry: definition.retry,
          retryDelay: definition.retryDelay,
          signal,
          isCancelled: () => currentGeneration !== fetchGeneration,
          onFailedAttempt: (count, error) => {
            failureCount = count;
            patchState(unit, {
              failureCount: count,
              failureReason: error as TError,
            });
          },
        });

        patchState(unit, {
          status: 'success',
          fetchStatus: 'idle',
          data,
          error: null,
          dataUpdatedAt: Date.now(),
          failureCount: 0,
          failureReason: null,
          isInvalidated: false,
          isPlaceholderData: false,
        });

        return data;
      } catch (error) {
        if (
          isAbortError(error) ||
          currentGeneration !== fetchGeneration ||
          signal.aborted
        ) {
          if (currentGeneration === fetchGeneration) {
            const current = unit.snapshot();
            if (current.fetchStatus !== 'idle') {
              patchState(unit, {
                fetchStatus: 'idle',
              });
            }
          }
          throw createAbortError();
        }

        patchState(unit, {
          status: 'error',
          fetchStatus: 'idle',
          error: error as TError,
          errorUpdatedAt: Date.now(),
          failureCount,
          failureReason: error as TError,
        });

        throw error;
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
        if (currentGeneration === fetchGeneration) {
          gcScheduler.schedule();
        }
      })
      .catch(() => undefined);

    return promise;
  };

  const prefetch = (): Promise<void> =>
    fetch(false)
      .then(() => undefined)
      .catch((error: unknown) => {
        reportBackgroundError('query.prefetchQuery()', error);
      });

  const ensureData = (): Promise<TData> => {
    const current = unit.snapshot();
    if (current.status === 'success' && !isStale(current)) {
      return Promise.resolve(current.data as TData);
    }
    return fetch(false);
  };

  const invalidate = (refetch = true): void => {
    patchState(unit, {
      isInvalidated: true,
    });

    if (refetch) {
      void fetch(true).catch((error: unknown) => {
        reportBackgroundError('query.invalidate()', error);
      });
    }
  };

  const setData = (
    updater: TData | ((prev: TData | undefined) => TData),
  ): void => {
    touch();
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
      failureReason: null,
      isInvalidated: false,
      isPlaceholderData: false,
    });
  };

  const reset = (): void => {
    cancel();
    batch(() => {
      unit.set(createInitialQueryState<TData, TError>());
    });
    gcScheduler.schedule();
  };

  const hydrate = (state: IoQueryState<TData, TError>): void => {
    patchState(unit, {
      ...state,
      fetchStatus: 'idle',
      isPlaceholderData: false,
    });
  };

  const setDefinition = (next: NormalizedQueryDefinition<TData, TError>): void => {
    const canUpgradeSeeded = !definition.canFetch && next.canFetch;

    if (definition.queryFn !== next.queryFn && !canUpgradeSeeded) {
      throw createDefinitionConflictError(
        definition.keyHash,
        'queryFn',
        definition.queryFn,
        next.queryFn,
      );
    }

    if (!canUpgradeSeeded) {
      if (definition.staleTime !== next.staleTime) {
        throw createDefinitionConflictError(
          definition.keyHash,
          'staleTime',
          definition.staleTime,
          next.staleTime,
        );
      }
      if (definition.gcTime !== next.gcTime) {
        throw createDefinitionConflictError(
          definition.keyHash,
          'gcTime',
          definition.gcTime,
          next.gcTime,
        );
      }
      if (definition.retry !== next.retry) {
        throw createDefinitionConflictError(
          definition.keyHash,
          'retry',
          definition.retry,
          next.retry,
        );
      }
    }

    definition = canUpgradeSeeded ? next : definition;
    gcScheduler.schedule();
  };

  const addObserver = (): void => {
    observerCount += 1;
    touch();
  };

  const removeObserver = (): void => {
    observerCount = Math.max(0, observerCount - 1);
    gcScheduler.schedule();
  };

  const subscribe = (fn: (state: IoQueryState<TData, TError>) => void): IoUnsubscribe => {
    addObserver();
    const unsub = unit.subscribe(fn);
    let unsubscribed = false;
    return () => {
      if (unsubscribed) {
        return;
      }
      unsubscribed = true;
      unsub();
      removeObserver();
    };
  };

  return {
    get key() {
      return definition.key;
    },
    get keyHash() {
      return definition.keyHash;
    },
    get definition() {
      return definition;
    },
    get observerCount() {
      return observerCount;
    },
    get isActive() {
      return observerCount > 0;
    },
    touch,
    setDefinition,
    getState: () => {
      touch();
      return unit.snapshot();
    },
    getFlags: (isFetchedAfterMount = false) => {
      touch();
      return deriveQueryFlags(unit.snapshot(), {
        isStale: isStale(),
        isFetchedAfterMount,
      });
    },
    isStale,
    getInFlightPromise: () => inFlightPromise,
    fetch,
    prefetch,
    ensureData,
    invalidate,
    cancel,
    reset,
    setData,
    hydrate,
    addObserver,
    removeObserver,
    subscribe,
    subscribeUpdate: (fn) => unit.subscribeUpdate(fn),
  };
}
