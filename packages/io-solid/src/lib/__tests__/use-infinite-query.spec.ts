import type { IoSolidInfiniteQueryResult } from '../use-infinite-query.js';

import { createQueryClient } from '@iostore/store/query';
import { createRoot } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';

import { useInfiniteQuery } from '../use-infinite-query.js';

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

describe('@iostore/solid: useInfiniteQuery', () => {
  it('fetches first page and exposes accessor state', async () => {
    const client = createQueryClient();
    const { queryFn } = createMockInfiniteQueryFn();
    let result: IoSolidInfiniteQueryResult<Page, Error, number> | undefined;
    let dispose: () => void = () => undefined;

    createRoot((rootDispose) => {
      dispose = rootDispose;
      result = useInfiniteQuery({
        client,
        key: ['solid', 'infinite', 'initial'],
        queryFn,
        initialPageParam: 0,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      });
    });

    expect(result?.state().status).toBe('pending');

    await flushAsync();

    expect(result?.state().status).toBe('success');
    expect(result?.data()?.pages.length).toBe(1);

    dispose();
  });

  it('fetches next page and toggles isFetchingNextPage', async () => {
    const client = createQueryClient();
    const { queryFn } = createMockInfiniteQueryFn();
    let result: IoSolidInfiniteQueryResult<Page, Error, number> | undefined;
    let dispose: () => void = () => undefined;

    createRoot((rootDispose) => {
      dispose = rootDispose;
      result = useInfiniteQuery({
        client,
        key: ['solid', 'infinite', 'next-page'],
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

    expect(result?.state().data?.pages.length).toBe(2);
    expect(seenFetchingFlags.some((value) => value)).toBe(true);

    stop?.();

    dispose();
  });

  it('exposes standalone error accessor', async () => {
    const client = createQueryClient();
    const queryFn = vi.fn(async () => {
      throw new Error('boom');
    });
    let result: IoSolidInfiniteQueryResult<Page, Error, number> | undefined;
    let dispose: () => void = () => undefined;

    createRoot((rootDispose) => {
      dispose = rootDispose;
      result = useInfiniteQuery({
        client,
        key: ['solid', 'infinite', 'error'],
        queryFn,
        initialPageParam: 0,
        getNextPageParam: () => null,
        retry: 0,
      });
    });

    await flushAsync();

    expect(result?.error()).not.toBeNull();
    expect(result?.state().status).toBe('error');

    dispose();
  });

  it('cleans observer on root dispose when cancelOnCleanup enabled', () => {
    const client = createQueryClient();
    const { queryFn } = createMockInfiniteQueryFn();
    let result: IoSolidInfiniteQueryResult<Page, Error, number> | undefined;
    let dispose: () => void = () => undefined;

    createRoot((rootDispose) => {
      dispose = rootDispose;
      result = useInfiniteQuery({
        client,
        key: ['solid', 'infinite', 'cleanup'],
        queryFn,
        initialPageParam: 0,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        cancelOnCleanup: true,
      });
    });

    const disposeSpy = vi.spyOn(result!.observer, 'dispose');

    dispose();

    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });
});
