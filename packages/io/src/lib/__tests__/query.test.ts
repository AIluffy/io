import { describe, expect, it, vi } from 'vitest';

import { onError } from '../utils/debug/debug.js';
import {
  createQueryClient,
  getFocusManager,
  getOnlineManager,
} from '../query/index.js';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('@iostore/query observer runtime', () => {
  it('transitions pending -> fetching -> success', async () => {
    const client = createQueryClient();
    const deferred = createDeferred<number>();

    const query = client.defineQuery({
      key: ['users'],
      queryFn: async () => deferred.promise,
    });

    const observer = client.observeQuery({
      query,
      enabled: false,
    });

    const transitions: string[] = [];
    const unsub = observer.subscribe((state) => {
      transitions.push(`${state.status}:${state.fetchStatus}`);
    });

    const pending = observer.fetch();
    expect(observer.snapshot().fetchStatus).toBe('fetching');

    deferred.resolve(7);
    await expect(pending).resolves.toBe(7);

    expect(observer.snapshot().status).toBe('success');
    expect(observer.snapshot().data).toBe(7);
    expect(transitions).toContain('pending:fetching');
    expect(transitions).toContain('success:idle');

    unsub();
    observer.dispose();
  });

  it('supports observer-specific select and callbacks without polluting query definition', async () => {
    const client = createQueryClient();
    const successA = vi.fn();
    const successB = vi.fn();

    const query = client.defineQuery<number>({
      key: ['observer', 'isolation'],
      queryFn: async () => 3,
      staleTime: Number.POSITIVE_INFINITY,
    });

    const observerA = client.observeQuery<number, Error, number>({
      query,
      onSuccess: successA,
    });
    const observerB = client.observeQuery<number, Error, string>({
      query,
      select: (value) => `value:${value ?? 0}`,
      onSuccess: successB,
    });

    await observerA.refetch();

    expect(observerA.snapshot().data).toBe(3);
    expect(observerB.snapshot().data).toBe('value:3');
    expect(successA).toHaveBeenCalledWith(3);
    expect(successB).toHaveBeenCalledWith('value:3');

    observerA.dispose();
    observerB.dispose();
  });

  it('throws hard error when same key is defined with different queryFn', () => {
    const client = createQueryClient();

    client.defineQuery({
      key: ['conflict'],
      queryFn: async () => 1,
    });

    expect(() => {
      client.defineQuery({
        key: ['conflict'],
        queryFn: async () => 2,
      });
    }).toThrow('conflicting queryFn');
  });

  it('keeps placeholderData observer-only', async () => {
    const client = createQueryClient();
    const deferred = createDeferred<number>();

    const query = client.defineQuery({
      key: ['placeholder', 'observer-only'],
      queryFn: async () => deferred.promise,
    });

    const observer = client.observeQuery({
      query,
      placeholderData: 99,
    });

    expect(observer.snapshot().data).toBe(99);
    expect(observer.snapshot().isPlaceholderData).toBe(true);
    expect(query.getState().data).toBeUndefined();
    expect(query.getState().dataUpdatedAt).toBe(0);

    deferred.resolve(5);
    await expect(observer.fetch()).resolves.toBe(5);

    expect(observer.snapshot().data).toBe(5);
    expect(observer.snapshot().isPlaceholderData).toBe(false);
    expect(query.getState().dataUpdatedAt).toBeGreaterThan(0);

    observer.dispose();
  });

  it('tracks retry failureCount and failureReason during retries', async () => {
    const client = createQueryClient();
    let attempts = 0;
    const observer = client.observeQuery<number>({
      query: {
        key: ['retry', 'observable'],
        retry: 2,
        retryDelay: () => 0,
        queryFn: async () => {
          attempts += 1;
          if (attempts < 3) {
            throw new Error(`retry-${attempts}`);
          }
          return 42;
        },
      },
      enabled: false,
    });

    await expect(observer.fetch()).resolves.toBe(42);

    const snapshot = observer.snapshot();
    expect(attempts).toBe(3);
    expect(snapshot.status).toBe('success');
    expect(snapshot.failureCount).toBe(0);
    expect(snapshot.failureReason).toBeNull();

    observer.dispose();
  });

  it('hydrates and dehydrates query state', async () => {
    const source = createQueryClient();
    const sourceObserver = source.observeQuery<number>({
      query: {
        key: ['hydrate', 'counter'],
        queryFn: async () => 8,
      },
    });

    await sourceObserver.fetch();

    const dehydrated = source.dehydrate();
    expect(dehydrated.queries).toHaveLength(1);

    const target = createQueryClient();
    target.hydrate(dehydrated);

    const targetState = target.getQueryState<number>(['hydrate', 'counter']);
    expect(targetState?.status).toBe('success');
    expect(targetState?.data).toBe(8);

    sourceObserver.dispose();
  });

  it('removes inactive queries after gcTime', async () => {
    vi.useFakeTimers();

    const client = createQueryClient({
      defaultGcTime: 50,
    });

    const observer = client.observeQuery<number>({
      query: {
        key: ['gc'],
        queryFn: async () => 1,
      },
    });

    await observer.fetch();
    observer.dispose();

    await vi.advanceTimersByTimeAsync(60);
    expect(client.getQuery(['gc'])).toBeUndefined();

    vi.useRealTimers();
  });

  it('supports refetch on window focus and reconnect', async () => {
    const focusManager = getFocusManager();
    const onlineManager = getOnlineManager();

    const client = createQueryClient({
      defaultRefetchOnMount: false,
    });

    let count = 0;
    const observer = client.observeQuery<number>({
      query: {
        key: ['focus-online'],
        queryFn: async () => {
          count += 1;
          return count;
        },
        staleTime: 0,
      },
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    });

    await observer.fetch();
    expect(observer.snapshot().data).toBe(1);

    focusManager.setFocused(false);
    focusManager.setFocused(true);
    await Promise.resolve();
    await Promise.resolve();

    onlineManager.setOnline(false);
    onlineManager.setOnline(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(observer.snapshot().data).toBeGreaterThanOrEqual(2);

    observer.dispose();
  });

  it('annotates query updates with action/meta during fetch lifecycle', async () => {
    const client = createQueryClient();
    const query = client.defineQuery<number>({
      key: ['action-meta'],
      queryFn: async () => 1,
    });

    const updates: Array<{ action?: string; meta?: unknown }> = [];
    const unsub = query.subscribeUpdate((update) => {
      updates.push({
        action: update.action,
        meta: update.meta,
      });
    });

    await expect(query.fetch(true)).resolves.toBe(1);

    unsub();

    const start = updates.find((update) => update.action === 'query.fetch.start');
    const success = updates.find((update) => update.action === 'query.fetch.success');

    expect(start).toBeDefined();
    expect(success).toBeDefined();
    expect(start?.meta).toMatchObject({
      force: true,
      keyHash: query.keyHash,
    });
    expect(success?.meta).toMatchObject({
      keyHash: query.keyHash,
    });
  });

  it('routes observer background errors to IO onError listeners', async () => {
    const client = createQueryClient();
    const observer = client.observeQuery<number>({
      query: {
        key: ['observer-background-error'],
        queryFn: async () => {
          throw new Error('observer-background-error');
        },
        retry: 0,
      },
      enabled: false,
    });

    const events: Array<{ error: unknown; operation: string }> = [];
    const unsub = onError(observer, (error, _path, operation) => {
      events.push({
        error,
        operation,
      });
    });

    observer.setOptions({
      enabled: true,
    });
    await vi.waitFor(() => {
      expect(events).toHaveLength(1);
    });
    expect(events[0].error).toMatchObject({
      message: 'observer-background-error',
    });
    expect(events[0].operation).toBe('applyUpdate');

    unsub();
    observer.dispose();
  });
});
