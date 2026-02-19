import type { IoQueryResult } from '../use-query.js';
import type { ReactTestRenderer } from 'react-test-renderer';

import { createQueryClient, createResource } from '@iostore/query';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { useQuery, useResource } from '../use-query.js';

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
    let latest: IoQueryResult<number> | undefined;

    const App = () => {
      latest = useQuery({
        client,
        key: ['react', 'query'],
        queryFn,
      });
      return React.createElement('span', null, String(latest.data ?? 'loading'));
    };

    let renderer: ReactTestRenderer;
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
    let left: IoQueryResult<number> | undefined;
    let right: IoQueryResult<number> | undefined;

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

    let renderer: ReactTestRenderer;
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
});

describe('@iostore/react: useResource', () => {
  it('supports refetch and invalidate actions', async () => {
    const client = createQueryClient();
    let value = 0;
    const resource = createResource({
      client,
      key: ['resource', 1],
      queryFn: async () => {
        value += 1;
        return value;
      },
      staleTime: 5_000,
    });

    let latest: IoQueryResult<number> | undefined;
    const App = () => {
      latest = useResource(resource);
      return React.createElement('span', null, String(latest.data ?? 'loading'));
    };

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = createRenderer(React.createElement(App));
    });
    await flushAsync();

    expect(latest?.data).toBe(1);
    await act(async () => {
      expect(latest?.invalidate()).toBe(1);
      await Promise.resolve();
    });
    await flushAsync();
    expect(latest?.data).toBe(2);

    await act(async () => {
      await latest?.refetch();
    });

    expect(latest?.data).toBe(3);

    await act(async () => {
      renderer.unmount();
    });
  });
});
