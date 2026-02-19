import { describe, expect, it, vi } from 'vitest';
import { createQueryClient, type IoQueryFnContext } from '../query-client.js';
import { createResource } from '../resource.js';

function abortError(): Error {
  const error = new Error('aborted');
  error.name = 'AbortError';
  return error;
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

describe('@iostore/query: createQueryClient', () => {
  it('caches and reuses fresh data', async () => {
    const client = createQueryClient();
    let count = 0;
    const queryFn = vi.fn(async () => {
      count += 1;
      return count;
    });

    const first = await client.fetchQuery({
      key: ['user', 1],
      queryFn,
      staleTime: 10_000,
    });
    const second = await client.fetchQuery({
      key: ['user', 1],
      queryFn,
      staleTime: 10_000,
    });

    expect(first).toBe(1);
    expect(second).toBe(1);
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it('dedupes concurrent requests with the same key', async () => {
    const client = createQueryClient();
    const deferred = createDeferred<number>();
    const queryFn = vi.fn(({ signal }: IoQueryFnContext) => {
      return new Promise<number>((resolve, reject) => {
        const onAbort = () => {
          reject(abortError());
        };
        signal.addEventListener('abort', onAbort, { once: true });

        deferred.promise
          .then((value) => {
            resolve(value);
          })
          .catch((error: unknown) => {
            reject(error);
          })
          .finally(() => {
            signal.removeEventListener('abort', onAbort);
          });
      });
    });

    const first = client.fetchQuery({
      key: ['post', 1],
      queryFn,
    });
    const second = client.fetchQuery({
      key: ['post', 1],
      queryFn,
    });

    expect(queryFn).toHaveBeenCalledTimes(1);
    deferred.resolve(7);

    await expect(first).resolves.toBe(7);
    await expect(second).resolves.toBe(7);
  });

  it('invalidates query and refetches', async () => {
    const client = createQueryClient();
    let value = 0;
    const queryFn = vi.fn(async () => {
      value += 1;
      return value;
    });

    await client.fetchQuery({
      key: ['todo'],
      queryFn,
      staleTime: 10_000,
    });
    expect(
      client.invalidateQueries({
        key: ['todo'],
        exact: true,
      }),
    ).toBe(1);

    const next = await client.fetchQuery({
      key: ['todo'],
      queryFn,
      staleTime: 10_000,
    });

    expect(next).toBe(2);
    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it('retries failed requests', async () => {
    const client = createQueryClient();
    let attempt = 0;
    const queryFn = vi.fn(async () => {
      attempt += 1;
      if (attempt < 3) {
        throw new Error(`fail-${attempt}`);
      }
      return 'ok';
    });

    const result = await client.fetchQuery({
      key: ['retry'],
      queryFn,
      retry: 2,
      retryDelay: 0,
    });

    expect(result).toBe('ok');
    expect(queryFn).toHaveBeenCalledTimes(3);
  });

  it('cancels in-flight requests', async () => {
    const client = createQueryClient();
    const queryFn = vi.fn(({ signal }: IoQueryFnContext) => {
      return new Promise<number>((resolve, reject) => {
        const onAbort = () => {
          clearTimeout(timer);
          signal.removeEventListener('abort', onAbort);
          reject(abortError());
        };
        const timer = setTimeout(() => {
          signal.removeEventListener('abort', onAbort);
          resolve(1);
        }, 30_000);
        signal.addEventListener('abort', onAbort, { once: true });
      });
    });

    const pending = client.fetchQuery({
      key: ['cancel'],
      queryFn,
    });

    const cancelled = client.cancelQueries({
      key: ['cancel'],
      exact: true,
    });

    expect(cancelled).toBe(1);
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(client.getQueryState(['cancel'])?.fetchStatus).toBe('idle');
  });

  it('prefetches and warms cache', async () => {
    const client = createQueryClient();
    const queryFn = vi.fn(async () => 'prefetched');

    await client.prefetchQuery({
      key: ['prefetch'],
      queryFn,
      staleTime: 1_000,
    });

    expect(client.getQueryData<string>(['prefetch'])).toBe('prefetched');

    const value = await client.fetchQuery({
      key: ['prefetch'],
      queryFn,
      staleTime: 1_000,
    });

    expect(value).toBe('prefetched');
    expect(queryFn).toHaveBeenCalledTimes(1);
  });
});

describe('@iostore/query: createResource', () => {
  it('delegates fetch/prefetch/invalidate and exposes state updates', async () => {
    const client = createQueryClient();
    let value = 0;
    const queryFn = vi.fn(async () => {
      value += 1;
      return value;
    });

    const resource = createResource({
      client,
      key: ['resource'],
      queryFn,
      staleTime: 1_000,
    });

    const states: string[] = [];
    const unsubscribe = resource.subscribe((state) => {
      states.push(`${state.status}:${state.fetchStatus}`);
    });

    const fetched = await resource.fetch();
    expect(fetched).toBe(1);
    expect(resource.read()).toBe(1);
    expect(resource.getState().status).toBe('success');
    expect(states).toContain('loading:fetching');
    expect(states).toContain('success:idle');

    expect(resource.invalidate()).toBe(1);
    await resource.prefetch();
    expect(queryFn).toHaveBeenCalledTimes(2);

    unsubscribe();
  });
});
