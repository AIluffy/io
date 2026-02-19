import type { IoSolidQueryResult } from '../use-query.js';

import { createQueryClient, createResource } from '@iostore/query';
import { createRoot } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';
import { useQuery, useResource } from '../use-query.js';

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await new Promise<void>((resolve) => queueMicrotask(resolve));
}

describe('@iostore/solid: useQuery', () => {
  it('fetches query and updates state', async () => {
    const client = createQueryClient();
    const queryFn = vi.fn(async () => 11);
    let result: IoSolidQueryResult<number> | undefined;
    let dispose: () => void = () => undefined;

    createRoot((rootDispose) => {
      dispose = rootDispose;
      result = useQuery({
        client,
        key: ['solid', 'query'],
        queryFn,
      });
    });

    await flushAsync();

    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(result?.state().status).toBe('success');
    expect(result?.data()).toBe(11);
    dispose();
  });
});

describe('@iostore/solid: useResource', () => {
  it('supports invalidate and refetch', async () => {
    const client = createQueryClient();
    let value = 0;
    const resource = createResource({
      client,
      key: ['solid', 'resource'],
      queryFn: async () => {
        value += 1;
        return value;
      },
      staleTime: 10_000,
    });

    let result: IoSolidQueryResult<number> | undefined;
    let dispose: () => void = () => undefined;
    createRoot((rootDispose) => {
      dispose = rootDispose;
      result = useResource(resource);
    });

    await flushAsync();
    expect(result?.data()).toBe(1);
    expect(result?.invalidate()).toBe(1);
    await flushAsync();
    expect(result?.data()).toBe(2);
    await result?.refetch();
    await flushAsync();
    expect(result?.data()).toBe(3);
    dispose();
  });
});
