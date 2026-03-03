import {
  createQueryClient,
  type IoInfiniteQueryHandle,
} from '@iostore/store/query';
import React, { useEffect, useRef } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';

import { useInfiniteQuery } from '../../index.js';

type ObserverCallback = (entries: Array<{ isIntersecting: boolean }>) => void;

let latestIntersectionCallback: ObserverCallback | null = null;

class FakeIntersectionObserver {
  constructor(callback: ObserverCallback) {
    latestIntersectionCallback = callback;
  }

  observe(): void {
    // noop
  }

  disconnect(): void {
    // noop
  }
}

const createRenderer = (element: unknown): TestRenderer.ReactTestRenderer =>
  TestRenderer.create(element as never);

async function flushAsync(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('infinite scroll integration', () => {
  it('auto loads until no next page and can reload via invalidate', async () => {
    const originalIntersectionObserver = (globalThis as { IntersectionObserver?: unknown })
      .IntersectionObserver;
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver =
      FakeIntersectionObserver;

    const client = createQueryClient();
    const snapshots: Array<{ pages: number[]; hasNextPage: boolean }> = [];
    let latestQuery: IoInfiniteQueryHandle<number, Error, number> | undefined;

    const App = () => {
      const sentinelRef = useRef({});
      const result = useInfiniteQuery<number, Error, number>({
        client,
        key: ['integration', 'scroll'],
        initialPageParam: 1,
        queryFn: async ({ pageParam }) => pageParam,
        getNextPageParam: (lastPage) => (lastPage < 3 ? lastPage + 1 : null),
      });

      latestQuery = result.query;

      useEffect(() => {
        snapshots.push({
          pages: [...(result.data?.pages as unknown as number[] ?? [])],
          hasNextPage: result.hasNextPage,
        });
      }, [result.data, result.hasNextPage]);

      latestQuery = result.query;

      useEffect(() => {
        const ObserverCtor = (globalThis as unknown as { IntersectionObserver: new (cb: ObserverCallback) => {
          observe: (target: unknown) => void;
          disconnect: () => void;
        } }).IntersectionObserver;

        const observer = new ObserverCtor((entries) => {
          const [entry] = entries;
          if (!entry?.isIntersecting) {
            return;
          }
          if (!result.hasNextPage || result.isFetchingNextPage) {
            return;
          }
          void result.fetchNextPage();
        });

        observer.observe(sentinelRef.current);
        return () => {
          observer.disconnect();
        };
      }, [result]);

      return React.createElement('span', null, String(result.data?.pages.length ?? 0));
    };

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = createRenderer(React.createElement(App));
    });
    await flushAsync();

    expect(snapshots.at(-1)?.pages).toEqual([1]);

    await act(async () => {
      latestIntersectionCallback?.([{ isIntersecting: true }]);
    });
    await flushAsync();

    await act(async () => {
      latestIntersectionCallback?.([{ isIntersecting: true }]);
    });
    await flushAsync();

    expect(snapshots.at(-1)?.pages).toEqual([1, 2, 3]);
    expect(snapshots.at(-1)?.hasNextPage).toBe(false);

    await act(async () => {
      latestIntersectionCallback?.([{ isIntersecting: true }]);
    });
    await flushAsync();

    expect(snapshots.at(-1)?.pages).toEqual([1, 2, 3]);

    await act(async () => {
      latestQuery?.invalidate(true);
    });
    await flushAsync();

    expect(latestQuery?.getData()?.pages).toEqual([1, 2, 3]);

    await act(async () => {
      renderer.unmount();
    });

    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver =
      originalIntersectionObserver;
  });
});
