import { createQueryClient } from '@iostore/store/query';
import { describe, expect, it, vi } from 'vitest';

import { createInfiniteQueryStore, toInfiniteQueryStore } from '../stores.js';

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

  const queryFn = vi.fn(
    async ({ pageParam }: { pageParam: number; signal: AbortSignal }) => {
      const page = pages.get(pageParam);
      if (!page) {
        throw new Error(`Unknown page param: ${pageParam}`);
      }
      return page;
    },
  );

  return { queryFn };
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  await Promise.resolve();
  await new Promise<void>((resolve) => queueMicrotask(resolve));
}

describe('@iostore/svelte: infinite query stores', () => {
  it('createInfiniteQueryStore emits initial and first-page states', async () => {
    const client = createQueryClient();
    const { queryFn } = createMockInfiniteQueryFn();
    const store = createInfiniteQueryStore({
      client,
      key: ['svelte', 'infinite', 'initial'],
      queryFn,
      initialPageParam: 0,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    });

    const seen: Array<ReturnType<typeof store.getState>> = [];
    const unsubscribe = store.subscribe((state) => {
      seen.push(state);
    });

    await flushAsync();

    expect(seen[0]?.status).toBe('pending');
    expect(store.getState().data?.pages.length).toBe(1);

    unsubscribe();
  });

  it('fetchNextPage emits fetching state then appends page', async () => {
    const client = createQueryClient();
    const { queryFn } = createMockInfiniteQueryFn();
    const store = createInfiniteQueryStore({
      client,
      key: ['svelte', 'infinite', 'next-page'],
      queryFn,
      initialPageParam: 0,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    });

    const seenFetchingFlags: boolean[] = [];
    const unsubscribe = store.subscribe((state) => {
      seenFetchingFlags.push(state.isFetchingNextPage);
    });

    await flushAsync();

    const nextPromise = store.fetchNextPage();
    expect(store.getState().isFetchingNextPage).toBe(true);

    await nextPromise;
    await flushAsync();

    expect(store.getState().data?.pages.length).toBe(2);
    expect(seenFetchingFlags.some((value) => value)).toBe(true);

    unsubscribe();
  });

  it('cancels query when all subscribers unsubscribe and cancelOnUnsubscribe is true', async () => {
    const client = createQueryClient();
    const { queryFn } = createMockInfiniteQueryFn();
    const store = createInfiniteQueryStore({
      client,
      key: ['svelte', 'infinite', 'cancel-on-unsubscribe'],
      queryFn,
      initialPageParam: 0,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      cancelOnUnsubscribe: true,
    });

    const cancelSpy = vi.spyOn(store.query, 'cancel');
    const unsubA = store.subscribe(() => undefined);
    const unsubB = store.subscribe(() => undefined);

    unsubA();
    expect(cancelSpy).toHaveBeenCalledTimes(0);

    unsubB();
    expect(cancelSpy).toHaveBeenCalledTimes(1);
  });

  it('toInfiniteQueryStore works when passing observer and query manually', async () => {
    const client = createQueryClient();
    const { queryFn } = createMockInfiniteQueryFn();
    const query = client.defineInfiniteQuery<Page, Error, number>({
      key: ['svelte', 'infinite', 'manual'],
      queryFn,
      initialPageParam: 0,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    });
    const observer = client.observeInfiniteQuery<Page, Error, number, Page>({
      query,
    });

    const store = toInfiniteQueryStore(observer, query);
    const unsubscribe = store.subscribe(() => undefined);

    await flushAsync();

    expect(store.getState().status).toBe('success');
    expect(store.getState().data?.pages.length).toBe(1);

    unsubscribe();
  });

  it('returns a valid Svelte readable store contract', () => {
    const client = createQueryClient();
    const { queryFn } = createMockInfiniteQueryFn();
    const store = createInfiniteQueryStore({
      client,
      key: ['svelte', 'infinite', 'contract'],
      queryFn,
      initialPageParam: 0,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    });

    expect(typeof store.subscribe).toBe('function');

    const subscriber = vi.fn();
    const unsubscribe = store.subscribe(subscriber);

    expect(typeof unsubscribe).toBe('function');

    unsubscribe();
  });
});
