import { createQueryClient, resetDefaultClient } from '@iostore/store/query';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createInfiniteQueryStore } from '../stores.js';

type Page = { items: number[]; next: number | null; prev: number | null };

describe('createInfiniteQueryStore (Svelte)', () => {
  let client: ReturnType<typeof createQueryClient>;

  beforeEach(() => {
    client = createQueryClient({ defaultRetry: 0 });
  });

  afterEach(() => {
    client.clear();
    resetDefaultClient();
  });

  it('returns readable store and supports definition mode', () => {
    const store = createInfiniteQueryStore<Page, Error, number>({
      key: ['svelte-test'],
      queryFn: async ({ pageParam }) => ({
        items: [pageParam],
        next: null,
        prev: null,
      }),
      initialPageParam: 0,
      getNextPageParam: (last) => last.next,
      client,
    });

    const value = get(store);
    expect(value.status).toBe('pending');
    expect(typeof store.fetchNextPage).toBe('function');
    expect(typeof store.fetchPreviousPage).toBe('function');
  });

  it('supports handle mode and cancelOnUnsubscribe', async () => {
    const query = client.defineInfiniteQuery<Page, Error, number>({
      key: ['svelte-handle'],
      queryFn: async ({ pageParam }) => ({
        items: [pageParam],
        next: null,
        prev: null,
      }),
      initialPageParam: 0,
      getNextPageParam: (last) => last.next,
      getPreviousPageParam: (first) => first.prev,
    });

    const store = createInfiniteQueryStore({
      query,
      client,
      cancelOnUnsubscribe: true,
    });

    const cancelSpy = vi.spyOn(store.query, 'cancel');
    const unsubscribe = store.subscribe(() => undefined);
    unsubscribe();

    expect(cancelSpy).toHaveBeenCalledTimes(1);

    await store.fetchNextPage();
    await store.fetchPreviousPage();
  });
});
