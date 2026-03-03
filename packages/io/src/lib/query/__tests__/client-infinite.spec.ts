import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  cleanupDefaultClient,
  createTestClient,
  createTestInfiniteDefinition,
} from './infinite-test-utils.js';

describe('QueryClient infinite methods', () => {
  let client: ReturnType<typeof createTestClient>;

  beforeEach(() => {
    client = createTestClient();
  });

  afterEach(() => {
    client.clear();
    cleanupDefaultClient();
  });

  it('getInfiniteQuery and data/state helpers work', async () => {
    const handle = client.defineInfiniteQuery(createTestInfiniteDefinition());
    await handle.fetchNextPage();

    expect(client.getInfiniteQuery(['test-infinite'])).toBe(handle);
    expect(client.getInfiniteQueryData(['test-infinite'])?.pages).toHaveLength(1);
    expect(client.getInfiniteQueryState(['test-infinite'])?.status).toBe('success');
  });

  it('setInfiniteQueryData seeds missing key and updates existing key', () => {
    client.setInfiniteQueryData(['seeded'], {
      pages: [{ items: [], nextCursor: null, prevCursor: null }],
      pageParams: [0],
    });
    expect(client.getInfiniteQueryData(['seeded'])?.pages).toHaveLength(1);

    client.setInfiniteQueryData(['seeded'], (prev) => ({
      pages: [...(prev?.pages ?? [])],
      pageParams: [...(prev?.pageParams ?? []), 1],
    }));
    expect(client.getInfiniteQueryData(['seeded'])?.pageParams).toEqual([0, 1]);
  });

  it('prevents key conflicts between regular and infinite queries', () => {
    client.defineQuery({ key: ['shared'], queryFn: async () => 'data' });
    expect(() => {
      client.defineInfiniteQuery(createTestInfiniteDefinition({ key: ['shared'] }));
    }).toThrow(/already registered as a regular query/);

    client.defineInfiniteQuery(createTestInfiniteDefinition({ key: ['shared-2'] }));
    expect(() => {
      client.defineQuery({ key: ['shared-2'], queryFn: async () => 'data' });
    }).toThrow(/already registered as an infinite query/);
  });

  it('invalidateQueries predicate affects regular and infinite queries', async () => {
    const regular = client.defineQuery({
      key: ['todos', 'regular'],
      queryFn: async () => 'ok',
    });
    const infinite = client.defineInfiniteQuery(
      createTestInfiniteDefinition({ key: ['todos', 'infinite'] }),
    );

    await regular.fetch();
    await infinite.fetchNextPage();

    client.invalidateQueries({ predicate: (q) => q.key[0] === 'todos' }, false);

    expect(regular.getState().isInvalidated).toBe(true);
    expect(infinite.getState().isInvalidated).toBe(true);
  });
});
