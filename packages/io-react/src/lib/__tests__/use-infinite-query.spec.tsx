import type { IoQueryClient } from '@iostore/store/query';
import type { ReactTestRenderer } from 'react-test-renderer';

import { createQueryClient, resetDefaultClient } from '@iostore/store/query';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useInfiniteQuery } from '../use-infinite-query.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
