import type { IoTreeNode, IoUnit } from '../utils/types.js';
import type {
  TreeArrayState,
  TreeContext,
  TreeInternal,
  TreeNode,
  TreeScopeState,
  TreeScopeInternal,
  TreeArrayInternal,
  UnitInternal,
} from './io-tree-types.js';

import {
  cloneValue,
  freezeRootShallow,
  snapshotValue,
} from '../utils/snapshot.js';
import { createDraft, finishDraft } from '../utils/cow.js';
import { createUpdate } from '../utils/updates.js';
import { createUnit, isUnit } from '../units/unit.js';
import { emitError } from '../utils/debug.js';
import { trackRead } from '../utils/signals.js';
import {
  getInternal as getAnyInternal,
  registerInternal,
  requireInternalOfKind,
} from '../utils/internal-access.js';
import { INTERNAL } from '../utils/internal-symbol.js';
import { isPlainObject } from '../utils/plain-object.js';
import { readCachedByVersion } from '../container/cache.js';
import { clearDirtyIndices } from './dirty-indices.js';
import {
  applyArrayCommitDiff,
  applyScopeCommitDiff,
} from './commit.js';
import { createSubscriptions } from './subscriptions.js';
import { createNodeFactory } from './node-factory.js';
import type { NodePath } from './path-trie.js';
import {
  createTrieNode,
  getPathNode,
  registerSubtree as registerSubtreeWithAccess,
  rebuildSubtreeMapping as rebuildSubtreeMappingWithAccess,
  setPathNode,
  unregisterSubtree as unregisterSubtreeWithAccess,
} from './path-trie.js';


function getInternal(value: unknown): TreeInternal | undefined {
  return getAnyInternal(value) as unknown as TreeInternal | undefined;
}

function isScopeInternal(
  internal: TreeInternal | undefined,
): internal is TreeScopeInternal {
  return internal?.kind === 'scope';
}

function isArrayInternal(
  internal: TreeInternal | undefined,
): internal is TreeArrayInternal {
  return internal?.kind === 'array';
}

function isUnitInternal(
  internal: TreeInternal | undefined,
): internal is UnitInternal {
  return internal?.kind === 'unit';
}

const subtreeAccess = {
  getScopeChildren(node: TreeNode) {
    const internal = getInternal(node);
    if (!isScopeInternal(internal)) return undefined;
    return internal.getState().children.entries();
  },
  getArrayChildren(node: TreeNode) {
    const internal = getInternal(node);
    if (!isArrayInternal(internal)) return undefined;
    return internal.getState().children;
  },
};

function registerSubtree(ctx: TreeContext, path: NodePath, node: TreeNode): void {
  registerSubtreeWithAccess(ctx, path, node, subtreeAccess);
}

function unregisterSubtree(ctx: TreeContext, path: NodePath, node: TreeNode): void {
  unregisterSubtreeWithAccess(ctx, path, node, subtreeAccess);
}

function rebuildSubtreeMapping(
  state: { ctx: TreeContext; path: NodePath },
  node: TreeNode,
): void {
  rebuildSubtreeMappingWithAccess(state, node, subtreeAccess);
}

function hasSnapshot(value: unknown): value is { snapshot(): unknown } {
  if (typeof value !== 'object' || value === null) return false;
  return typeof (value as { snapshot?: unknown }).snapshot === 'function';
}

function getNodeValue(
  node: TreeNode,
  cache: WeakMap<object, unknown>,
): unknown {
  const internal = getInternal(node);
  if (isUnitInternal(internal)) return (node as IoUnit<unknown>).snapshot();
  if (isScopeInternal(internal))
    return getScopeSnapshot(internal.getState(), cache);
  if (isArrayInternal(internal))
    return getArraySnapshot(internal.getState(), cache);
  if (hasSnapshot(node)) return node.snapshot();
  return snapshotValue(node, { owned: false });
}

function getScopeSnapshot(
  state: TreeScopeState,
  cache?: WeakMap<object, unknown>,
): Record<string, unknown> {
  return readCachedByVersion(state.snapshotCache, state.valueEpoch, () => {
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
        base[key] = getNodeValue(node, local);
      }
    } else {
      for (const key of state.dirtyKeys) {
        const node = state.children.get(key);
        if (node) base[key] = getNodeValue(node, local);
      }
    }

    state.dirtyKeys.clear();
    state.dirtyStructure = false;
    const value = freezeRootShallow(base) as Record<string, unknown>;
    local.set(state.node as unknown as object, value);
    return value;
  });
}

