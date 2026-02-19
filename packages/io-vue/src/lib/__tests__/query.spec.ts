import type { IoVueQueryResult } from '../query.js';

import { createQueryClient, createResource } from '@iostore/query';
import { effectScope } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { useQuery, useResource } from '../query.js';

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await new Promise<void>((resolve) => queueMicrotask(resolve));
}

describe('@iostore/vue: useQuery', () => {
  it('fetches query and updates state', async () => {
    const client = createQueryClient();
    const queryFn = vi.fn(async () => 7);
    const scope = effectScope();
    let result: IoVueQueryResult<number> | undefined;

    scope.run(() => {
      result = useQuery({
        client,
        key: ['vue', 'query'],
        queryFn,
      });
    });

    await flushAsync();

    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(result?.state.value.status).toBe('success');
    expect(result?.state.value.data).toBe(7);
    expect(result?.data.value).toBe(7);

    scope.stop();
  });
});

describe('@iostore/vue: useResource', () => {
  it('supports invalidate and refetch', async () => {
    const client = createQueryClient();
    let value = 0;
    const resource = createResource({
      client,
      key: ['vue', 'resource'],
      queryFn: async () => {
        value += 1;
        return value;
      },
      staleTime: 10_000,
    });

    const scope = effectScope();
    let result: IoVueQueryResult<number> | undefined;

    scope.run(() => {
      result = useResource(resource);
    });

    await flushAsync();
    expect(result?.state.value.data).toBe(1);
    expect(result?.invalidate()).toBe(1);
    await result?.refetch();
    await flushAsync();
    expect(result?.state.value.data).toBe(2);

    scope.stop();
  });
});
