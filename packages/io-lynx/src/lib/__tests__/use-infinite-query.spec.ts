import { createQueryClient } from '@iostore/store/query';
import { describe, expect, it, vi } from 'vitest';

const capture = {
  onStoreChangeCalls: 0,
  unsubscribeList: [] as Array<() => void>,
  cleanupList: [] as Array<() => void>,
  lastSnapshot: undefined as unknown,
};

vi.mock('@lynx-js/react', () => ({
  useMemo: <T,>(factory: () => T) => factory(),
  useRef: <T,>(initialValue: T) => ({ current: initialValue }),
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (typeof cleanup === 'function') {
      capture.cleanupList.push(cleanup);
    }
  },
  useSyncExternalStore: (
    subscribe: (onStoreChange: () => void) => () => void,
    getSnapshot: () => unknown,
  ) => {
    capture.lastSnapshot = getSnapshot();
    const unsubscribe = subscribe(() => {
      const nextSnapshot = getSnapshot();
      if (!Object.is(capture.lastSnapshot, nextSnapshot)) {
        capture.onStoreChangeCalls += 1;
        capture.lastSnapshot = nextSnapshot;
      }
    });
    capture.unsubscribeList.push(unsubscribe);
    return capture.lastSnapshot;
  },
}));

import { useInfiniteQuery, useSuspenseInfiniteQuery } from '../use-infinite-query.js';

function resetCapture(): void {
  capture.onStoreChangeCalls = 0;
  capture.lastSnapshot = undefined;
  while (capture.unsubscribeList.length > 0) {
    const unsubscribe = capture.unsubscribeList.pop();
    unsubscribe?.();
  }
  while (capture.cleanupList.length > 0) {
    const cleanup = capture.cleanupList.pop();
    cleanup?.();
  }
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  await Promise.resolve();
  await new Promise<void>((resolve) => queueMicrotask(resolve));
}

type Page = {
  items: string[];
  nextCursor: number | null;
};

function createMockInfiniteQueryFn() {
  const pages = new Map<number, Page>([
    [0, { items: ['a', 'b'], nextCursor: 1 }],
    [1, { items: ['c', 'd'], nextCursor: 2 }],
    [2, { items: ['e', 'f'], nextCursor: null }],
  ]);

  const queryFn = vi.fn(async ({ pageParam }: { pageParam: number; signal: AbortSignal }) => {
    const page = pages.get(pageParam);
    if (!page) {
      throw new Error(`Unknown page param: ${pageParam}`);
    }
    return page;
  });

  return { queryFn };
}

describe('@iostore/lynx: useInfiniteQuery', () => {
  it('fetches first page from pending state', async () => {
    resetCapture();
    const client = createQueryClient();
    const { queryFn } = createMockInfiniteQueryFn();

    const result = useInfiniteQuery({
      client,
      key: ['lynx', 'infinite', 'initial'],
      queryFn,
      initialPageParam: 0,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    });

    expect(result.status).toBe('pending');
    await flushAsync();

    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(result.query.getData()?.pages.length).toBe(1);
    expect(capture.onStoreChangeCalls).toBeGreaterThan(0);
  });

  it('fetches next page and updates cached query data', async () => {
    resetCapture();
    const client = createQueryClient();
    const { queryFn } = createMockInfiniteQueryFn();

    const result = useInfiniteQuery({
      client,
      key: ['lynx', 'infinite', 'next-page'],
      queryFn,
      initialPageParam: 0,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    });

    await flushAsync();

    const nextPagePromise = result.fetchNextPage();
    expect(result.query.getFlags().isFetchingNextPage).toBe(true);

    await nextPagePromise;
    await flushAsync();

    expect(result.query.getData()?.pages.length).toBe(2);
  });

  it('supports error state when query function fails', async () => {
    resetCapture();
    const client = createQueryClient();
    const queryFn = vi.fn(async () => {
      throw new Error('lynx infinite error');
    });

    const result = useInfiniteQuery({
      client,
      key: ['lynx', 'infinite', 'error'],
      queryFn,
      initialPageParam: 0,
      getNextPageParam: () => null,
      retry: 0,
    });

    await flushAsync();

    expect(result.query.getState().status).toBe('error');
    expect(result.query.getState().error).toBeInstanceOf(Error);
  });

  it('runs cancel/dispose on unmount when cancelOnUnmount is true', () => {
    resetCapture();
    const client = createQueryClient();
    const { queryFn } = createMockInfiniteQueryFn();

    const result = useInfiniteQuery({
      client,
      key: ['lynx', 'infinite', 'cleanup'],
      queryFn,
      initialPageParam: 0,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      cancelOnUnmount: true,
    });

    const cancelSpy = vi.spyOn(result.observer, 'cancel');
    const disposeSpy = vi.spyOn(result.observer, 'dispose');

    while (capture.cleanupList.length > 0) {
      const cleanup = capture.cleanupList.pop();
      cleanup?.();
    }

    expect(cancelSpy).toHaveBeenCalledTimes(1);
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });

  it('exports useSuspenseInfiniteQuery', () => {
    expect(typeof useSuspenseInfiniteQuery).toBe('function');
  });
});
