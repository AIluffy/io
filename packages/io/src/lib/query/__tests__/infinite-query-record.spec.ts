import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cleanupDefaultClient,
  createTestClient,
  createTestInfiniteDefinition,
  sleep,
} from './infinite-test-utils.js';

describe('InfiniteQueryRecord', () => {
  let client: ReturnType<typeof createTestClient>;

  beforeEach(() => {
    client = createTestClient();
  });

  afterEach(() => {
    client.clear();
    cleanupDefaultClient();
  });

  it('initial state is pending/idle with undefined data', () => {
    const handle = client.defineInfiniteQuery(createTestInfiniteDefinition());
    const state = handle.getState();
    expect(state.status).toBe('pending');
    expect(state.fetchStatus).toBe('idle');
    expect(state.data).toBeUndefined();
    expect(state.fetchDirection).toBeNull();
  });

  it('fetchNextPage uses initialPageParam then next page params', async () => {
    const def = createTestInfiniteDefinition();
    const handle = client.defineInfiniteQuery(def);

    await handle.fetchNextPage();
    const data = await handle.fetchNextPage();

    expect(data.pageParams).toEqual([0, 1]);
    expect(def.queryFn).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ pageParam: 0 }),
    );
    expect(def.queryFn).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ pageParam: 1 }),
    );
  });

  it('refetchAllPages preserves previous data while fetching', async () => {
    const handle = client.defineInfiniteQuery(
      createTestInfiniteDefinition({
        queryFn: vi.fn(async ({ pageParam }) => {
          await sleep(40);
          return {
            items: [{ id: pageParam, name: `P${pageParam}` }],
            nextCursor: pageParam + 1,
            prevCursor: null,
          };
        }),
      }),
    );

    await handle.fetchNextPage();
    const before = handle.getState().data;
    expect(before).toBeDefined();

    const pending = handle.refetchAllPages();
    await sleep(5);

    const during = handle.getState();
    expect(during.fetchStatus).toBe('fetching');
    expect(during.data).toBeDefined();

    await pending;
  });

  it('supports maxPages sliding window in both directions', async () => {
    const forward = client.defineInfiniteQuery(
      createTestInfiniteDefinition({ maxPages: 2 }),
    );
    await forward.fetchNextPage();
    await forward.fetchNextPage();
    const f = await forward.fetchNextPage();
    expect(f.pageParams).toEqual([1, 2]);

    const backward = client.defineInfiniteQuery(
      createTestInfiniteDefinition({
        key: ['backward'],
        initialPageParam: 3,
        maxPages: 2,
      }),
    );
    await backward.fetchNextPage();
    await backward.fetchNextPage();
    const b = await backward.fetchPreviousPage();
    expect(b.pageParams).toEqual([2, 3]);
  });

  it('cancel aborts in-flight request and resets fetch state', async () => {
    const handle = client.defineInfiniteQuery(
      createTestInfiniteDefinition({
        queryFn: vi.fn(async () => {
          await sleep(80);
          return { items: [], nextCursor: null, prevCursor: null };
        }),
      }),
    );

    const p = handle.fetchNextPage();
    await sleep(5);
    handle.cancel();

    expect(handle.getState().fetchStatus).toBe('idle');
    expect(handle.getState().fetchDirection).toBeNull();
    await expect(p).rejects.toThrow();
  });
});
