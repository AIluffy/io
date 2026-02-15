import type { IoUnit } from '../utils/types.js';
import type {
  TreeArrayInternal,
  TreeArrayState,
  TreeInternal,
  TreeNode,
  TreeScopeInternal,
  TreeScopeState,
  UnitInternal,
} from './io-tree-types.js';
import type { SnapshotCache } from './snapshot-cache.js';

import { freezeRootShallow, snapshotValue } from '../utils/snapshot.js';
import {
  CACHE_MISS,
  readCachedByVersion,
  updateCachedByVersion,
} from '../container/cache.js';
import { getInternal as getAnyInternal } from '../utils/internal-access.js';
import { createSnapshotCache } from './snapshot-cache.js';

export type { SnapshotCache } from './snapshot-cache.js';

export type GetNodeValue = (node: TreeNode, cache: SnapshotCache) => unknown;

type ScopeSnapshotReader = (
  state: TreeScopeState,
  cache?: SnapshotCache,
) => Record<string, unknown>;

type ArraySnapshotReader = (
  state: TreeArrayState,
  cache?: SnapshotCache,
) => unknown[];

export function getTreeInternal(value: unknown): TreeInternal | undefined {
  return getAnyInternal(value) as TreeInternal | undefined;
}

export function isScopeInternal(
  internal: TreeInternal | undefined,
): internal is TreeScopeInternal {
  return internal?.kind === 'scope';
}

export function isArrayInternal(
  internal: TreeInternal | undefined,
): internal is TreeArrayInternal {
  return internal?.kind === 'array';
}

export function isUnitInternal(
  internal: TreeInternal | undefined,
): internal is UnitInternal {
  return internal?.kind === 'unit';
}

function hasSnapshot(value: unknown): value is { snapshot(): unknown } {
  if (typeof value !== 'object' || value === null) return false;
  return typeof (value as { snapshot?: unknown }).snapshot === 'function';
}

export function createNodeValueReader(deps: {
  getScopeSnapshot: ScopeSnapshotReader;
  getArraySnapshot: ArraySnapshotReader;
}): GetNodeValue {
  return (node: TreeNode, cache: SnapshotCache): unknown => {
    const internal = getTreeInternal(node);
    if (isUnitInternal(internal)) return (node as IoUnit<unknown>).snapshot();
    if (isScopeInternal(internal))
      return deps.getScopeSnapshot(internal.getState(), cache);
    if (isArrayInternal(internal))
      return deps.getArraySnapshot(internal.getState(), cache);
    if (hasSnapshot(node)) return node.snapshot();
    return snapshotValue(node, { owned: false });
  };
}

export function createScopeSnapshotReader(deps: {
  getNodeValue: GetNodeValue;
}): ScopeSnapshotReader {
  return (
    state: TreeScopeState,
    cache?: SnapshotCache,
  ): Record<string, unknown> => {
    const snapshot = readCachedByVersion(state.snapshotCache, state.valueEpoch);
    if (snapshot !== CACHE_MISS) {
      return snapshot as Record<string, unknown>;
    }

    const local = cache ?? createSnapshotCache();
    const cached = local.get(state.node as object);
    if (cached) return cached as Record<string, unknown>;

    const prev = state.snapshotCache.hasValue
      ? (state.snapshotCache.value as Record<PropertyKey, unknown>)
      : undefined;

    if (prev && !state.dirtyStructure && state.dirtyKeys.size === 0) {
      local.set(state.node as object, prev);
      return prev;
    }

    if (!prev || state.dirtyStructure) {
      const base: Record<PropertyKey, unknown> = {};
      local.set(state.node as object, base);
      for (const key of state.children.keys()) {
        const node = state.children.get(key);
        if (!node) continue;
        base[key] = deps.getNodeValue(node, local);
      }
      state.dirtyKeys.clear();
      state.dirtyStructure = false;
      const value = freezeRootShallow(base) as Record<string, unknown>;
      local.set(state.node as object, value);
      return updateCachedByVersion(state.snapshotCache, state.valueEpoch, value);
    }

    const base: Record<PropertyKey, unknown> = {};
    local.set(state.node as object, base);
    for (const key of state.children.keys()) {
      const node = state.children.get(key);
      if (!node) continue;
      if (state.dirtyKeys.has(key)) {
        base[key] = deps.getNodeValue(node, local);
      } else {
        base[key] = prev[key];
      }
    }
    state.dirtyKeys.clear();
    state.dirtyStructure = false;
    const value = freezeRootShallow(base) as Record<string, unknown>;
    local.set(state.node as object, value);
    return updateCachedByVersion(state.snapshotCache, state.valueEpoch, value);
  };
}
