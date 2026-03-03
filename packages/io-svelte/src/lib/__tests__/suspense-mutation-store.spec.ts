import { describe, expect, it } from 'vitest';

import {
  createMutationStore,
  createSuspenseInfiniteQueryStore,
  createSuspenseQueryStore,
} from '../stores.js';

describe('@iostore/svelte suspense+mutation stores', () => {
  it('createMutationStore exposes async mutation result', async () => {
    const store = createMutationStore({
      mutationFn: async (value: number) => value + 5,
    });

    await expect(store.mutateAsync(1)).resolves.toBe(6);
    expect(store.getState().isSuccess).toBe(true);
  });

  it('createSuspenseQueryStore exposes pending promise', () => {
    const store = createSuspenseQueryStore({
      key: ['svelte', 'suspense-query'],
      queryFn: async () => 1,
    });

    const pendingPromise = store.promise();
    expect(pendingPromise).toBeInstanceOf(Promise);
  });

  it('createSuspenseInfiniteQueryStore exposes pending promise', () => {
    const store = createSuspenseInfiniteQueryStore({
      key: ['svelte', 'suspense-infinite'],
      initialPageParam: 0,
      queryFn: async ({ pageParam }) => ({ value: pageParam, next: null as number | null }),
      getNextPageParam: (last) => last.next,
    });

    const pendingPromise = store.promise();
    expect(pendingPromise).toBeInstanceOf(Promise);
  });
});
