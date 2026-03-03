import { io } from '../core/api/io.js';
import { batch } from '../utils/reactive/batch.js';
import type { IoUnit, IoUpdate, IoUpdateAnnotation } from '../utils/types/types.js';

import { createGcScheduler } from './gc-scheduler.js';
import { deriveQueryFlags } from './query.js';
import { executeWithRetry } from './retry-executor.js';
import { readUnitState, setUnitState } from './unit-state.js';
import type {
  InfiniteData,
  IoInfiniteQueryDerivedFlags,
  IoInfiniteQueryDefinition,
  IoInfiniteQueryState,
  IoUnsubscribe,
} from './types.js';
import {
  createAbortError,
  isAbortError,
  reportBackgroundError,
} from './utils.js';

type InfiniteQueryUnitBox<TData, TError, TPageParam> = {
  value: IoUnit<IoInfiniteQueryState<TData, TError, TPageParam>>;
};

export type NormalizedInfiniteQueryDefinition<
  TData,
  TError,
  TPageParam,
> = IoInfiniteQueryDefinition<TData, TError, TPageParam> & {
  keyHash: string;
  staleTime: number;
  gcTime: number;
  retry: number;
  retryDelay: (attempt: number) => number;
  canFetch: boolean;
};

export type InfiniteQueryRecord<TData, TError, TPageParam> = {
  readonly key: readonly unknown[];
  readonly keyHash: string;
  readonly definition: NormalizedInfiniteQueryDefinition<TData, TError, TPageParam>;
  readonly observerCount: number;
  readonly isActive: boolean;
  touch: () => void;
  setDefinition: (
    next: NormalizedInfiniteQueryDefinition<TData, TError, TPageParam>,
  ) => void;
  getState: () => IoInfiniteQueryState<TData, TError, TPageParam>;
  getFlags: (isFetchedAfterMount?: boolean) => IoInfiniteQueryDerivedFlags;
  isStale: (state?: IoInfiniteQueryState<TData, TError, TPageParam>) => boolean;
  getInFlightPromise: () => Promise<InfiniteData<TData, TPageParam>> | null;
  fetchNextPage: (signal?: AbortSignal) => Promise<InfiniteData<TData, TPageParam>>;
  fetchPreviousPage: (signal?: AbortSignal) => Promise<InfiniteData<TData, TPageParam>>;
  refetchAllPages: (signal?: AbortSignal) => Promise<InfiniteData<TData, TPageParam>>;
  prefetch: () => Promise<void>;
  ensureData: () => Promise<InfiniteData<TData, TPageParam>>;
  invalidate: (refetch?: boolean) => void;
  cancel: () => void;
  reset: () => void;
  setData: (
    updater:
      | InfiniteData<TData, TPageParam>
      | ((prev: InfiniteData<TData, TPageParam> | undefined) => InfiniteData<TData, TPageParam>),
  ) => void;
  hydrate: (state: IoInfiniteQueryState<TData, TError, TPageParam>) => void;
  addObserver: () => void;
  removeObserver: () => void;
  subscribe: (
    fn: (state: IoInfiniteQueryState<TData, TError, TPageParam>) => void,
  ) => IoUnsubscribe;
  subscribeUpdate: (fn: (update: IoUpdate) => void) => IoUnsubscribe;
};

function createInitialInfiniteQueryState<TData, TError, TPageParam>(): IoInfiniteQueryState<
  TData,
  TError,
  TPageParam
> {
  return {
    status: 'pending',
    fetchStatus: 'idle',
    data: undefined,
    error: null,
    dataUpdatedAt: 0,
    errorUpdatedAt: 0,
    failureCount: 0,
    failureReason: null,
    isInvalidated: false,
    isPlaceholderData: false,
    fetchDirection: null,
  };
}

function patchState<TData, TError, TPageParam>(
  unit: IoUnit<IoInfiniteQueryState<TData, TError, TPageParam>>,
  patch: Partial<IoInfiniteQueryState<TData, TError, TPageParam>>,
  annotation?: IoUpdateAnnotation,
): void {
  batch(() => {
    setUnitState(
      unit,
      (current) => ({
        ...current,
        ...patch,
      }),
      annotation,
    );
  });
}

