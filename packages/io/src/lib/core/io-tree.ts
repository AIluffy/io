import type { IoTreeNode } from '../utils/types.js';
import type {
  TreeArrayState,
  TreeContext,
  TreeInternal,
  TreeNode,
  TreeScopeState,
} from './io-tree-types.js';

import { cloneValue } from '../utils/snapshot.js';
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
import { applyArrayCommitDiff, applyScopeCommitDiff } from './commit.js';
import { createSubscriptions } from './subscriptions.js';
import { createNodeFactory } from './node-factory.js';
import type { NodePath } from './path-trie.js';
import {
  getPathNode,
  rebuildSubtreeMapping as rebuildSubtreeMappingWithAccess,
  registerSubtree as registerSubtreeWithAccess,
  setPathNode,
  unregisterSubtree as unregisterSubtreeWithAccess,
} from './path-trie.js';
import { createArraySnapshotReader } from './snapshot-array.js';
import {
  createNodeValueReader,
  createScopeSnapshotReader,
  getTreeInternal,
  isArrayInternal,
  isScopeInternal,
} from './snapshot-scope.js';
import { createTreeContext, type IoTreeOptions } from './tree-context.js';

function getInternal(value: unknown): TreeInternal | undefined {
  return getAnyInternal(value) as unknown as TreeInternal | undefined;
}

const subtreeAccess = {
  getScopeChildren(node: TreeNode) {
    const internal = getTreeInternal(node);
    if (!isScopeInternal(internal)) return undefined;
    return internal.getState().children.entries();
  },
  getArrayChildren(node: TreeNode) {
    const internal = getTreeInternal(node);
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

const getScopeSnapshot = createScopeSnapshotReader({
  getNodeValue: (node, cache) => getNodeValue(node, cache),
});

const getArraySnapshot = createArraySnapshotReader({
  getNodeValue: (node, cache) => getNodeValue(node, cache),
});

const getNodeValue = createNodeValueReader({
  getScopeSnapshot,
  getArraySnapshot,
});

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

export function ioTree<T>(initial: T, options?: IoTreeOptions): IoTreeNode<T> {
  const ctx = createTreeContext(options);
  return createTreeNode(ctx, [], initial) as unknown as IoTreeNode<T>;
}
