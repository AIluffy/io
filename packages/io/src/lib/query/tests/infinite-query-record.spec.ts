import { describe, expect, it, vi } from 'vitest';

import {
  createInfiniteQueryRecord,
  type NormalizedInfiniteQueryDefinition,
} from '../infinite-query-record.js';
import { hashKey } from '../utils.js';

function createDefinition(options: {
  key?: readonly unknown[];
  queryFn: (context: { signal: AbortSignal; pageParam: number }) => Promise<number>;
  initialPageParam?: number;
  getNextPageParam?: (
    lastPage: number,
    allPages: readonly number[],
    lastPageParam: number,
    allPageParams: readonly number[],
  ) => number | null | undefined;
  getPreviousPageParam?: (
    firstPage: number,
    allPages: readonly number[],
    firstPageParam: number,
    allPageParams: readonly number[],
  ) => number | null | undefined;
  maxPages?: number;
  gcTime?: number;
}): NormalizedInfiniteQueryDefinition<number, Error, number> {
  return {
    key: options.key ?? ['infinite', 'record'],
    keyHash: hashKey(options.key ?? ['infinite', 'record']),
    queryFn: options.queryFn,
    initialPageParam: options.initialPageParam ?? 0,
    getNextPageParam: options.getNextPageParam ?? ((lastPage) => lastPage + 1),
    getPreviousPageParam: options.getPreviousPageParam,
    maxPages: options.maxPages,
    staleTime: 0,
    gcTime: options.gcTime ?? Number.POSITIVE_INFINITY,
    retry: 0,
    retryDelay: () => 0,
    canFetch: true,
  };
}

function createRecord(options: {
  definition: NormalizedInfiniteQueryDefinition<number, Error, number>;
  onGarbageCollect?: () => void;
}) {
  return createInfiniteQueryRecord<number, Error, number>({
    definition: options.definition,
    onGarbageCollect: options.onGarbageCollect ?? (() => undefined),
  });
}

