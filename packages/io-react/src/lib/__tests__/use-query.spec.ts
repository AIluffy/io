import type {
  UseMutationResult,
  UseQueryResult,
  UseSuspenseQueryResult,
} from '../use-query.js';
import type { ReactTestRenderer } from 'react-test-renderer';

import { createQueryClient } from '@iostore/store/query';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

import { useMutation, useQuery, useSuspenseQuery } from '../use-query.js';

const createRenderer = (element: unknown): ReactTestRenderer =>
  TestRenderer.create(element as never);

async function flushAsync(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
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

describe('@iostore/react: useQuery', () => {
  it('fetches query and updates state', async () => {
    const client = createQueryClient();
    const queryFn = vi.fn(async () => 42);
    let latest: UseQueryResult<number> | undefined;

    const App = () => {
      latest = useQuery({
        client,
        key: ['react', 'query'],
        queryFn,
      });
      return React.createElement('span', null, String(latest.data ?? 'loading'));
    };

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = createRenderer(React.createElement(App));
    });
    await flushAsync();

    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(latest?.status).toBe('success');
    expect(latest?.data).toBe(42);

    await act(async () => {
      renderer.unmount();
    });
  });

  it('dedupes same key across components with shared client', async () => {
    const client = createQueryClient();
    const deferred = createDeferred<number>();
    const queryFn = vi.fn(async () => deferred.promise);
    let left: UseQueryResult<number> | undefined;
    let right: UseQueryResult<number> | undefined;

    const Left = () => {
      left = useQuery({
        client,
        key: ['shared', 1],
        queryFn,
      });
      return React.createElement('span', null, String(left.data ?? 'loading'));
    };

    const Right = () => {
      right = useQuery({
        client,
        key: ['shared', 1],
        queryFn,
      });
      return React.createElement('span', null, String(right.data ?? 'loading'));
    };

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = createRenderer(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(Left),
          React.createElement(Right),
        ),
      );
    });

    expect(queryFn).toHaveBeenCalledTimes(1);
    deferred.resolve(9);
    await flushAsync();

    expect(left?.data).toBe(9);
    expect(right?.data).toBe(9);

    await act(async () => {
      renderer.unmount();
    });
  });

  it('does not trigger an extra fetch when autoFetch is already enabled', async () => {
    const client = createQueryClient();
    const queryFn = vi.fn(async () => 5);
    await client
      .query({
        key: ['react', 'auto-fetch'],
        queryFn,
        autoFetch: true,
      })
      .fetch();

    expect(queryFn).toHaveBeenCalledTimes(1);

    const App = () => {
      useQuery({
        client,
        key: ['react', 'auto-fetch'],
        queryFn,
        autoFetch: true,
      });
      return React.createElement('span', null, 'ok');
    };

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = createRenderer(React.createElement(App));
    });
    await flushAsync();

    expect(queryFn).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer.unmount();
    });
  });
});

describe('@iostore/react: useMutation', () => {
  it('exposes mutate and mutateAsync', async () => {
    let latest: UseMutationResult<number, number> | undefined;

    const App = () => {
      latest = useMutation<number, number>({
        mutationFn: async (value) => value + 1,
      });
      return React.createElement('span', null, latest.status);
    };

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = createRenderer(React.createElement(App));
    });

    await act(async () => {
      latest?.mutate(2);
    });
    await flushAsync();

    expect(latest?.data).toBe(3);

    await act(async () => {
      const value = await latest?.mutateAsync(4);
      expect(value).toBe(5);
    });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('uses latest mutation options across rerenders', async () => {
    const values: number[] = [];
    let latest: UseMutationResult<number, number> | undefined;

    const App = ({ multiplier }: { multiplier: number }) => {
      latest = useMutation<number, number>({
        mutationFn: async (value) => value * multiplier,
        onSuccess: (data) => {
          values.push(data);
        },
      });
      return React.createElement('span', null, latest.status);
    };

    const getLatest = (): UseMutationResult<number, number> => {
      if (!latest) {
        throw new Error('expected mutation result');
      }
      return latest;
    };

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = createRenderer(React.createElement(App, { multiplier: 2 }));
    });

    await act(async () => {
      const first = await getLatest().mutateAsync(3);
      expect(first).toBe(6);
    });

    await act(async () => {
      renderer.update(React.createElement(App, { multiplier: 4 }));
    });

    await act(async () => {
      const second = await getLatest().mutateAsync(3);
      expect(second).toBe(12);
    });

    expect(values).toEqual([6, 12]);

    await act(async () => {
      renderer.unmount();
    });
  });
});

describe('@iostore/react: useSuspenseQuery', () => {
  it('suspends until data resolves', async () => {
    const client = createQueryClient();
    const deferred = createDeferred<number>();
    let latest: UseSuspenseQueryResult<number> | undefined;

    const View = () => {
      latest = useSuspenseQuery({
        client,
        key: ['react', 'suspense'],
        queryFn: async () => deferred.promise,
      });
      return React.createElement('span', null, String(latest.data));
    };

    const fallback = React.createElement('span', null, 'loading');

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = createRenderer(
        React.createElement(
          React.Suspense,
          { fallback },
          React.createElement(View),
        ),
      );
    });

    expect(renderer.toJSON()).toMatchObject({
      type: 'span',
      children: ['loading'],
    });

    await act(async () => {
      deferred.resolve(9);
      await deferred.promise;
    });
    await flushAsync();

    expect(latest?.data).toBe(9);
    expect(renderer.toJSON()).toMatchObject({
      type: 'span',
      children: ['9'],
    });

    await act(async () => {
      renderer.unmount();
    });
  });
});
