import type { IoVueInfiniteQueryResult } from '../infinite-query.js';

import { createQueryClient } from '@iostore/store/query';
import { effectScope, isRef, watchEffect } from 'vue';
import { describe, expect, it, vi } from 'vitest';

import { useInfiniteQuery } from '../infinite-query.js';

type Page = {
  items: string[];
  nextCursor: number | null;
};

function createMockInfiniteQueryFn() {
  const pages = new Map<number, Page>([
    [0, { items: ['a', 'b'], nextCursor: 1 }],
    [1, { items: ['c', 'd'], nextCursor: 2 }],
    [2, { items: ['e', 'f'], nextCursor: null }],
  ]);

  const queryFn = vi.fn(async ({ pageParam }: { pageParam: number; signal: AbortSignal }) => {
    const page = pages.get(pageParam);
    if (!page) {
      throw new Error(`Unknown page param: ${pageParam}`);
    }
    return page;
  });

  return { queryFn };
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  await Promise.resolve();
  await new Promise<void>((resolve) => queueMicrotask(resolve));
}

describe('@iostore/vue: useInfiniteQuery', () => {
  it('creates infinite query/observer and resolves first page', async () => {
    const client = createQueryClient();
    const { queryFn } = createMockInfiniteQueryFn();
    const scope = effectScope();
    let result: IoVueInfiniteQueryResult<Page, Error, number> | undefined;

    scope.run(() => {
      result = useInfiniteQuery({
        client,
        key: ['vue', 'infinite', 'initial'],
        queryFn,
        initialPageParam: 0,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      });
    });

    expect(result?.state.value.status).toBe('pending');
    expect(isRef(result?.data)).toBe(true);

    await flushAsync();

    expect(result?.state.value.status).toBe('success');
    expect(result?.state.value.data?.pages.length).toBe(1);
    expect(result?.data.value?.pages.length).toBe(1);

    scope.stop();
  });

  it('fetches next page and exposes fetching-next-page flag', async () => {
    const client = createQueryClient();
    const { queryFn } = createMockInfiniteQueryFn();
    const scope = effectScope();
    let result: IoVueInfiniteQueryResult<Page, Error, number> | undefined;

    scope.run(() => {
      result = useInfiniteQuery({
        client,
        key: ['vue', 'infinite', 'next-page'],
        queryFn,
        initialPageParam: 0,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      });
    });

    await flushAsync();

    const seenFetchingFlags: boolean[] = [];
    const stop = result?.observer.subscribe((value) => {
      seenFetchingFlags.push(value.isFetchingNextPage);
    });

    const nextPagePromise = result?.fetchNextPage();

    await nextPagePromise;
    await flushAsync();

    expect(result?.data.value?.pages.length).toBe(2);
    expect(seenFetchingFlags.some((value) => value)).toBe(true);

    stop?.();

    scope.stop();
  });

  it('disposes observer on scope stop with cancelOnDispose', () => {
    const client = createQueryClient();
    const { queryFn } = createMockInfiniteQueryFn();
    const scope = effectScope();
    let result: IoVueInfiniteQueryResult<Page, Error, number> | undefined;

    scope.run(() => {
      result = useInfiniteQuery({
        client,
        key: ['vue', 'infinite', 'dispose'],
        queryFn,
        initialPageParam: 0,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        cancelOnDispose: true,
      });
    });

    const disposeSpy = vi.spyOn(result!.observer, 'dispose');

    scope.stop();

    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });

  it('works with watchEffect reactive tracking', async () => {
    const client = createQueryClient();
    const { queryFn } = createMockInfiniteQueryFn();
    const scope = effectScope();
    let result: IoVueInfiniteQueryResult<Page, Error, number> | undefined;
    const seenLengths: number[] = [];

    scope.run(() => {
      result = useInfiniteQuery({
        client,
        key: ['vue', 'infinite', 'watch'],
        queryFn,
        initialPageParam: 0,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      });

      watchEffect(() => {
        seenLengths.push(result?.data.value?.pages.length ?? 0);
      });
    });

    await flushAsync();

    expect(seenLengths.some((length) => length === 0)).toBe(true);
    expect(seenLengths.some((length) => length === 1)).toBe(true);

    scope.stop();
  });


  it('supports handle mode input', async () => {
    const client = createQueryClient({ defaultRetry: 0 });
    const { queryFn } = createMockInfiniteQueryFn();
    const scope = effectScope();

    const handle = client.defineInfiniteQuery<Page, Error, number>({
      key: ['vue', 'infinite', 'handle'],
      queryFn,
      initialPageParam: 0,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    });

    let result: IoVueInfiniteQueryResult<Page, Error, number> | undefined;
    scope.run(() => {
      result = useInfiniteQuery({ query: handle, client });
    });

    await flushAsync();
    expect(result?.state.value.status).toBe('success');

    scope.stop();
  });
});
