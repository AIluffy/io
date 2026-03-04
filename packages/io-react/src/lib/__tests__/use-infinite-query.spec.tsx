import type { IoQueryClient } from '@iostore/store/query';
import type { ReactTestRenderer } from 'react-test-renderer';

import { createQueryClient, resetDefaultClient } from '@iostore/store/query';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useInfiniteQuery,
  useSuspenseInfiniteQuery,
} from '../use-infinite-query.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

const createRenderer = (element: unknown): ReactTestRenderer =>
  TestRenderer.create(element as never);

async function flushAsync(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('useInfiniteQuery (react)', () => {
  let client: IoQueryClient;

  beforeEach(() => {
    client = createQueryClient({ defaultRetry: 0, defaultStaleTime: 0 });
  });

  afterEach(() => {
    client.clear();
    resetDefaultClient();
  });

  it('pending to success and fetchNextPage works', async () => {
    let latest:
      | ReturnType<
          typeof useInfiniteQuery<{ items: number[]; next: number | null }, Error, number>
        >
      | undefined;

    const App = () => {
      latest = useInfiniteQuery({
        key: ['todos'],
        queryFn: async ({ pageParam }) => ({
          items: [pageParam],
          next: pageParam < 1 ? pageParam + 1 : null,
        }),
        initialPageParam: 0,
        getNextPageParam: (last) => last.next,
        client,
      });
      return React.createElement('span', null, String(latest.data?.pages.length ?? 0));
    };

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = createRenderer(React.createElement(App));
    });

    await flushAsync();
    expect(latest?.status).toBe('success');

    await act(async () => {
      await latest?.fetchNextPage();
    });
    expect(latest?.data?.pages).toHaveLength(2);

    await act(async () => {
      renderer.unmount();
    });
  });

  it('enabled false does not run queryFn and supports handle mode', async () => {
    const queryFn = vi.fn(async ({ pageParam }: { pageParam: number }) => ({
      items: [pageParam],
      next: null,
    }));

    const handle = client.defineInfiniteQuery({
      key: ['handle-mode'],
      queryFn: async ({ pageParam }) => ({ items: [pageParam], next: null }),
      initialPageParam: 0,
      getNextPageParam: () => null,
    });

    const Disabled = () => {
      useInfiniteQuery({
        key: ['disabled'],
        queryFn,
        initialPageParam: 0,
        getNextPageParam: () => null,
        client,
        enabled: false,
      });
      return null;
    };

    const HandleMode = () => {
      const result = useInfiniteQuery({ query: handle, client });
      return React.createElement('span', null, result.status);
    };

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = createRenderer(
        React.createElement(React.Fragment, null, [
          React.createElement(Disabled, { key: 'd' }),
          React.createElement(HandleMode, { key: 'h' }),
        ]),
      );
    });

    await sleep(30);
    expect(queryFn).not.toHaveBeenCalled();

    await act(async () => {
      renderer.unmount();
    });
  });
});

describe('useSuspenseInfiniteQuery (react)', () => {
  let client: IoQueryClient;

  beforeEach(() => {
    client = createQueryClient({ defaultRetry: 0, defaultStaleTime: 0 });
  });

  afterEach(() => {
    client.clear();
    resetDefaultClient();
  });

  it('does not trigger duplicate fetches across suspense re-renders', async () => {
    const deferred = createDeferred<{ items: number[]; next: null }>();
    const queryFn = vi.fn(async () => deferred.promise);

    const View = ({ tick }: { tick: number }) => {
      const result = useSuspenseInfiniteQuery({
        key: ['suspense', 'infinite', 'rerender'],
        queryFn,
        staleTime: Number.POSITIVE_INFINITY,
        refetchOnMount: false,
        initialPageParam: 0,
        getNextPageParam: () => undefined,
        client,
      });
      return React.createElement('span', null, `${tick}:${result.data.pages.length}`);
    };

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = createRenderer(
        React.createElement(
          React.Suspense,
          { fallback: React.createElement('span', null, 'loading') },
          React.createElement(View, { tick: 0 }),
        ),
      );
    });

    await act(async () => {
      renderer.update(
        React.createElement(
          React.Suspense,
          { fallback: React.createElement('span', null, 'loading') },
          React.createElement(View, { tick: 1 }),
        ) as never,
      );
      renderer.update(
        React.createElement(
          React.Suspense,
          { fallback: React.createElement('span', null, 'loading') },
          React.createElement(View, { tick: 2 }),
        ) as never,
      );
    });

    expect(queryFn).toHaveBeenCalledTimes(1);

    await act(async () => {
      deferred.resolve({ items: [1], next: null });
      await deferred.promise;
    });
    await flushAsync();

    expect(renderer.toJSON()).toMatchObject({ type: 'span', children: ['2:1'] });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('starts first page fetch on initial mount', async () => {
    const queryFn = vi.fn(async ({ pageParam }: { pageParam: number }) => ({
      items: [pageParam],
      next: null,
    }));

    const View = () => {
      const result = useSuspenseInfiniteQuery({
        key: ['suspense', 'infinite', 'initial'],
        queryFn,
        staleTime: Number.POSITIVE_INFINITY,
        refetchOnMount: false,
        initialPageParam: 0,
        getNextPageParam: () => undefined,
        client,
      });
      return React.createElement('span', null, String(result.data.pages[0]?.items[0]));
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

    await flushAsync();

    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(renderer.toJSON()).toMatchObject({ type: 'span', children: ['0'] });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('keeps a stable pending promise reference in strict mode', async () => {
    const deferred = createDeferred<{ items: number[]; next: null }>();
    const queryFn = vi.fn(async () => deferred.promise);
    const pendingPromises: Promise<unknown>[] = [];

    const Probe = ({ tick }: { tick: number }) => {
      try {
        useSuspenseInfiniteQuery({
          key: ['suspense', 'infinite', 'strict'],
          queryFn,
          staleTime: Number.POSITIVE_INFINITY,
          refetchOnMount: false,
          initialPageParam: 0,
          getNextPageParam: () => undefined,
          client,
        });
      } catch (error) {
        if (error instanceof Promise) {
          pendingPromises.push(error);
          return React.createElement('span', null, `pending:${tick}`);
        }
        throw error;
      }

      return React.createElement('span', null, `ready:${tick}`);
    };

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = createRenderer(
        React.createElement(
          React.StrictMode,
          null,
          React.createElement(Probe, { tick: 0 }),
        ),
      );
    });

    await act(async () => {
      renderer.update(
        React.createElement(
          React.StrictMode,
          null,
          React.createElement(Probe, { tick: 1 }),
        ) as never,
      );
      renderer.update(
        React.createElement(
          React.StrictMode,
          null,
          React.createElement(Probe, { tick: 2 }),
        ) as never,
      );
    });

    expect(pendingPromises.length).toBeGreaterThanOrEqual(2);
    expect(Object.is(pendingPromises[0], pendingPromises[1])).toBe(true);
    expect(queryFn).toHaveBeenCalledTimes(1);

    await act(async () => {
      deferred.resolve({ items: [1], next: null });
      await deferred.promise;
    });
    await flushAsync();

    await act(async () => {
      renderer.unmount();
    });
  });
});
