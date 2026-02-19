import { createQueryClient, createResource } from '@iostore/query';
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

import { useQuery, useResource } from '../use-query.js';

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
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('@iostore/lynx: useQuery', () => {
  it('fetches initial data', async () => {
    resetCapture();
    const client = createQueryClient();
    const queryFn = vi.fn(async () => 12);

    const result = useQuery({
      client,
      key: ['lynx', 'query'],
      queryFn,
    });

    expect(result.status).toBe('idle');
    await flushAsync();

    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(client.getQueryData<number>(['lynx', 'query'])).toBe(12);
    expect(capture.onStoreChangeCalls).toBeGreaterThan(0);
  });

  it('dedupes same key with shared client', async () => {
    resetCapture();
    const client = createQueryClient();
    const deferred = createDeferred<number>();
    const queryFn = vi.fn(async () => deferred.promise);

    useQuery({
      client,
      key: ['lynx', 'shared'],
      queryFn,
    });
    useQuery({
      client,
      key: ['lynx', 'shared'],
      queryFn,
    });

    expect(queryFn).toHaveBeenCalledTimes(1);
    deferred.resolve(9);
    await flushAsync();

    expect(client.getQueryData<number>(['lynx', 'shared'])).toBe(9);
  });
});

describe('@iostore/lynx: useResource', () => {
  it('supports invalidate and refetch', async () => {
    resetCapture();
    const client = createQueryClient();
    let value = 0;
    const resource = createResource({
      client,
      key: ['lynx', 'resource'],
      queryFn: async () => {
        value += 1;
        return value;
      },
      staleTime: 10_000,
    });

    const result = useResource(resource);
    await flushAsync();
    expect(client.getQueryData<number>(['lynx', 'resource'])).toBe(1);

    expect(result.invalidate()).toBe(1);
    useResource(resource);
    await flushAsync();
    expect(client.getQueryData<number>(['lynx', 'resource'])).toBe(2);

    await result.refetch();
    expect(client.getQueryData<number>(['lynx', 'resource'])).toBe(3);
  });
});
