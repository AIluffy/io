import { createQueryClient } from '@iostore/store/query';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';

import {
  useInfiniteQuery,
  useSuspenseInfiniteQuery,
  type UseInfiniteQueryResult,
} from '../../index.js';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}


const createRenderer = (element: unknown): TestRenderer.ReactTestRenderer =>
  TestRenderer.create(element as never);

async function flushAsync(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('useInfiniteQuery', () => {
  it('loads first page and updates loading/success states', async () => {
    const client = createQueryClient();
    const deferred = createDeferred<number>();
    let result!: UseInfiniteQueryResult<number, Error, number>;

    const App = () => {
      result = useInfiniteQuery({
        client,
        key: ['hook', 'initial'],
        initialPageParam: 1,
        queryFn: async () => deferred.promise,
        getNextPageParam: () => null,
      });
      return React.createElement('span', null, String(result.data?.pages.length ?? 0));
    };

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = createRenderer(React.createElement(App));
    });

    expect(result.isLoading).toBe(true);

    await act(async () => {
      deferred.resolve(1);
      await deferred.promise;
    });
    await flushAsync();

    expect(result.data?.pages.length).toBe(1);
    expect(result.isLoading).toBe(false);
    expect(result.isSuccess).toBe(true);

    await act(async () => {
      renderer.unmount();
    });
  });

  it('supports next/previous/refetch and flags', async () => {
    const client = createQueryClient();
    let result!: UseInfiniteQueryResult<number, Error, number>;

    const App = () => {
      result = useInfiniteQuery({
        client,
        key: ['hook', 'paging'],
        initialPageParam: 1,
        queryFn: async ({ pageParam }) => pageParam,
        getNextPageParam: (lastPage) => (lastPage < 2 ? lastPage + 1 : undefined),
        getPreviousPageParam: (firstPage) => (firstPage > 1 ? firstPage - 1 : undefined),
      });
      return React.createElement('span', null, String(result.data?.pages.join(',') ?? ''));
    };

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = createRenderer(React.createElement(App));
    });
    await flushAsync();

    expect(result.hasNextPage).toBe(true);

    await act(async () => {
      await result.fetchNextPage();
    });

    expect(result.data?.pages).toEqual([1, 2]);
    expect(result.isFetchingNextPage).toBe(false);
    expect(result.hasNextPage).toBe(false);
    expect(result.hasPreviousPage).toBe(false);

    await act(async () => {
      await result.fetchPreviousPage();
    });
    expect(result.data?.pages).toEqual([1, 2]);

    await act(async () => {
      await result.refetch();
    });
    expect(result.isRefetching).toBe(false);
    expect(result.data?.pages).toEqual([1, 2]);

    await act(async () => {
      renderer.unmount();
    });
  });

  it('keeps previously loaded pages when a later page errors', async () => {
    const client = createQueryClient();
    let result!: UseInfiniteQueryResult<number, Error, number>;

    const App = () => {
      result = useInfiniteQuery({
        client,
        key: ['hook', 'error'],
        initialPageParam: 1,
        queryFn: async ({ pageParam }) => {
          if (pageParam === 2) {
            throw new Error('boom-page-2');
          }
          return pageParam;
        },
        getNextPageParam: (lastPage) => (lastPage < 2 ? lastPage + 1 : undefined),
      });
      return React.createElement('span', null, String(result.data?.pages.join(',') ?? ''));
    };

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = createRenderer(React.createElement(App));
    });
    await flushAsync();

    await act(async () => {
      await result.fetchNextPage().catch(() => undefined);
    });

    expect(result.isError).toBe(true);
    expect(result.error?.message).toBe('boom-page-2');
    expect(result.data?.pages).toEqual([1]);

    await act(async () => {
      renderer.unmount();
    });
  });

  it('cancels on unmount when cancelOnUnmount is true', async () => {
    const client = createQueryClient();
    const deferred = createDeferred<number>();
    let signalRef: AbortSignal | undefined;

    const App = () => {
      useInfiniteQuery({
        client,
        key: ['hook', 'cancel-unmount'],
        cancelOnUnmount: true,
        initialPageParam: 1,
        queryFn: async ({ signal }) => {
          signalRef = signal;
          return deferred.promise;
        },
        getNextPageParam: () => undefined,
      });
      return React.createElement('span', null, 'x');
    };

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = createRenderer(React.createElement(App));
    });

    await act(async () => {
      renderer.unmount();
    });

    expect(signalRef?.aborted).toBe(true);
  });

  it('creates a fresh query when key changes', async () => {
    const client = createQueryClient();
    let result!: UseInfiniteQueryResult<number, Error, number>;

    const App = ({ id }: { id: number }) => {
      result = useInfiniteQuery({
        client,
        key: ['hook', 'key-change', id],
        initialPageParam: id,
        queryFn: async ({ pageParam }) => pageParam,
        getNextPageParam: () => undefined,
      });
      return React.createElement('span', null, String(result.data?.pages[0] ?? 0));
    };

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = createRenderer(React.createElement(App, { id: 1 }));
    });
    await flushAsync();
    expect(result.data?.pages).toEqual([1]);

    await act(async () => {
      renderer.update(React.createElement(App, { id: 2 }) as never);
    });
    await flushAsync();
    expect(result.data?.pages).toEqual([2]);

    await act(async () => {
      renderer.unmount();
    });
  });
});

describe('useSuspenseInfiniteQuery', () => {
  it('throws promise when pending and error when failed, returns data on success', async () => {
    const client = createQueryClient();
    const deferred = createDeferred<number>();
    let readValue: number | undefined;

    const View = ({ mode }: { mode: 'success' | 'error' }) => {
      const result = useSuspenseInfiniteQuery({
        client,
        key: ['hook', 'suspense', mode],
        initialPageParam: 1,
        queryFn: async () => {
          if (mode === 'error') {
            throw new Error('suspense-error');
          }
          return deferred.promise;
        },
        getNextPageParam: () => undefined,
      });
      if (result.data) {
        readValue = (result.data.pages as unknown as number[])[0];
      }
      return React.createElement('span', null, String(readValue ?? ''));
    };

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = createRenderer(
        React.createElement(
          React.Suspense,
          { fallback: React.createElement('span', null, 'loading') },
          React.createElement(View, { mode: 'success' }),
        ),
      );
    });

    expect(renderer.toJSON()).toMatchObject({ type: 'span', children: ['loading'] });

    await act(async () => {
      deferred.resolve(9);
      await deferred.promise;
    });
    await flushAsync();

    expect(readValue).toBe(9);

    await expect(async () => {
      await act(async () => {
        renderer.update(
          React.createElement(
            React.Suspense,
            { fallback: React.createElement('span', null, 'loading') },
            React.createElement(View, { mode: 'error' }),
          ) as never,
        );
      });
      await flushAsync();
    }).rejects.toThrow('suspense-error');


    await act(async () => {
      renderer.unmount();
    });
  });
});
