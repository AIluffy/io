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

import { freezeRootShallow, snapshotValue } from '../utils/snapshot.js';
import { readCachedByVersion } from '../container/cache.js';
import { getInternal as getAnyInternal } from '../utils/internal-access.js';

export type SnapshotCache = WeakMap<object, unknown>;

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
  return getAnyInternal(value) as unknown as TreeInternal | undefined;
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

function defineLazyValue(
  target: object,
  key: PropertyKey,
  compute: () => unknown,
): void {
  let resolved = false;
  let cached: unknown;
  Object.defineProperty(target, key, {
    enumerable: true,
    configurable: true,
    get: () => {
      if (!resolved) {
        cached = compute();
        resolved = true;
      }
      return cached;
    },
  });
}

function materializeKeys(target: Record<PropertyKey, unknown>): void {
  for (const key of Reflect.ownKeys(target)) {
    void target[key];
  }
}

export function createScopeSnapshotReader(deps: {
  getNodeValue: GetNodeValue;
}): ScopeSnapshotReader {
  return (
    state: TreeScopeState,
    cache?: SnapshotCache,
  ): Record<string, unknown> =>
    readCachedByVersion(state.snapshotCache, state.valueEpoch, () => {
      const local = cache ?? new WeakMap<object, unknown>();
      const cached = local.get(state.node as unknown as object);
      if (cached) return cached as Record<string, unknown>;

      const prev = state.snapshotCache.hasValue
        ? (state.snapshotCache.value as Record<string, unknown>)
        : undefined;

      if (prev && !state.dirtyStructure && state.dirtyKeys.size === 0) {
        local.set(state.node as unknown as object, prev);
        return prev;
      }

      const base: Record<PropertyKey, unknown> =
        prev && !state.dirtyStructure ? { ...prev } : {};
      local.set(state.node as unknown as object, base);

      if (!prev || state.dirtyStructure) {
        for (const [key, node] of state.children.entries()) {
          defineLazyValue(base, key, () => deps.getNodeValue(node, local));
        }
      } else {
        for (const key of state.dirtyKeys) {
          const node = state.children.get(key);
          if (node)
            defineLazyValue(base, key, () => deps.getNodeValue(node, local));
        }
      }

      materializeKeys(base);
      state.dirtyKeys.clear();
      state.dirtyStructure = false;
      const value = freezeRootShallow(base) as Record<string, unknown>;
      local.set(state.node as unknown as object, value);
      return value;
    });
}