describe('infinite-query-record', () => {
  it('has correct initial state', () => {
    const record = createRecord({
      definition: createDefinition({ queryFn: async ({ pageParam }) => pageParam }),
    });

    expect(record.getState()).toMatchObject({
      status: 'pending',
      fetchStatus: 'idle',
      data: undefined,
      fetchDirection: null,
    });
  });

  it('fetchNextPage loads pages and pageParams', async () => {
    const queryFn = vi.fn(async ({ pageParam }: { signal: AbortSignal; pageParam: number }) => {
      return pageParam * 10;
    });

    const record = createRecord({
      definition: createDefinition({
        queryFn,
        initialPageParam: 1,
        getNextPageParam: (_last, _allPages, lastPageParam) => lastPageParam + 1,
      }),
    });

    await expect(record.fetchNextPage()).resolves.toMatchObject({
      pages: [10],
      pageParams: [1],
    });

    await expect(record.fetchNextPage()).resolves.toMatchObject({
      pages: [10, 20],
      pageParams: [1, 2],
    });

    expect(queryFn).toHaveBeenCalledTimes(2);
    expect(record.getState().status).toBe('success');
  });

  it('does not request when getNextPageParam returns null', async () => {
    const queryFn = vi.fn(async ({ pageParam }: { signal: AbortSignal; pageParam: number }) => {
      return pageParam;
    });

    const record = createRecord({
      definition: createDefinition({
        queryFn,
        initialPageParam: 1,
        getNextPageParam: (lastPage) => (lastPage >= 1 ? null : 2),
      }),
    });

    await record.fetchNextPage();
    await record.fetchNextPage();

    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(record.getFlags().hasNextPage).toBe(false);
  });

  it('fetchPreviousPage prepends and respects null previous param', async () => {
    const queryFn = vi.fn(async ({ pageParam }: { signal: AbortSignal; pageParam: number }) => {
      return pageParam;
    });

    const record = createRecord({
      definition: createDefinition({
        queryFn,
        initialPageParam: 2,
        getNextPageParam: () => null,
        getPreviousPageParam: (_firstPage, _allPages, firstParam) =>
          firstParam > 1 ? firstParam - 1 : null,
      }),
    });

    await record.fetchNextPage();
    await expect(record.fetchPreviousPage()).resolves.toMatchObject({
      pages: [1, 2],
      pageParams: [1, 2],
    });

    await record.fetchPreviousPage();
    expect(queryFn).toHaveBeenCalledTimes(2);
    expect(record.getState().data?.pages).toEqual([1, 2]);
  });

  it('applies maxPages sliding window for forward and backward', async () => {
    const forward = createRecord({
      definition: createDefinition({
        queryFn: async ({ pageParam }) => pageParam,
        initialPageParam: 1,
        getNextPageParam: (_last, _all, lastParam) => lastParam + 1,
        maxPages: 2,
      }),
    });

    await forward.fetchNextPage();
    await forward.fetchNextPage();
    await forward.fetchNextPage();

    expect(forward.getState().data?.pages).toEqual([2, 3]);

    const backward = createRecord({
      definition: createDefinition({
        queryFn: async ({ pageParam }) => pageParam,
        initialPageParam: 3,
        getNextPageParam: () => null,
        getPreviousPageParam: (_first, _all, firstParam) => firstParam - 1,
        maxPages: 2,
      }),
    });

    await backward.fetchNextPage();
    await backward.fetchPreviousPage();
    await backward.fetchPreviousPage();

    expect(backward.getState().data?.pages).toEqual([1, 2]);
  });

  it('refetchAllPages keeps successful pages when one page fails', async () => {
    const queryFn = vi.fn(async ({ pageParam }: { signal: AbortSignal; pageParam: number }) => {
      if (pageParam === 2) {
        throw new Error('page-2-failed');
      }
      return pageParam;
    });

    const record = createRecord({
      definition: createDefinition({
        queryFn,
        initialPageParam: 1,
        getNextPageParam: (_last, _all, lastParam) => (lastParam < 2 ? lastParam + 1 : null),
      }),
    });

    await record.fetchNextPage();
    await record.fetchNextPage().catch(() => undefined);

    record.setData({ pages: [1, 2], pageParams: [1, 2] });

    await expect(record.refetchAllPages()).rejects.toThrow('page-2-failed');

    expect(record.getState().status).toBe('error');
    expect(record.getState().data?.pages).toEqual([1]);
    expect(record.getState().error?.message).toBe('page-2-failed');
  });

  it('cancel aborts in-flight fetch and resets fetchStatus to idle', async () => {
    let receivedSignal: AbortSignal | undefined;
    const deferred = new Promise<number>((resolve) => {
      setTimeout(() => resolve(1), 1000);
    });

    const record = createRecord({
      definition: createDefinition({
        queryFn: async ({ signal, pageParam }) => {
          receivedSignal = signal;
          await deferred;
          return pageParam;
        },
      }),
    });

    const promise = record.fetchNextPage();
    record.cancel();

    await expect(promise).rejects.toThrow();
    expect(record.getState().fetchStatus).toBe('idle');
    expect(receivedSignal?.aborted).toBe(true);
  });

  it('invalidate(false) only marks invalidated and invalidate(true) triggers refetch', async () => {
    const queryFn = vi.fn(async ({ pageParam }: { signal: AbortSignal; pageParam: number }) => {
      return pageParam;
    });

    const record = createRecord({
      definition: createDefinition({
        queryFn,
        initialPageParam: 1,
        getNextPageParam: () => null,
      }),
    });

    await record.fetchNextPage();
    record.invalidate(false);
    expect(record.getState().isInvalidated).toBe(true);

    record.invalidate(true);
    await vi.waitFor(() => {
      expect(queryFn).toHaveBeenCalledTimes(2);
    });
  });

  it('runs gc when no observers and no in-flight work', async () => {
    vi.useFakeTimers();
    const onGarbageCollect = vi.fn();

    const record = createRecord({
      definition: createDefinition({
        queryFn: async ({ pageParam }) => pageParam,
        gcTime: 10,
      }),
      onGarbageCollect,
    });

    await record.fetchNextPage();
    await vi.advanceTimersByTimeAsync(20);

    expect(onGarbageCollect).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('hydrate forces fetchStatus back to idle', () => {
    const record = createRecord({
      definition: createDefinition({ queryFn: async ({ pageParam }) => pageParam }),
    });

    record.hydrate({
      status: 'success',
      fetchStatus: 'fetching',
      data: {
        pages: [1],
        pageParams: [1],
      },
      error: null,
      dataUpdatedAt: 1,
      errorUpdatedAt: 0,
      failureCount: 0,
      failureReason: null,
      isInvalidated: false,
      isPlaceholderData: false,
      fetchDirection: 'forward',
    });

    expect(record.getState().fetchStatus).toBe('idle');
    expect(record.getState().fetchDirection).toBe(null);
    expect(record.getState().data?.pages).toEqual([1]);
  });
});
