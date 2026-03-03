import { createQueryClient } from '@iostore/store/query';
import { createRoot } from 'solid-js';
import { describe, expect, it } from 'vitest';

import { useSuspenseInfiniteQuery } from '../use-infinite-query.js';
import { useMutation, useSuspenseQuery } from '../use-query.js';

describe('@iostore/solid suspense+mutation', () => {
  it('useMutation exposes async mutation flow', async () => {
    let dispose!: () => void;
    let result!: ReturnType<typeof useMutation<number, number>>;

    createRoot((d) => {
      dispose = d;
      result = useMutation({
        mutationFn: async (value) => value * 3,
      });
      return null;
    });

    await expect(result.mutateAsync(2)).resolves.toBe(6);
    expect(result.flags().isSuccess).toBe(true);
    dispose();
  });

  it('useSuspenseQuery throws promise while pending', () => {
    const client = createQueryClient();

    createRoot((dispose) => {
      expect(() =>
        useSuspenseQuery({
          client,
          key: ['solid', 'suspense-query'],
          queryFn: async () => 1,
        }),
      ).toThrowError(Promise);
      dispose();
      return null;
    });
  });

  it('useSuspenseInfiniteQuery throws promise while pending', () => {
    const client = createQueryClient();

    createRoot((dispose) => {
      expect(() =>
        useSuspenseInfiniteQuery({
          client,
          key: ['solid', 'suspense-infinite'],
          initialPageParam: 0,
          queryFn: async ({ pageParam }) => ({ value: pageParam, next: null as number | null }),
          getNextPageParam: (last) => last.next,
        }),
      ).toThrowError(Promise);
      dispose();
      return null;
    });
  });
});
