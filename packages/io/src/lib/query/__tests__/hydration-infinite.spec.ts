import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IoDehydratedState } from '../types.js';

import {
  cleanupDefaultClient,
  createTestClient,
  createTestInfiniteDefinition,
} from './infinite-test-utils.js';

describe('Hydration infinite queries', () => {
  let client: ReturnType<typeof createTestClient>;

  beforeEach(() => {
    client = createTestClient();
  });

  afterEach(() => {
    client.clear();
    cleanupDefaultClient();
  });

  it('dehydrate includes infiniteQueries and hydrate restores them', async () => {
    const handle = client.defineInfiniteQuery(createTestInfiniteDefinition());
    await handle.fetchNextPage();

    const dehydrated = client.dehydrate();
    expect(dehydrated.infiniteQueries).toHaveLength(1);

    const restored = createTestClient();
    restored.hydrate(dehydrated);

    const rehydrated = restored.dehydrate();
    expect(rehydrated.infiniteQueries).toHaveLength(1);
    expect(rehydrated.infiniteQueries?.[0]?.state.data?.pages).toHaveLength(1);

    restored.clear();
  });

  it('hydrates old payloads without infiniteQueries', () => {
    const oldState: IoDehydratedState = { queries: [] };
    expect(() => client.hydrate(oldState)).not.toThrow();
  });

  it('shouldHydrateInfiniteQuery filter works', async () => {
    const a = client.defineInfiniteQuery(createTestInfiniteDefinition({ key: ['a'] }));
    const b = client.defineInfiniteQuery(createTestInfiniteDefinition({ key: ['b'] }));
    await a.fetchNextPage();
    await b.fetchNextPage();

    const dehydrated = client.dehydrate();

    const filteredClient = createTestClient();
    filteredClient.hydrate(dehydrated, {
      shouldHydrateInfiniteQuery: (q) => q.key[0] === 'a',
    });

    expect(filteredClient.dehydrate().infiniteQueries).toHaveLength(1);
    expect(filteredClient.dehydrate().infiniteQueries?.[0]?.key[0]).toBe('a');

    filteredClient.clear();
  });
});
