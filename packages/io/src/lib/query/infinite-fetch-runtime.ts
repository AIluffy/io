import type { IoInfiniteQueryState } from './types.js';
import { executeWithRetry } from './retry-executor.js';
import { createAbortError, isAbortError } from './utils.js';

import type { InfiniteData } from './types.js';
import type { InfiniteFetcherDefinition } from './infinite-page-fetcher-types.js';

type PatchState<TData, TError, TPageParam> = (
  patch: Partial<IoInfiniteQueryState<TData, TError, TPageParam>>,
  annotation?: { action: string; meta?: Record<string, unknown> },
) => void;

export function runInfiniteDirectionFetch<TData, TError, TPageParam>(options: {
  definition: InfiniteFetcherDefinition<TData, TPageParam>;
  direction: 'forward' | 'backward';
  pageParam: TPageParam;
  controller: AbortSignal;
  currentGeneration: number;
  getGeneration: () => number;
  getDataSnapshot: () => InfiniteData<TData, TPageParam>;
  patchState: PatchState<TData, TError, TPageParam>;
  applyMaxPages: (data: InfiniteData<TData, TPageParam>) => InfiniteData<TData, TPageParam>;
}): Promise<InfiniteData<TData, TPageParam>> {
  let failureCount = 0;
  const { definition, direction } = options;

  return (async () => {
    try {
      const page = await executeWithRetry<TData>({
        run: () => definition.queryFn({ signal: options.controller, pageParam: options.pageParam }),
        retry: definition.retry,
        retryDelay: definition.retryDelay,
        signal: options.controller,
        isCancelled: () => options.currentGeneration !== options.getGeneration(),
        onFailedAttempt: (count, error) => {
          failureCount = count;
          options.patchState(
            { failureCount: count, failureReason: error as TError },
            {
              action: `infiniteQuery.fetch.${direction}.retry`,
              meta: { keyHash: definition.keyHash, failureCount: count },
            },
          );
        },
      });

      const dataSnapshot = options.getDataSnapshot();
      const nextData =
        direction === 'forward'
          ? {
              pages: [...dataSnapshot.pages, page],
              pageParams: [...dataSnapshot.pageParams, options.pageParam],
            }
          : {
              pages: [page, ...dataSnapshot.pages],
              pageParams: [options.pageParam, ...dataSnapshot.pageParams],
            };
      const slicedData = options.applyMaxPages(nextData);

      options.patchState(
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
        { action: `infiniteQuery.fetch.${direction}.success`, meta: { keyHash: definition.keyHash } },
      );

      return slicedData;
    } catch (error) {
      if (
        isAbortError(error) ||
        options.currentGeneration !== options.getGeneration() ||
        options.controller.aborted
      ) {
        if (options.currentGeneration === options.getGeneration()) {
          options.patchState(
            { fetchStatus: 'idle', fetchDirection: null },
            { action: `infiniteQuery.fetch.${direction}.abort`, meta: { keyHash: definition.keyHash } },
          );
        }
        throw createAbortError();
      }

      options.patchState(
        {
          status: 'error',
          fetchStatus: 'idle',
          fetchDirection: null,
          error: error as TError,
          errorUpdatedAt: Date.now(),
          failureCount,
          failureReason: error as TError,
        },
        { action: `infiniteQuery.fetch.${direction}.error`, meta: { keyHash: definition.keyHash } },
      );
      throw error;
    }
  })();
}

export function runInfiniteRefetchAll<TData, TError, TPageParam>(options: {
  definition: InfiniteFetcherDefinition<TData, TPageParam>;
  pageParams: TPageParam[];
  controller: AbortSignal;
  currentGeneration: number;
  getGeneration: () => number;
  patchState: PatchState<TData, TError, TPageParam>;
  applyMaxPages: (data: InfiniteData<TData, TPageParam>) => InfiniteData<TData, TPageParam>;
}): Promise<InfiniteData<TData, TPageParam>> {
  const { definition } = options;

  return (async () => {
    const nextPages: TData[] = [];
    const nextPageParams: TPageParam[] = [];

    for (const pageParam of options.pageParams) {
      try {
        const page = await executeWithRetry<TData>({
          run: () => definition.queryFn({ signal: options.controller, pageParam }),
          retry: definition.retry,
          retryDelay: definition.retryDelay,
          signal: options.controller,
          isCancelled: () => options.currentGeneration !== options.getGeneration(),
        });

        nextPages.push(page);
        nextPageParams.push(pageParam);
        options.patchState(
          {
            status: 'success',
            fetchStatus: 'fetching',
            fetchDirection: null,
            data: { pages: [...nextPages], pageParams: [...nextPageParams] },
            dataUpdatedAt: Date.now(),
            error: null,
            failureCount: 0,
            failureReason: null,
          },
          { action: 'infiniteQuery.refetchAll.pageSuccess', meta: { keyHash: definition.keyHash } },
        );
      } catch (error) {
        if (
          isAbortError(error) ||
          options.currentGeneration !== options.getGeneration() ||
          options.controller.aborted
        ) {
          if (options.currentGeneration === options.getGeneration()) {
            options.patchState(
              { fetchStatus: 'idle', fetchDirection: null },
              { action: 'infiniteQuery.refetchAll.abort', meta: { keyHash: definition.keyHash } },
            );
          }
          throw createAbortError();
        }

        options.patchState(
          {
            status: 'error',
            fetchStatus: 'idle',
            fetchDirection: null,
            data: { pages: [...nextPages], pageParams: [...nextPageParams] },
            error: error as TError,
            errorUpdatedAt: Date.now(),
            failureReason: error as TError,
          },
          { action: 'infiniteQuery.refetchAll.error', meta: { keyHash: definition.keyHash } },
        );
        throw error;
      }
    }

    const finalData = options.applyMaxPages({ pages: nextPages, pageParams: nextPageParams });

    options.patchState(
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
      { action: 'infiniteQuery.refetchAll.success', meta: { keyHash: definition.keyHash } },
    );

    return finalData;
  })();
}
