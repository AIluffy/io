import { vi } from 'vitest';

import { createQueryClient, resetDefaultClient } from '../client.js';
import type { IoInfiniteQueryDefinition, IoQueryClient } from '../types.js';

export function createTestClient(): IoQueryClient {
  return createQueryClient({
    defaultStaleTime: 0,
    defaultGcTime: 5 * 60 * 1000,
    defaultRetry: 0,
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type TestPageData = {
  items: Array<{ id: number; name: string }>;
  nextCursor: number | null;
  prevCursor: number | null;
};

export function createPageData(
  cursor: number,
  itemCount = 10,
  totalPages = 5,
): TestPageData {
  return {
    items: Array.from({ length: itemCount }, (_, i) => ({
      id: cursor * itemCount + i,
      name: `Item ${cursor * itemCount + i}`,
    })),
    nextCursor: cursor < totalPages - 1 ? cursor + 1 : null,
    prevCursor: cursor > 0 ? cursor - 1 : null,
  };
}

export function createTestInfiniteDefinition(
  overrides?: Partial<IoInfiniteQueryDefinition<TestPageData, Error, number>>,
): IoInfiniteQueryDefinition<TestPageData, Error, number> {
  return {
    key: ['test-infinite'],
    queryFn: vi.fn(
      async ({ pageParam }: { signal: AbortSignal; pageParam: number }) => {
        await sleep(10);
        return createPageData(pageParam);
      },
    ),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    getPreviousPageParam: (firstPage) => firstPage.prevCursor,
    ...overrides,
  };
}

export function cleanupDefaultClient(): void {
  resetDefaultClient();
}
