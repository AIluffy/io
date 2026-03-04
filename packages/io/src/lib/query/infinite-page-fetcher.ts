import type { IoUnit, IoUpdateAnnotation } from '../utils/types/types.js';

import type { InfiniteFetcherDefinition } from './infinite-page-fetcher-types.js';
import type { InfiniteData, IoInfiniteQueryState } from './types.js';
import { cloneInfiniteData } from './infinite-query-state.js';
import { runInfiniteDirectionFetch, runInfiniteRefetchAll } from './infinite-fetch-runtime.js';
import { readUnitState } from './unit-state.js';

type PatchState<TData, TError, TPageParam> = (
  patch: Partial<IoInfiniteQueryState<TData, TError, TPageParam>>,
  annotation?: IoUpdateAnnotation,
) => void;

export function applyMaxPages<TData, TPageParam>(
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

export function createInfinitePageFetcher<TData, TError, TPageParam>(options: {
  unit: IoUnit<IoInfiniteQueryState<TData, TError, TPageParam>>;
  getDefinition: () => InfiniteFetcherDefinition<TData, TPageParam>;
  patchState: PatchState<TData, TError, TPageParam>;
  touch: () => void;
  scheduleGc: () => void;
}): {
  getInFlightPromise: () => Promise<InfiniteData<TData, TPageParam>> | null;
  cancel: () => void;
  fetchNextPage: (signal?: AbortSignal) => Promise<InfiniteData<TData, TPageParam>>;
  fetchPreviousPage: (signal?: AbortSignal) => Promise<InfiniteData<TData, TPageParam>>;
  refetchAllPages: (signal?: AbortSignal) => Promise<InfiniteData<TData, TPageParam>>;
} {
  let inFlightPromise: Promise<InfiniteData<TData, TPageParam>> | null = null;
  let abortController: AbortController | null = null;
  let fetchGeneration = 0;

  const finalizePromise = (promise: Promise<InfiniteData<TData, TPageParam>>, internalController: AbortController, generation: number): void => {
    void promise
      .finally(() => {
        if (inFlightPromise === promise) {
          inFlightPromise = null;
        }
        if (abortController === internalController) {
          abortController = null;
        }
        if (generation === fetchGeneration) {
          options.scheduleGc();
        }
      })
      .catch(() => undefined);
  };

  const cancel = (): void => {
    if (!inFlightPromise && !abortController) {
      return;
    }

    fetchGeneration += 1;
    abortController?.abort();
    abortController = null;
    inFlightPromise = null;

    const current = readUnitState(options.unit);
    if (current.fetchStatus !== 'idle' || current.fetchDirection !== null) {
      options.patchState(
        { fetchStatus: 'idle', fetchDirection: null },
        { action: 'infiniteQuery.fetch.cancel', meta: { keyHash: options.getDefinition().keyHash } },
      );
    }

    options.scheduleGc();
  };

  const runFetch = (
    direction: 'forward' | 'backward',
    resolvePageParam: (data: InfiniteData<TData, TPageParam> | undefined) => TPageParam | null | undefined,
    signal?: AbortSignal,
  ): Promise<InfiniteData<TData, TPageParam>> => {
    options.touch();
    const definition = options.getDefinition();
    if (!definition.canFetch) {
      return Promise.reject(new Error(`infiniteQuery.fetch: queryFn is not available for key ${definition.keyHash}`));
    }
    if (inFlightPromise) {
      return inFlightPromise;
    }

    const current = readUnitState(options.unit);
    const pageParam = resolvePageParam(current.data);
    if (pageParam == null) {
      return Promise.resolve(current.data ?? { pages: [], pageParams: [] });
    }

    fetchGeneration += 1;
    const currentGeneration = fetchGeneration;
    const internalController = new AbortController();
    const controller = signal ? AbortSignal.any([signal, internalController.signal]) : internalController.signal;
    abortController = internalController;

    options.patchState(
      {
        status: current.status === 'success' || current.data !== undefined ? 'success' : 'pending',
        fetchStatus: 'fetching',
        fetchDirection: direction,
        error: null,
        failureCount: 0,
        failureReason: null,
      },
      { action: `infiniteQuery.fetch.${direction}.start`, meta: { keyHash: definition.keyHash } },
    );

    const promise = runInfiniteDirectionFetch<TData, TError, TPageParam>({
      definition,
      direction,
      pageParam,
      controller,
      currentGeneration,
      getGeneration: () => fetchGeneration,
      getDataSnapshot: () => cloneInfiniteData(readUnitState(options.unit).data),
      patchState: options.patchState,
      applyMaxPages: (data) => applyMaxPages(data, definition.maxPages, direction),
    });

    inFlightPromise = promise;
    finalizePromise(promise, internalController, currentGeneration);
    return promise;
  };

  return {
    getInFlightPromise: () => inFlightPromise,
    cancel,
    fetchNextPage: (signal) =>
      runFetch(
        'forward',
        (currentData) => {
          if (!currentData || currentData.pages.length === 0) {
            return options.getDefinition().initialPageParam;
          }
          const lastIndex = currentData.pages.length - 1;
          const definition = options.getDefinition();
          return definition.getNextPageParam(
            currentData.pages[lastIndex] as TData,
            currentData.pages,
            currentData.pageParams[lastIndex] as TPageParam,
            currentData.pageParams,
          );
        },
        signal,
      ),
    fetchPreviousPage: (signal) =>
      runFetch(
        'backward',
        (currentData) => {
          const definition = options.getDefinition();
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
      ),
    refetchAllPages: (signal) => {
      options.touch();
      const definition = options.getDefinition();
      if (!definition.canFetch) {
        return Promise.reject(new Error(`infiniteQuery.fetch: queryFn is not available for key ${definition.keyHash}`));
      }
      if (inFlightPromise) {
        return inFlightPromise;
      }

      fetchGeneration += 1;
      const currentGeneration = fetchGeneration;
      const internalController = new AbortController();
      const controller = signal ? AbortSignal.any([signal, internalController.signal]) : internalController.signal;
      abortController = internalController;

      const currentState = readUnitState(options.unit);
      const pageParams =
        currentState.data && currentState.data.pageParams.length > 0
          ? [...currentState.data.pageParams]
          : [definition.initialPageParam];

      options.patchState(
        { fetchStatus: 'fetching', fetchDirection: null, error: null, failureCount: 0, failureReason: null },
        { action: 'infiniteQuery.refetchAll.start', meta: { keyHash: definition.keyHash } },
      );

      const promise = runInfiniteRefetchAll<TData, TError, TPageParam>({
        definition,
        pageParams,
        controller,
        currentGeneration,
        getGeneration: () => fetchGeneration,
        patchState: options.patchState,
        applyMaxPages: (data) => applyMaxPages(data, definition.maxPages, 'forward'),
      });

      inFlightPromise = promise;
      finalizePromise(promise, internalController, currentGeneration);
      return promise;
    },
  };
}
