import { io } from '../core/api/io.js';
import type { IoUnit, IoUpdate, IoUpdateAnnotation } from '../utils/types/types.js';

import { createInitialQueryState, deriveQueryFlags } from './query.js';
import {
  createObserverManager,
  createRecordGcController,
  createRecordStaleChecker,
  patchRecordState,
  readRecordState,
  resetRecordState,
  updateRecordDefinition,
} from './record-shared.js';
import { executeWithRetry } from './retry-executor.js';
import type {
  IoQueryDefinition,
  IoQueryDerivedFlags,
  IoQueryState,
  IoUnsubscribe,
  KeyHash,
} from './types.js';
import { createAbortError, isAbortError, reportBackgroundError } from './utils.js';

type QueryUnitBox<TData, TError> = {
  value: IoUnit<IoQueryState<TData, TError>>;
};

export type NormalizedQueryDefinition<TData, TError> =
  IoQueryDefinition<TData, TError> & {
    keyHash: KeyHash;
    staleTime: number;
    gcTime: number;
    retry: number;
    retryDelay: (attempt: number) => number;
    canFetch: boolean;
  };

export type QueryRecord<TData, TError> = {
  readonly key: readonly unknown[];
  readonly keyHash: KeyHash;
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
  let inFlightPromise: Promise<TData> | null = null;
  let abortController: AbortController | null = null;
  let fetchGeneration = 0;

  const gcController = createRecordGcController({
    getGcTime: () => definition.gcTime,
    hasObservers: () => observers.getObserverCount() > 0,
    hasInFlight: () => inFlightPromise !== null,
    onCollect: options.onGarbageCollect,
  });

  const observers = createObserverManager({
    unit,
    onObserverAdded: () => gcController.touch(),
    onObserverRemoved: () => gcController.schedule(),
  });

  const patchState = (
    patch: Partial<IoQueryState<TData, TError>>,
    annotation?: IoUpdateAnnotation,
  ): void => {
    patchRecordState(unit, patch, annotation);
  };

  const isStale = createRecordStaleChecker({
    getDefinition: () => definition,
    getState: () => readRecordState(unit),
  });

  const cancel = (): void => {
    if (!inFlightPromise && !abortController) {
      return;
    }

    fetchGeneration += 1;
    abortController?.abort();
    abortController = null;
    inFlightPromise = null;

    const current = readRecordState(unit);
    if (current.fetchStatus !== 'idle') {
      patchState(
        { fetchStatus: 'idle' },
        { action: 'query.fetch.cancel', meta: { keyHash: definition.keyHash } },
      );
    }

    gcController.schedule();
  };

  const fetch = (force = false): Promise<TData> => {
    gcController.touch();

    if (!definition.canFetch) {
      return Promise.reject(
        new Error(`query.fetch: queryFn is not available for key ${definition.keyHash}`),
      );
    }

    const state = readRecordState(unit);
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

    patchState(
      {
        status: state.status === 'success' || state.data !== undefined ? 'success' : 'pending',
        fetchStatus: 'fetching',
        error: null,
        failureCount: 0,
        failureReason: null,
      },
      { action: 'query.fetch.start', meta: { force, keyHash: definition.keyHash } },
    );

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
            patchState(
              { failureCount: count, failureReason: error as TError },
              {
                action: 'query.fetch.retry',
                meta: { failureCount: count, keyHash: definition.keyHash },
              },
            );
          },
        });

        patchState(
          {
            status: 'success',
            fetchStatus: 'idle',
            data,
            error: null,
            dataUpdatedAt: Date.now(),
            failureCount: 0,
            failureReason: null,
            isInvalidated: false,
            isPlaceholderData: false,
          },
          { action: 'query.fetch.success', meta: { keyHash: definition.keyHash } },
        );

        return data;
      } catch (error) {
        if (isAbortError(error) || currentGeneration !== fetchGeneration || signal.aborted) {
          if (currentGeneration === fetchGeneration && readRecordState(unit).fetchStatus !== 'idle') {
            patchState(
              { fetchStatus: 'idle' },
              { action: 'query.fetch.abort', meta: { keyHash: definition.keyHash } },
            );
          }
          throw createAbortError();
        }

        patchState(
          {
            status: 'error',
            fetchStatus: 'idle',
            error: error as TError,
            errorUpdatedAt: Date.now(),
            failureCount,
            failureReason: error as TError,
          },
          { action: 'query.fetch.error', meta: { keyHash: definition.keyHash } },
        );
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
          gcController.schedule();
        }
      })
      .catch(() => undefined);

    return promise;
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
      return observers.getObserverCount();
    },
    get isActive() {
      return observers.getObserverCount() > 0;
    },
    touch: () => gcController.touch(),
    setDefinition: (next) => {
      definition = updateRecordDefinition('defineQuery', definition, next);
      gcController.schedule();
    },
    getState: () => {
      gcController.touch();
      return unit.snapshot();
    },
    getFlags: (isFetchedAfterMount = false) => {
      gcController.touch();
      return deriveQueryFlags(unit.snapshot(), {
        isStale: isStale(),
        isFetchedAfterMount,
      });
    },
    isStale,
    getInFlightPromise: () => inFlightPromise,
    fetch,
    prefetch: () =>
      fetch(false)
        .then(() => undefined)
        .catch((error: unknown) => {
          reportBackgroundError('query.prefetchQuery()', error, unit);
        }),
    ensureData: () => {
      const current = readRecordState(unit);
      if (current.status === 'success' && !isStale(current)) {
        return Promise.resolve(current.data as TData);
      }
      return fetch(false);
    },
    invalidate: (refetch = true) => {
      patchState(
        { isInvalidated: true },
        { action: 'query.invalidate', meta: { keyHash: definition.keyHash, refetch } },
      );
      if (refetch) {
        void fetch(true).catch((error: unknown) => {
          reportBackgroundError('query.invalidate()', error, unit);
        });
      }
    },
    cancel,
    reset: () => {
      cancel();
      resetRecordState({
        unit,
        createInitialState: () => createInitialQueryState<TData, TError>(),
        annotation: { action: 'query.reset', meta: { keyHash: definition.keyHash } },
      });
      gcController.schedule();
    },
    setData: (updater) => {
      gcController.touch();
      const current = readRecordState(unit);
      const nextData =
        typeof updater === 'function'
          ? (updater as (prev: TData | undefined) => TData)(current.data)
          : updater;

      patchState(
        {
          status: 'success',
          data: nextData,
          error: null,
          dataUpdatedAt: Date.now(),
          failureCount: 0,
          failureReason: null,
          isInvalidated: false,
          isPlaceholderData: false,
        },
        { action: 'query.setData', meta: { keyHash: definition.keyHash } },
      );
    },
    hydrate: (state) => {
      patchState(
        {
          ...state,
          fetchStatus: 'idle',
          isPlaceholderData: false,
        },
        { action: 'query.hydrate', meta: { keyHash: definition.keyHash } },
      );
    },
    addObserver: () => observers.addObserver(),
    removeObserver: () => observers.removeObserver(),
    subscribe: (fn) => observers.subscribe(fn),
    subscribeUpdate: (fn) => unit.subscribeUpdate(fn),
  };
}
