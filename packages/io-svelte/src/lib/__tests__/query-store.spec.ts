import type { IoQueryState } from '@iostore/store/query';

import { createQueryClient } from '@iostore/store/query';
import { describe, expect, it, vi } from 'vitest';

import { createQueryStore } from '../stores.js';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  await Promise.resolve();
  await new Promise<void>((resolve) => queueMicrotask(resolve));
}

describe('@iostore/svelte: query store', () => {
  it('fetches and updates readable state', async () => {
    const client = createQueryClient();
    const queryFn = vi.fn(async () => 3);
    const store = createQueryStore({
      client,
      key: ['svelte', 'query'],
      queryFn,
    });

    const seen: Array<IoQueryState<number>> = [];
    const unsubscribe = store.subscribe((state) => {
      seen.push(state);
    });

    await flushAsync();

    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(seen[0]?.status).toBe('pending');
    expect(store.getState().status).toBe('success');
    expect(store.getState().data).toBe(3);

    unsubscribe();
  });

  it('dedupes multiple subscribers for the same in-flight query', async () => {
    const client = createQueryClient();
    const deferred = createDeferred<number>();
    const queryFn = vi.fn(async () => deferred.promise);
    const store = createQueryStore({
      client,
      key: ['svelte', 'shared'],
      queryFn,
    });

    let leftState: IoQueryState<number> | undefined;
    let rightState: IoQueryState<number> | undefined;
    const unsubLeft = store.subscribe((state) => {
      leftState = state;
    });
    const unsubRight = store.subscribe((state) => {
      rightState = state;
    });

    expect(queryFn).toHaveBeenCalledTimes(1);
    deferred.resolve(8);
    await flushAsync();

    expect(leftState?.data).toBe(8);
    expect(rightState?.data).toBe(8);

    unsubLeft();
    unsubRight();
  });

  it('supports invalidate and refetch actions', async () => {
    const client = createQueryClient();
    let value = 0;
    const store = createQueryStore({
      client,
      key: ['svelte', 'actions'],
      queryFn: async () => {
        value += 1;
        return value;
      },
      staleTime: 10_000,
    });

    const unsubscribe = store.subscribe(() => undefined);
    await flushAsync();
    expect(store.getState().data).toBe(1);

    store.invalidate();
    await flushAsync();
    expect(store.getState().data).toBe(2);

    await store.refetch();
    await flushAsync();
    expect(store.getState().data).toBe(3);

    unsubscribe();
  });
});
