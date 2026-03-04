import { createQueryClient, resetDefaultClient } from '@iostore/store/query';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ensureInfiniteQueryData,
  ensureQueryData,
  resolveInfiniteQueryHandle,
  resolveQueryHandle,
} from '../../rsc.js';

describe('@iostore/react/rsc', () => {
  const client = createQueryClient({ defaultRetry: 0 });

  afterEach(() => {
    client.clear();
    resetDefaultClient();
  });

  it('resolves and ensures regular query data without hooks', async () => {
    const handle = resolveQueryHandle({
      client,
      input: {
        key: ['rsc', 'query'],
        queryFn: async () => 42,
      },
    });

    expect(handle.key).toEqual(['rsc', 'query']);

    const ensured = await ensureQueryData({ client, input: handle });
    expect(ensured).toBe(42);
  });

  it('resolves and ensures infinite query data without hooks', async () => {
    const handle = resolveInfiniteQueryHandle({
      client,
      input: {
        key: ['rsc', 'infinite'],
        queryFn: async ({ pageParam }) => ({ value: pageParam as number, next: null }),
        initialPageParam: 0,
        getNextPageParam: (last) => last.next,
      },
    });

    const ensured = await ensureInfiniteQueryData({ client, input: handle });
    expect(ensured.pages).toHaveLength(1);
    expect(ensured.pages[0]).toEqual({ value: 0, next: null });
  });
});
