import { createQueryClient } from '@iostore/store/query';
import {
  effectScope,
  nextTick,
} from 'vue';
import { describe, expect, it } from 'vitest';

import { useSuspenseInfiniteQuery } from '../infinite-query.js';
import { useMutation, useSuspenseQuery } from '../query.js';

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await nextTick();
}

describe('@iostore/vue suspense+mutation', () => {
  it('useMutation exposes async mutation flow', async () => {
    const scope = effectScope();
    let result!: ReturnType<typeof useMutation<number, number>>;

    scope.run(() => {
      result = useMutation({
        mutationFn: async (value) => value + 1,
      });
    });

    await expect(result.mutateAsync(2)).resolves.toBe(3);
    expect(result.flags.value.isSuccess).toBe(true);
    scope.stop();
  });

  it('useSuspenseQuery throws promise while pending', () => {
    const client = createQueryClient();
    const scope = effectScope();

    scope.run(() => {
      expect(() =>
        useSuspenseQuery({
          client,
          key: ['vue', 'suspense-query'],
          queryFn: async () => 1,
        }),
      ).toThrowError(Promise);
    });

    scope.stop();
  });

  it('useSuspenseInfiniteQuery throws promise while pending', async () => {
    const client = createQueryClient();
    const scope = effectScope();

    scope.run(() => {
      expect(() =>
        useSuspenseInfiniteQuery({
          client,
          key: ['vue', 'suspense-infinite'],
          initialPageParam: 0,
          queryFn: async ({ pageParam }: { pageParam: number }) => ({
            value: pageParam,
            next: null as number | null,
          }),
          getNextPageParam: (last: { value: number; next: number | null }) => last.next,
        }),
      ).toThrowError(Promise);
    });

    await flushAsync();
    scope.stop();
  });
});
