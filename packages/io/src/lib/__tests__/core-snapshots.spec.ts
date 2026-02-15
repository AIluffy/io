import { describe, expect, it } from 'vitest';
import { createDirtyIndexState } from '../core/dirty-indices.js';
import { createSnapshotCache } from '../core/snapshot-cache.js';
import { createArraySnapshotReader } from '../core/snapshot-array.js';
import {
  createNodeValueReader,
  createScopeSnapshotReader,
} from '../core/snapshot-scope.js';
import { createTreeContext } from '../core/tree-context.js';

describe('core/snapshot readers', () => {
  it('returns previous scope snapshot when state is clean', () => {
    const reader = createScopeSnapshotReader({
      getNodeValue: (node) => node,
    });
    const prev = Object.freeze({ a: 1 });
    const state = {
      node: {},
      valueEpoch: 2,
      snapshotCache: {
        value: prev,
        version: 1,
        hasValue: true,
      },
      dirtyStructure: false,
      dirtyKeys: new Set<PropertyKey>(),
      children: new Map<PropertyKey, unknown>([['a', 1]]),
    };

    const next = reader(state as never);

    expect(next).toBe(prev);
  });

  it('skips missing dirty scope keys and still clears dirty markers', () => {
    const reader = createScopeSnapshotReader({
      getNodeValue: (node) => node,
    });
    const prev = Object.freeze({ a: 1 });
    const state = {
      node: {},
      valueEpoch: 2,
      snapshotCache: {
        value: prev,
        version: 1,
        hasValue: true,
      },
      dirtyStructure: false,
      dirtyKeys: new Set<PropertyKey>(['missing']),
      children: new Map<PropertyKey, unknown>([['a', 1]]),
    };

    const next = reader(state as never);

    expect(next).toEqual({ a: 1 });
    expect(state.dirtyKeys.size).toBe(0);
    expect(state.dirtyStructure).toBe(false);
  });

  it('returns previous array snapshot for clean and invalid-dirty cases', () => {
    const reader = createArraySnapshotReader({
      getNodeValue: (node) => node,
    });
    const prev = Object.freeze([1, 2]) as unknown[];
    const node = {};

    const cleanState = {
      node,
      children: [1, 2],
      dirtyStructure: false,
      dirtyIndices: createDirtyIndexState(2),
      valueEpoch: 2,
      snapshotCache: {
        value: prev,
        version: 1,
        hasValue: true,
      },
    };

    const clean = reader(cleanState as never);
    expect(clean).toBe(prev);

    const invalidDirtyState = {
      ...cleanState,
      valueEpoch: 3,
      dirtyIndices: createDirtyIndexState(2),
    };
    invalidDirtyState.dirtyIndices.items.push(-1, 4);

    const invalid = reader(invalidDirtyState as never);
    expect(invalid).toBe(prev);
    expect(invalidDirtyState.dirtyIndices.items).toEqual([]);
  });

  it('prefers snapshot() for unknown internals and falls back otherwise', () => {
    const nodeReader = createNodeValueReader({
      getScopeSnapshot: () => ({ v: 1 }),
      getArraySnapshot: () => [1],
    });
    const cache = createSnapshotCache();
    const withSnapshot = {
      snapshot: () => ({ ok: true }),
    };

    expect(nodeReader(withSnapshot as never, cache)).toEqual({ ok: true });
    expect(nodeReader(123 as never, cache)).toBe(123);
  });
});

describe('core/tree-context', () => {
  it('uses explicit and fallback devtools flags', () => {
    const previous = (globalThis as Record<PropertyKey, unknown>)
      .__IO_DEVTOOLS__;

    (globalThis as Record<PropertyKey, unknown>).__IO_DEVTOOLS__ = false;
    expect(createTreeContext().devtools).toBe(false);
    expect(createTreeContext({ devtools: true }).devtools).toBe(true);
    expect(createTreeContext({ devtools: false }).devtools).toBe(false);

    delete (globalThis as Record<PropertyKey, unknown>).__IO_DEVTOOLS__;
    const original = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    expect(createTreeContext().devtools).toBe(true);
    process.env.NODE_ENV = original;

    (globalThis as Record<PropertyKey, unknown>).__IO_DEVTOOLS__ = previous;
  });
});
