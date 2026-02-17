import type { IoUnit } from '../../utils/types/types.js';
import type {
  TreeArrayInternal,
  TreeArrayState,
  TreeInternal,
  TreeNode,
  TreeScopeInternal,
  TreeScopeState,
  UnitInternal,
} from '../tree/io-tree-types.js';
import type { SnapshotCache } from './snapshot-cache.js';

import {
  snapshotValue,
} from '../../utils/immutable/immutable.js';
import { getInternal as getAnyInternal } from '../../utils/internal/internal-access.js';
import { createSnapshotReader } from './create-snapshot-reader.js';

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
  const readScopeSnapshot = createSnapshotReader<TreeScopeState, Record<string, unknown>>({
    hasDirtySegments: (state) => state.dirtyKeys.size > 0,
    buildFull: (state, getNodeValue, cache) => {
      const base: Record<PropertyKey, unknown> = {};
      cache.set(state.node as object, base);
      for (const [key, node] of state.children.entries()) {
        base[key] = getNodeValue(node, cache);
      }
      return base as Record<string, unknown>;
    },
    buildIncremental: (state, prev, getNodeValue, cache) => {
      const prevRecord = prev as Record<PropertyKey, unknown>;
      const base: Record<PropertyKey, unknown> = {};
      cache.set(state.node as object, base);
      for (const [key, node] of state.children.entries()) {
        if (!state.dirtyKeys.has(key)) {
          base[key] = prevRecord[key];
          continue;
        }
        base[key] = getNodeValue(node, cache);
      }
      return base as Record<string, unknown>;
    },
    clearDirty: (state) => {
      state.dirtyKeys.clear();
    },
  });

  return (state: TreeScopeState, cache?: SnapshotCache): Record<string, unknown> =>
    readScopeSnapshot(state, deps.getNodeValue, cache);
}
