import { describe, expect, it, vi } from 'vitest';

import { createQuery } from '../query.js';
import { createAbortError } from '../utils.js';
import { batch } from '../../utils/reactive/batch.js';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('@iostore/query createQuery', () => {
  it('transitions pending -> fetching -> success', async () => {
    const deferred = createDeferred<number>();
    const query = createQuery({
      key: ['users'],
      queryFn: async () => deferred.promise,
    });

    const transitions: string[] = [];
    const unsub = query.subscribe((state) => {
      transitions.push(`${state.status}:${state.fetchStatus}`);
    });

    const pending = query.fetch();
    expect(query.snapshot().fetchStatus).toBe('fetching');

    deferred.resolve(7);
    await expect(pending).resolves.toBe(7);

    expect(query.snapshot().status).toBe('success');
    expect(query.snapshot().data).toBe(7);
    expect(transitions).toContain('pending:fetching');
    expect(transitions).toContain('success:idle');

    unsub();
  });

  it('transitions pending -> fetching -> error', async () => {
    const failure = new Error('boom');
    const query = createQuery({
      key: ['error'],
      queryFn: async () => {
        throw failure;
      },
      retry: 0,
    });

    await expect(query.fetch()).rejects.toBe(failure);

    const state = query.snapshot();
    expect(state.status).toBe('error');
    expect(state.fetchStatus).toBe('idle');
    expect(state.error).toMatchObject({ message: 'boom' });
    expect(state.failureCount).toBe(1);
  });

  it('marks refetching while preserving success status', async () => {
    let run = 0;
    const deferred = createDeferred<number>();
    const query = createQuery({
      key: ['refetch'],
      queryFn: async () => {
        run += 1;
        if (run === 1) {
          return 1;
        }
        return deferred.promise;
      },
    });

    await query.fetch();

    const pending = query.fetch();
    expect(query.flags.isRefetching).toBe(true);
    expect(query.snapshot().status).toBe('success');

    deferred.resolve(2);
    await expect(pending).resolves.toBe(2);
    expect(query.snapshot().data).toBe(2);
  });

  it('cancels in-flight fetch and restores idle fetchStatus', async () => {
    const query = createQuery({
      key: ['cancel'],
      queryFn: ({ signal }) =>
        new Promise<number>((_resolve, reject) => {
          const onAbort = () => {
            signal.removeEventListener('abort', onAbort);
            reject(createAbortError());
          };
          signal.addEventListener('abort', onAbort, { once: true });
        }),
    });

    const pending = query.fetch();
    query.cancel();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(query.snapshot().fetchStatus).toBe('idle');
  });

  it('allows a new fetch after cancel even if previous run ignores abort signal', async () => {
    const deferred = createDeferred<number>();
    let calls = 0;
    const query = createQuery({
      key: ['cancel', 'ignore-signal'],
      queryFn: async () => {
        calls += 1;
        if (calls === 1) {
          return deferred.promise;
        }
        return 2;
      },
      retry: 0,
    });

    const first = query.fetch();
    query.cancel();

    expect(query.snapshot().fetchStatus).toBe('idle');

    await expect(query.fetch()).resolves.toBe(2);
    expect(query.snapshot().data).toBe(2);

    deferred.resolve(1);
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    expect(query.snapshot().data).toBe(2);
  });

  it('coalesces setData notifications inside batch()', () => {
    const query = createQuery({
      key: ['batch'],
      queryFn: async () => 0,
    });

    let calls = 0;
    const unsub = query.subscribe(() => {
      calls += 1;
    });

    batch(() => {
      query.setData(1);
      query.setData(2);
      query.setData(3);
    });

    expect(calls).toBe(1);
    expect(query.snapshot().data).toBe(3);

    unsub();
  });

  it('deduplicates concurrent fetch calls', async () => {
    const deferred = createDeferred<number>();
    const queryFn = vi.fn(async () => deferred.promise);
    const query = createQuery({
      key: ['dedupe'],
      queryFn,
    });

    const first = query.fetch();
    const second = query.fetch();

    expect(first).toBe(second);
    expect(queryFn).toHaveBeenCalledTimes(1);

    deferred.resolve(9);
    await expect(first).resolves.toBe(9);
    await expect(second).resolves.toBe(9);
  });

  it('derives flags from two-axis state correctly', () => {
    const query = createQuery({
      key: ['flags'],
      queryFn: async () => 1,
    });

    query.set({
      status: 'pending',
      fetchStatus: 'fetching',
      data: undefined,
      error: null,
      dataUpdatedAt: 0,
      errorUpdatedAt: 0,
      failureCount: 0,
    });
    expect(query.flags.isLoading).toBe(true);

    query.set({
      status: 'success',
      fetchStatus: 'fetching',
      data: 1,
      error: null,
      dataUpdatedAt: Date.now(),
      errorUpdatedAt: 0,
      failureCount: 0,
    });
    expect(query.flags.isRefetching).toBe(true);

    query.set({
      status: 'error',
      fetchStatus: 'idle',
      data: undefined,
      error: new Error('x'),
      dataUpdatedAt: 0,
      errorUpdatedAt: Date.now(),
      failureCount: 1,
    });
    expect(query.flags.isError).toBe(true);
  });

  it('read() supports suspense semantics', async () => {
    const deferred = createDeferred<number>();
    const query = createQuery({
      key: ['suspense'],
      queryFn: async () => deferred.promise,
    });

    const pending = query.fetch();

    let thrown: unknown;
    try {
      query.read();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(pending);

    deferred.resolve(42);
    await pending;
    expect(query.read()).toBe(42);

    const failure = new Error('suspense-error');
    const failedQuery = createQuery({
      key: ['suspense-error'],
      queryFn: async () => {
        throw failure;
      },
      retry: 0,
    });

    await expect(failedQuery.fetch()).rejects.toBe(failure);
    expect(() => failedQuery.read()).toThrow('suspense-error');
  });
});
