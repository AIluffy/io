import { describe, expect, it, vi } from 'vitest';

import { createQueryDefaults } from '../client-defaults.js';
import {
  createClientHydration,
  isDehydratedInfiniteQuery,
  isDehydratedQuery,
} from '../client-hydration.js';
import { isInfiniteHandle } from '../client-helpers.js';
import { createQueryCache } from '../query-cache.js';
import type { KeyHash } from '../types.js';
import { hashKey } from '../utils.js';

function createDefaults() {
  return createQueryDefaults({});
}

// Test-only branded hash fixture for hydration-shape guards.
const MOCK_KEY_HASH = 'h' as KeyHash;

describe('query coverage boost', () => {
  it('validates dehydrated query shape checks', () => {
    // 覆盖 client-hydration.ts L78 的 false 分支：当 value 非对象时返回 false。
    expect(isDehydratedQuery(null)).toBe(false);
    // 覆盖 client-hydration.ts L83 的 false 分支：缺失 keyHash/state 字段。
    expect(isDehydratedQuery({ key: ['k'] })).toBe(false);
    // 覆盖 client-hydration.ts L83 的 true 分支：对象包含 key/keyHash/state。
    expect(isDehydratedQuery({ key: ['k'], keyHash: MOCK_KEY_HASH, state: {} })).toBe(true);
  });

  it('validates dehydrated infinite query guard branches', () => {
    // 覆盖 client-hydration.ts L87 的 false 分支：非 dehydrated query。
    expect(isDehydratedInfiniteQuery('x')).toBe(false);
    // 覆盖 client-hydration.ts L92 的 false 分支：state 不是对象。
    expect(
      isDehydratedInfiniteQuery({ key: ['k'], keyHash: MOCK_KEY_HASH, state: 1 }),
    ).toBe(false);
    // 覆盖 client-hydration.ts L92 的 false 分支：state 不含 fetchDirection。
    expect(
      isDehydratedInfiniteQuery({ key: ['k'], keyHash: MOCK_KEY_HASH, state: {} }),
    ).toBe(false);
    // 覆盖 client-hydration.ts L92 的 true 分支：state 含 fetchDirection。
    expect(
      isDehydratedInfiniteQuery({
        key: ['k'],
        keyHash: MOCK_KEY_HASH,
        state: { fetchDirection: null },
      }),
    ).toBe(true);
  });

  it('hydrates missing regular query via seeded queryFn fallback', async () => {
    // 覆盖 client-hydration.ts L43-L50 的 else 分支：不存在 record 时 cache.seed。
    const cache = createQueryCache();
    const hydration = createClientHydration({
      cache,
      defaults: createDefaults(),
      getQueries: () => cache.getAll(),
    });

    hydration.hydrate({
      queries: [
        {
          key: ['seeded-regular'],
          keyHash: hashKey(['seeded-regular']),
          state: {
            status: 'pending',
            fetchStatus: 'idle',
            data: undefined,
            error: null,
            dataUpdatedAt: 0,
            errorUpdatedAt: 0,
            failureCount: 0,
            failureReason: null,
            isInvalidated: false,
          },
        },
      ],
    });

    const handle = cache.getHandle(['seeded-regular']);
    await expect(handle?.fetch(true)).rejects.toThrow('queryFn is not available');
  });

  it('hydrates existing regular query record instead of reseeding', async () => {
    // 覆盖 client-hydration.ts L39-L42 的 existing 分支：已有 record 时走 record.hydrate。
    const cache = createQueryCache();
    const hydration = createClientHydration({
      cache,
      defaults: createDefaults(),
      getQueries: () => cache.getAll(),
    });

    const handle = cache.define({
      key: ['existing-regular'],
      keyHash: hashKey(['existing-regular']),
      queryFn: async () => 1,
      staleTime: 0,
      gcTime: 1000,
      retry: 0,
      retryDelay: () => 0,
      canFetch: true,
    });

    hydration.hydrate({
      queries: [
        {
          key: ['existing-regular'],
          keyHash: hashKey(['existing-regular']),
          state: {
            status: 'success',
            fetchStatus: 'idle',
            data: 99,
            error: null,
            dataUpdatedAt: 1,
            errorUpdatedAt: 0,
            failureCount: 0,
            failureReason: null,
            isInvalidated: false,
          },
        },
      ],
    });

    expect(handle.getData()).toBe(99);
  });

  it('hydrates missing infinite query via seeded infinite queryFn fallback', async () => {
    // 覆盖 client-hydration.ts L59-L71 的 else 分支：不存在 infinite record 时 cache.seedInfinite。
    const cache = createQueryCache();
    const hydration = createClientHydration({
      cache,
      defaults: createDefaults(),
      getQueries: () => cache.getAll(),
    });

    hydration.hydrate({
      queries: [],
      infiniteQueries: [
        {
          key: ['seeded-infinite'],
          keyHash: hashKey(['seeded-infinite']),
          state: {
            status: 'pending',
            fetchStatus: 'idle',
            data: undefined,
            error: null,
            dataUpdatedAt: 0,
            errorUpdatedAt: 0,
            failureCount: 0,
            failureReason: null,
            isInvalidated: false,
            fetchDirection: null,
          },
        },
      ],
    });

    const handle = cache.getInfiniteHandle(['seeded-infinite']);
    await expect(handle?.fetchNextPage()).rejects.toThrow('queryFn is not available');
  });

  it('hydrates existing infinite query record instead of reseeding', async () => {
    // 覆盖 client-hydration.ts L55-L58 的 existing 分支：已有 infinite record 时 hydrate。
    const cache = createQueryCache();
    const hydration = createClientHydration({
      cache,
      defaults: createDefaults(),
      getQueries: () => cache.getAll(),
    });

    const handle = cache.defineInfinite({
      key: ['existing-infinite'],
      keyHash: hashKey(['existing-infinite']),
      queryFn: async ({ pageParam }) => pageParam as number,
      initialPageParam: 0,
      getNextPageParam: () => null,
      getPreviousPageParam: () => null,
      maxPages: undefined,
      staleTime: 0,
      gcTime: 1000,
      retry: 0,
      retryDelay: () => 0,
      canFetch: true,
    });

    hydration.hydrate({
      queries: [],
      infiniteQueries: [
        {
          key: ['existing-infinite'],
          keyHash: hashKey(['existing-infinite']),
          state: {
            status: 'success',
            fetchStatus: 'idle',
            data: { pages: [7], pageParams: [0] },
            error: null,
            dataUpdatedAt: 2,
            errorUpdatedAt: 0,
            failureCount: 0,
            failureReason: null,
            isInvalidated: false,
            fetchDirection: null,
          },
        },
      ],
    });

    expect(handle.getData()?.pages).toEqual([7]);
  });

  it('isInfiniteHandle narrows only object-like values with fetchNextPage', () => {
    // 覆盖 client-helpers.ts L39 的 false 分支：primitive 输入。
    expect(isInfiniteHandle(1)).toBe(false);
    // 覆盖 client-helpers.ts L39 的 true 分支：具备 fetchNextPage 字段。
    expect(isInfiniteHandle({ fetchNextPage: () => Promise.resolve() })).toBe(true);
  });

  it('hashKey serializes Map/Set/ArrayBuffer deterministically', () => {
    // 覆盖 utils.ts L69-L92 的 Map/Set/ArrayBuffer 分支。
    const map = new Map<unknown, unknown>([
      ['b', 2],
      ['a', 1],
    ]);
    const set = new Set([3, 1, 2]);
    const ab = new Uint8Array([1, 2, 3]).buffer;

    const first = hashKey(['k', map, set, ab]);
    const second = hashKey(['k', new Map([['a', 1], ['b', 2]]), new Set([2, 1, 3]), ab]);
    expect(first).toBe(second);
  });

  it('hashKey throws for circular references and symbols', () => {
    // 覆盖 utils.ts L53-L54 的 symbol 防御分支。
    expect(() => hashKey(['k', Symbol('s')])).toThrow('values of type "symbol"');

    // 覆盖 utils.ts L59-L61 的循环引用防御分支。
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => hashKey(['k', circular])).toThrow('cannot contain circular references');
  });

  it('focus manager works in non-browser fallback mode', async () => {
    // 覆盖 focus-manager.ts L24-L26/L34-L36 分支：无 window/document 时回退为 focused=true。
    const origWindow = (globalThis as { window?: unknown }).window;
    const origDocument = (globalThis as { document?: unknown }).document;
    Reflect.deleteProperty(globalThis, 'window');
    Reflect.deleteProperty(globalThis, 'document');
    vi.resetModules();

    const { getFocusManager } = await import('../focus-manager.js');
    const manager = getFocusManager();
    expect(manager.isFocused()).toBe(true);

    const calls: boolean[] = [];
    const unsub = manager.subscribe((value) => calls.push(value));
    manager.setFocused(false);
    manager.setFocused(false);
    manager.setFocused(true);
    unsub();

    expect(calls).toEqual([false, true]);
    if (origWindow !== undefined) {
      (globalThis as { window?: unknown }).window = origWindow;
    }
    if (origDocument !== undefined) {
      (globalThis as { document?: unknown }).document = origDocument;
    }
    vi.resetModules();
  });

  it('online manager works in non-browser fallback mode', async () => {
    // 覆盖 online-manager.ts L23-L25/L33-L35/L41-L43 分支：无 navigator.onLine 时默认 online=true。
    const origWindow = (globalThis as { window?: unknown }).window;
    const origNavigator = (globalThis as { navigator?: unknown }).navigator;
    Reflect.deleteProperty(globalThis, 'window');
    Reflect.deleteProperty(globalThis, 'navigator');
    vi.resetModules();

    const { getOnlineManager } = await import('../online-manager.js');
    const manager = getOnlineManager();
    expect(manager.isOnline()).toBe(true);

    const calls: boolean[] = [];
    const unsub = manager.subscribe((value) => calls.push(value));
    manager.setOnline(false);
    manager.setOnline(false);
    manager.setOnline(true);
    unsub();

    expect(calls).toEqual([false, true]);
    if (origWindow !== undefined) {
      (globalThis as { window?: unknown }).window = origWindow;
    }
    if (origNavigator !== undefined) {
      (globalThis as { navigator?: unknown }).navigator = origNavigator;
    }
    vi.resetModules();
  });
});
