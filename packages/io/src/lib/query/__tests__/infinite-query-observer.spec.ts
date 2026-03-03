import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cleanupDefaultClient,
  createTestClient,
  createTestInfiniteDefinition,
  sleep,
} from './infinite-test-utils.js';

describe('InfiniteQueryObserver', () => {
  let client: ReturnType<typeof createTestClient>;

  beforeEach(() => {
    client = createTestClient();
  });

  afterEach(() => {
    client.clear();
    cleanupDefaultClient();
  });

  it('returns state + derived flags', () => {
    const query = client.defineInfiniteQuery(createTestInfiniteDefinition());
    const observer = client.observeInfiniteQuery({ query });
    const result = observer.snapshot();

    expect(result.status).toBe('pending');
    expect(result.isPending).toBe(true);
    expect(typeof result.isFetchingNextPage).toBe('boolean');
    expect(typeof result.hasNextPage).toBe('boolean');

    observer.dispose();
  });

  it('supports select and onSuccess callback', async () => {
    const onSuccess = vi.fn();
    const query = client.defineInfiniteQuery(createTestInfiniteDefinition());
    const observer = client.observeInfiniteQuery({
      query,
      select: (data) =>
        data
          ? { totalItems: data.pages.reduce((sum, p) => sum + p.items.length, 0) }
          : undefined,
      onSuccess,
    });

    await query.fetchNextPage();
    await sleep(20);

    expect(observer.snapshot().data).toEqual({ totalItems: 10 });
    expect(onSuccess).toHaveBeenCalled();

    observer.dispose();
  });

  it('read throws while pending and stops syncing after dispose', async () => {
    const query = client.defineInfiniteQuery(createTestInfiniteDefinition());
    const observer = client.observeInfiniteQuery({ query });

    expect(() => observer.read()).toThrow();

    observer.dispose();
    await query.fetchNextPage();
    await sleep(20);

    expect(observer.snapshot().status).toBe('pending');
  });
});