function snapshotData<TData, TPageParam>(
  data: InfiniteData<TData, TPageParam> | undefined,
): InfiniteData<TData, TPageParam> {
  if (!data) {
    return {
      pages: [],
      pageParams: [],
    };
  }

  return {
    pages: [...data.pages],
    pageParams: [...data.pageParams],
  };
}

function applyMaxPages<TData, TPageParam>(
  data: InfiniteData<TData, TPageParam>,
  maxPages: number | undefined,
  direction: 'forward' | 'backward',
): InfiniteData<TData, TPageParam> {
  if (!maxPages || data.pages.length <= maxPages) {
    return data;
  }

  if (direction === 'forward') {
    const offset = data.pages.length - maxPages;
    return {
      pages: data.pages.slice(offset),
      pageParams: data.pageParams.slice(offset),
    };
  }

  return {
    pages: data.pages.slice(0, maxPages),
    pageParams: data.pageParams.slice(0, maxPages),
  };
}

function createDefinitionConflictError(
  keyHash: string,
  field: string,
  expected: unknown,
  received: unknown,
): Error {
  return new Error(
    `defineInfiniteQuery: conflicting ${field} for key ${keyHash}. Expected ${String(
      expected,
    )}, received ${String(received)}.`,
  );
}

export function createInfiniteQueryRecord<TData, TError, TPageParam>(options: {
  definition: NormalizedInfiniteQueryDefinition<TData, TError, TPageParam>;
  onGarbageCollect: () => void;
}): InfiniteQueryRecord<TData, TError, TPageParam> {
  const holder = io(
    { value: createInitialInfiniteQueryState<TData, TError, TPageParam>() },
    { shallow: true },
  ) as unknown as InfiniteQueryUnitBox<TData, TError, TPageParam>;
  const unit = holder.value;

  let definition = options.definition;
  let observerCount = 0;
  let inFlightPromise: Promise<InfiniteData<TData, TPageParam>> | null = null;
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

  const isStale = (state = readUnitState(unit)): boolean => {
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

    const current = readUnitState(unit);
    if (current.fetchStatus !== 'idle' || current.fetchDirection !== null) {
      patchState(
        unit,
        {
          fetchStatus: 'idle',
          fetchDirection: null,
        },
        {
          action: 'infiniteQuery.fetch.cancel',
          meta: {
            keyHash: definition.keyHash,
          },
        },
      );
    }

    gcScheduler.schedule();
  };

  const runDirectionFetch = (
    direction: 'forward' | 'backward',
    resolver: (
      currentData: InfiniteData<TData, TPageParam> | undefined,
    ) => TPageParam | null | undefined,
    signal?: AbortSignal,
  ): Promise<InfiniteData<TData, TPageParam>> => {
    touch();

    if (!definition.canFetch) {
      return Promise.reject(
        new Error(`infiniteQuery.fetch: queryFn is not available for key ${definition.keyHash}`),
      );
    }

    if (inFlightPromise) {
      return inFlightPromise;
    }

    const currentState = readUnitState(unit);
    const pageParam = resolver(currentState.data);
    if (pageParam == null) {
      return Promise.resolve(currentState.data ?? { pages: [], pageParams: [] });
    }

    fetchGeneration += 1;
    const currentGeneration = fetchGeneration;
    const internalController = new AbortController();
    const controller = signal
      ? AbortSignal.any([signal, internalController.signal])
      : internalController.signal;
    abortController = internalController;

    const nextStatus =
      currentState.status === 'success' || currentState.data !== undefined
        ? 'success'
        : 'pending';

    patchState(
      unit,
      {
        status: nextStatus,
        fetchStatus: 'fetching',
        fetchDirection: direction,
        error: null,
        failureCount: 0,
        failureReason: null,
      },
      {
        action: `infiniteQuery.fetch.${direction}.start`,
        meta: {
          keyHash: definition.keyHash,
        },
      },
    );

    let failureCount = 0;
    const promise = (async () => {
      try {
        const page = await executeWithRetry<TData>({
          run: () => definition.queryFn({ signal: controller, pageParam }),
          retry: definition.retry,
          retryDelay: definition.retryDelay,
          signal: controller,
          isCancelled: () => currentGeneration !== fetchGeneration,
          onFailedAttempt: (count, error) => {
            failureCount = count;
            patchState(
              unit,
              {
                failureCount: count,
                failureReason: error as TError,
              },
              {
                action: `infiniteQuery.fetch.${direction}.retry`,
                meta: {
                  keyHash: definition.keyHash,
                  failureCount: count,
                },
              },
            );
          },
        });

        const dataSnapshot = snapshotData(readUnitState(unit).data);
        const nextData =
          direction === 'forward'
            ? {
                pages: [...dataSnapshot.pages, page],
                pageParams: [...dataSnapshot.pageParams, pageParam],
              }
            : {
                pages: [page, ...dataSnapshot.pages],
                pageParams: [pageParam, ...dataSnapshot.pageParams],
              };
        const slicedData = applyMaxPages(nextData, definition.maxPages, direction);

        patchState(
          unit,
          {
            status: 'success',
            fetchStatus: 'idle',
            fetchDirection: null,
            data: slicedData,
            error: null,
            dataUpdatedAt: Date.now(),
            failureCount: 0,
            failureReason: null,
            isInvalidated: false,
            isPlaceholderData: false,
          },
          {
            action: `infiniteQuery.fetch.${direction}.success`,
            meta: {
              keyHash: definition.keyHash,
            },
          },
        );

        return slicedData;
      } catch (error) {
        if (
          isAbortError(error) ||
          currentGeneration !== fetchGeneration ||
          controller.aborted
        ) {
          if (currentGeneration === fetchGeneration) {
            patchState(
              unit,
              {
                fetchStatus: 'idle',
                fetchDirection: null,
              },
              {
                action: `infiniteQuery.fetch.${direction}.abort`,
                meta: {
                  keyHash: definition.keyHash,
                },
              },
            );
          }
          throw createAbortError();
        }

        patchState(
          unit,
          {
            status: 'error',
            fetchStatus: 'idle',
            fetchDirection: null,
            error: error as TError,
            errorUpdatedAt: Date.now(),
            failureCount,
            failureReason: error as TError,
          },
          {
            action: `infiniteQuery.fetch.${direction}.error`,
            meta: {
              keyHash: definition.keyHash,
            },
          },
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
        if (abortController === internalController) {
          abortController = null;
        }
        if (currentGeneration === fetchGeneration) {
          gcScheduler.schedule();
        }
      })
      .catch(() => undefined);

    return promise;
  };

  const fetchNextPage = (signal?: AbortSignal): Promise<InfiniteData<TData, TPageParam>> =>
    runDirectionFetch(
      'forward',
      (currentData) => {
        if (!currentData || currentData.pages.length === 0) {
          return definition.initialPageParam;
        }

        const lastIndex = currentData.pages.length - 1;
        return definition.getNextPageParam(
          currentData.pages[lastIndex] as TData,
          currentData.pages,
          currentData.pageParams[lastIndex] as TPageParam,
          currentData.pageParams,
        );
      },
      signal,
    );

  const fetchPreviousPage = (signal?: AbortSignal): Promise<InfiniteData<TData, TPageParam>> =>
    runDirectionFetch(
      'backward',
      (currentData) => {
        if (!definition.getPreviousPageParam || !currentData || currentData.pages.length === 0) {
          return null;
        }

        return definition.getPreviousPageParam(
          currentData.pages[0] as TData,
          currentData.pages,
          currentData.pageParams[0] as TPageParam,
          currentData.pageParams,
        );
      },
      signal,
    );

  const refetchAllPages = (signal?: AbortSignal): Promise<InfiniteData<TData, TPageParam>> => {
    touch();

    if (!definition.canFetch) {
      return Promise.reject(
        new Error(`infiniteQuery.fetch: queryFn is not available for key ${definition.keyHash}`),
      );
    }

    if (inFlightPromise) {
      return inFlightPromise;
    }

    fetchGeneration += 1;
    const currentGeneration = fetchGeneration;
    const internalController = new AbortController();
    const controller = signal
      ? AbortSignal.any([signal, internalController.signal])
      : internalController.signal;
    abortController = internalController;

    const currentState = readUnitState(unit);
    const pageParams =
      currentState.data && currentState.data.pageParams.length > 0
        ? [...currentState.data.pageParams]
        : [definition.initialPageParam];

    patchState(
      unit,
      {
        fetchStatus: 'fetching',
        fetchDirection: null,
        error: null,
        failureCount: 0,
        failureReason: null,
        data: undefined,
      },
      {
        action: 'infiniteQuery.refetchAll.start',
        meta: {
          keyHash: definition.keyHash,
        },
      },
    );

    const promise = (async () => {
      const nextPages: TData[] = [];
      const nextPageParams: TPageParam[] = [];

      for (const pageParam of pageParams) {
        try {
          const page = await executeWithRetry<TData>({
            run: () => definition.queryFn({ signal: controller, pageParam }),
            retry: definition.retry,
            retryDelay: definition.retryDelay,
            signal: controller,
            isCancelled: () => currentGeneration !== fetchGeneration,
          });

          nextPages.push(page);
          nextPageParams.push(pageParam);

          patchState(
            unit,
            {
              status: 'success',
              fetchStatus: 'fetching',
              fetchDirection: null,
              data: {
                pages: [...nextPages],
                pageParams: [...nextPageParams],
              },
              dataUpdatedAt: Date.now(),
              error: null,
              failureCount: 0,
              failureReason: null,
            },
            {
              action: 'infiniteQuery.refetchAll.pageSuccess',
              meta: {
                keyHash: definition.keyHash,
              },
            },
          );
        } catch (error) {
          if (
            isAbortError(error) ||
            currentGeneration !== fetchGeneration ||
            controller.aborted
          ) {
            if (currentGeneration === fetchGeneration) {
              patchState(
                unit,
                {
                  fetchStatus: 'idle',
                  fetchDirection: null,
                },
                {
                  action: 'infiniteQuery.refetchAll.abort',
                  meta: {
                    keyHash: definition.keyHash,
                  },
                },
              );
            }
            throw createAbortError();
          }

          patchState(
            unit,
            {
              status: 'error',
              fetchStatus: 'idle',
              fetchDirection: null,
              data: {
                pages: [...nextPages],
                pageParams: [...nextPageParams],
              },
              error: error as TError,
              errorUpdatedAt: Date.now(),
              failureReason: error as TError,
            },
            {
              action: 'infiniteQuery.refetchAll.error',
              meta: {
                keyHash: definition.keyHash,
              },
            },
          );
          throw error;
        }
      }

      const finalData = applyMaxPages(
        {
          pages: nextPages,
          pageParams: nextPageParams,
        },
        definition.maxPages,
        'forward',
      );

      patchState(
        unit,
        {
          status: 'success',
          fetchStatus: 'idle',
          fetchDirection: null,
          data: finalData,
          error: null,
          dataUpdatedAt: Date.now(),
          failureCount: 0,
          failureReason: null,
          isInvalidated: false,
          isPlaceholderData: false,
        },
        {
          action: 'infiniteQuery.refetchAll.success',
          meta: {
            keyHash: definition.keyHash,
          },
        },
      );

      return finalData;
    })();

    inFlightPromise = promise;

    void promise
      .finally(() => {
        if (inFlightPromise === promise) {
          inFlightPromise = null;
        }
        if (abortController === internalController) {
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
    fetchNextPage()
      .then(() => undefined)
      .catch((error: unknown) => {
        reportBackgroundError('infiniteQuery.prefetchQuery()', error, unit);
      });

  const ensureData = (): Promise<InfiniteData<TData, TPageParam>> => {
    const current = readUnitState(unit);
    if (current.status === 'success' && !isStale(current) && current.data) {
      return Promise.resolve(current.data);
    }
    return refetchAllPages();
  };

  const invalidate = (refetch = true): void => {
    patchState(
      unit,
      {
        isInvalidated: true,
      },
      {
        action: 'infiniteQuery.invalidate',
        meta: {
          keyHash: definition.keyHash,
          refetch,
        },
      },
    );

    if (refetch) {
      void refetchAllPages().catch((error: unknown) => {
        reportBackgroundError('infiniteQuery.invalidate()', error, unit);
      });
    }
  };

  const setData = (
    updater:
      | InfiniteData<TData, TPageParam>
      | ((prev: InfiniteData<TData, TPageParam> | undefined) => InfiniteData<TData, TPageParam>),
  ): void => {
    touch();
    const current = readUnitState(unit);
    const nextData =
      typeof updater === 'function'
        ? (updater as (prev: InfiniteData<TData, TPageParam> | undefined) => InfiniteData<TData, TPageParam>)(
            current.data,
          )
        : updater;

    patchState(
      unit,
      {
        status: 'success',
        data: {
          pages: [...nextData.pages],
          pageParams: [...nextData.pageParams],
        },
        error: null,
        dataUpdatedAt: Date.now(),
        failureCount: 0,
        failureReason: null,
        isInvalidated: false,
        isPlaceholderData: false,
        fetchDirection: null,
      },
      {
        action: 'infiniteQuery.setData',
        meta: {
          keyHash: definition.keyHash,
        },
      },
    );
  };

  const reset = (): void => {
    cancel();
    batch(() => {
      setUnitState(unit, createInitialInfiniteQueryState<TData, TError, TPageParam>(), {
        action: 'infiniteQuery.reset',
        meta: {
          keyHash: definition.keyHash,
        },
      });
    });
    gcScheduler.schedule();
  };

  const hydrate = (state: IoInfiniteQueryState<TData, TError, TPageParam>): void => {
    patchState(
      unit,
      {
        ...state,
        fetchStatus: 'idle',
        fetchDirection: null,
        isPlaceholderData: false,
      },
      {
        action: 'infiniteQuery.hydrate',
        meta: {
          keyHash: definition.keyHash,
        },
      },
    );
  };

  const setDefinition = (
    next: NormalizedInfiniteQueryDefinition<TData, TError, TPageParam>,
  ): void => {
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

  const subscribe = (
    fn: (state: IoInfiniteQueryState<TData, TError, TPageParam>) => void,
  ): IoUnsubscribe => {
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
      const state = unit.snapshot();
      const queryFlags = deriveQueryFlags(state, {
        isStale: isStale(state),
        isFetchedAfterMount,
      });
      return {
        ...queryFlags,
        isFetchingNextPage:
          state.fetchStatus === 'fetching' && state.fetchDirection === 'forward',
        isFetchingPreviousPage:
          state.fetchStatus === 'fetching' && state.fetchDirection === 'backward',
        hasNextPage: (() => {
          if (!state.data || state.data.pages.length === 0) {
            return true;
          }
          const lastIndex = state.data.pages.length - 1;
          return (
            definition.getNextPageParam(
              state.data.pages[lastIndex] as TData,
              state.data.pages,
              state.data.pageParams[lastIndex] as TPageParam,
              state.data.pageParams,
            ) != null
          );
        })(),
        hasPreviousPage: (() => {
          if (!definition.getPreviousPageParam || !state.data || state.data.pages.length === 0) {
            return false;
          }
          return (
            definition.getPreviousPageParam(
              state.data.pages[0] as TData,
              state.data.pages,
              state.data.pageParams[0] as TPageParam,
              state.data.pageParams,
            ) != null
          );
        })(),
      };
    },
    isStale,
    getInFlightPromise: () => inFlightPromise,
    fetchNextPage,
    fetchPreviousPage,
    refetchAllPages,
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
