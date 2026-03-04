import type {
  UseInfiniteQueryResult,
  UseMutationResult,
  UseQueryResult,
  UseSuspenseQueryResult,
} from '../../index.js';
import type { ReactTestRenderer } from 'react-test-renderer';

import { createQueryClient } from '@iostore/store/query';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from '../../index.js';

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
      return React.createElement(
        'span',
        null,
        String(latest.data ?? 'loading'),
      );
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

  it('supports query handle input', async () => {
    const client = createQueryClient();
    const query = client.defineQuery({
      key: ['handle', 'input'],
      queryFn: async () => 5,
    });

    let latest: UseQueryResult<number> | undefined;
    const App = () => {
      latest = useQuery({
        client,
        query,
      });
      return React.createElement(
        'span',
        null,
        String(latest.data ?? 'loading'),
      );
    };

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = createRenderer(React.createElement(App));
    });
    await flushAsync();

    expect(latest?.data).toBe(5);

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
      renderer.update(React.createElement(App, { multiplier: 4 }) as never);
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

describe('@iostore/react: useSuspenseQuery (React.use)', () => {
  it('supports optional React.use suspense integration', async () => {
    const client = createQueryClient();
    const deferred = createDeferred<number>();

    const View = () => {
      const result = useSuspenseQuery(
        {
          client,
          key: ['react', 'suspense', 'use'],
          queryFn: async () => deferred.promise,
        },
        { useReactUseHook: true },
      );
      return React.createElement('span', null, String(result.data));
    };

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = createRenderer(
        React.createElement(
          React.Suspense,
          { fallback: React.createElement('span', null, 'loading') },
          React.createElement(View),
        ),
      );
    });

    expect(renderer.toJSON()).toMatchObject({
      type: 'span',
      children: ['loading'],
    });

    await act(async () => {
      deferred.resolve(11);
      await deferred.promise;
    });
    await flushAsync();

    expect(renderer.toJSON()).toMatchObject({ type: 'span', children: ['11'] });

    await act(async () => {
      renderer.unmount();
    });
  });
});

describe('@iostore/react: useInfiniteQuery', () => {
  it('fetches next pages and exposes flags', async () => {
    const client = createQueryClient();
    let latest: UseInfiniteQueryResult<number, Error, number> | undefined;

    const App = () => {
      latest = useInfiniteQuery({
        client,
        key: ['react', 'infinite'],
        initialPageParam: 1,
        queryFn: async ({ pageParam }) => pageParam,
        getNextPageParam: (lastPage) => (lastPage < 2 ? lastPage + 1 : null),
      });
      return React.createElement(
        'span',
        null,
        String(latest.data?.pages.length ?? 0),
      );
    };

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = createRenderer(React.createElement(App));
    });
    await flushAsync();

    expect(latest?.data?.pages).toEqual([1]);
    expect(latest?.hasNextPage).toBe(true);

    await act(async () => {
      await latest?.fetchNextPage();
    });

    expect(latest?.data?.pages).toEqual([1, 2]);
    expect(latest?.hasNextPage).toBe(false);

    await act(async () => {
      renderer.unmount();
    });
  });
});

describe('@iostore/react: useSuspenseInfiniteQuery', () => {
  it('suspends until first page resolves', async () => {
    const client = createQueryClient();
    const deferred = createDeferred<number>();
    let latestPages: number[] | undefined;

    const View = () => {
      const result = useSuspenseInfiniteQuery({
        client,
        key: ['react', 'suspense-infinite'],
        initialPageParam: 0,
        queryFn: async () => deferred.promise,
        getNextPageParam: () => null,
      });
      if (result.data) {
        latestPages = result.data.pages as unknown as number[];
      }
      return React.createElement('span', null, 'ready');
    };

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = createRenderer(
        React.createElement(
          React.Suspense,
          { fallback: React.createElement('span', null, 'loading') },
          React.createElement(View),
        ),
      );
    });

    expect(renderer.toJSON()).toMatchObject({
      type: 'span',
      children: ['loading'],
    });

    await act(async () => {
      deferred.resolve(7);
      await deferred.promise;
    });
    await flushAsync();

    expect(latestPages).toEqual([7]);

    await act(async () => {
      renderer.unmount();
    });
  });

  it('supports optional React.use suspense integration', async () => {
    const client = createQueryClient();
    const deferred = createDeferred<number>();

    const View = () => {
      const result = useSuspenseInfiniteQuery(
        {
          client,
          key: ['react', 'suspense-infinite', 'use'],
          initialPageParam: 0,
          queryFn: async () => deferred.promise,
          getNextPageParam: () => null,
        },
        { useReactUseHook: true },
      );
      return React.createElement('span', null, String(result.data.pages[0]));
    };

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = createRenderer(
        React.createElement(
          React.Suspense,
          { fallback: React.createElement('span', null, 'loading') },
          React.createElement(View),
        ),
      );
    });

    expect(renderer.toJSON()).toMatchObject({
      type: 'span',
      children: ['loading'],
    });

    await act(async () => {
      deferred.resolve(8);
      await deferred.promise;
    });
    await flushAsync();

    expect(renderer.toJSON()).toMatchObject({ type: 'span', children: ['8'] });

    await act(async () => {
      renderer.unmount();
    });
  });
});