function getArraySnapshot(
  state: TreeArrayState,
  cache?: WeakMap<object, unknown>,
): unknown[] {
  const fullRebuildThreshold = 0.5;
  return readCachedByVersion(state.snapshotCache, state.valueEpoch, () => {
    const local = cache ?? new WeakMap<object, unknown>();
    const cached = local.get(state.node as unknown as object);
    if (cached) return cached as unknown[];

    const prev = state.snapshotCache.hasValue
      ? (state.snapshotCache.value as unknown[])
      : undefined;

    if (
      prev &&
      !state.dirtyStructure &&
      state.dirtyIndices.items.length === 0 &&
      prev.length === state.children.length
    ) {
      local.set(state.node as unknown as object, prev);
      return prev;
    }

    let values: unknown[];
    let forceFullRebuild = false;
    if (
      prev &&
      !state.dirtyStructure &&
      prev.length === state.children.length
    ) {
      let validDirty = 0;
      for (const index of state.dirtyIndices.items) {
        if (index >= 0 && index < state.children.length) validDirty += 1;
      }
      if (validDirty === 0) {
        clearDirtyIndices(state.dirtyIndices);
        local.set(state.node as unknown as object, prev);
        return prev;
      }
      const fullRebuildThresholdCount = Math.ceil(
        state.children.length * fullRebuildThreshold,
      );
      if (validDirty >= fullRebuildThresholdCount) {
        values = new Array(state.children.length);
        forceFullRebuild = true;
      } else {
        values = prev.slice();
      }
    } else {
      values = new Array(state.children.length);
      forceFullRebuild = true;
    }
    local.set(state.node as unknown as object, values);

    if (
      forceFullRebuild ||
      !prev ||
      state.dirtyStructure ||
      prev.length !== state.children.length
    ) {
      for (let i = 0; i < state.children.length; i += 1) {
        values[i] = getNodeValue(state.children[i], local);
      }
    } else {
      for (const index of state.dirtyIndices.items) {
        if (index < 0 || index >= state.children.length) continue;
        values[index] = getNodeValue(state.children[index], local);
      }
    }

    clearDirtyIndices(state.dirtyIndices);
    state.dirtyStructure = false;
    const frozen = freezeRootShallow(values) as unknown[];
    local.set(state.node as unknown as object, frozen);
    return frozen;
  });
}

const {
  emitScopeValue,
  emitScopeUpdate,
  emitArrayValue,
  emitArrayUpdate,
  markDirty,
  attachChildToScope,
  detachChildFromScope,
  attachChildToArray,
  detachChildFromArray,
} = createSubscriptions<TreeNode, TreeScopeState, TreeArrayState>({
  getScopeSnapshot,
  getArraySnapshot,
});

const { createTreeNode } = createNodeFactory({
  isPlainObject,
  isUnit,
  createUnit,
  cloneValue,
  emitError,
  createDraft,
  finishDraft,
  createUpdate,
  applyScopeCommitDiff,
  applyArrayCommitDiff,
  getInternal,
  requireInternalOfKind,
  registerInternal,
  INTERNAL,
  registerSubtree,
  unregisterSubtree,
  rebuildSubtreeMapping,
  setPathNode,
  getPathNode,
  getScopeSnapshot,
  getArraySnapshot,
  getNodeValue,
  emitScopeValue,
  emitScopeUpdate,
  emitArrayValue,
  emitArrayUpdate,
  trackRead,
  markDirty,
  attachChildToScope,
  detachChildFromScope,
  attachChildToArray,
  detachChildFromArray,
});

export function ioTree<T>(
  initial: T,
  options?: { devtools?: boolean; maxDepth?: number },
): IoTreeNode<T> {
  const devtools = resolveDevtoolsEnabled(options);
  const ctx: TreeContext = {
    root: createTrieNode(),
    errorListeners: new Set(),
    devtools,
    maxDepth: options?.maxDepth,
    seen: new WeakMap(),
  };
  return createTreeNode(ctx, [], initial) as unknown as IoTreeNode<T>;
}

function resolveDevtoolsEnabled(options?: { devtools?: boolean }): boolean {
  if (options?.devtools === true) return true;
  if (options?.devtools === false) return false;
  const flag = (globalThis as Record<PropertyKey, unknown>).__IO_DEVTOOLS__;
  if (flag === false) return false;
  return isDevEnv();
}

function isDevEnv(): boolean {
  if (typeof process !== 'undefined') {
    const env = (
      process as unknown as { env?: Record<string, string | undefined> }
    ).env;
    if (env?.NODE_ENV) return env.NODE_ENV !== 'production';
  }
  return true;
}
