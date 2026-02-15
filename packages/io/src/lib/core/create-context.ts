import type {
  LifecycleDeps,
  SnapshotDeps,
  SubscriptionDeps,
  TreeDeps,
} from './types.js';
import type { TreeArrayState, TreeInternal, TreeNode, TreeScopeState } from './tree/io-tree-types.js';
import type { TreeContext } from './tree/io-tree-types.js';

import { createUnit, isUnit } from '../units/unit.js';
import { createDraft, finishDraft } from '../utils/cow.js';
import { emitError } from '../utils/debug.js';
import {
  INTERNAL,
  getInternal as getAnyInternal,
  registerInternal,
  requireInternalOfKind,
} from '../utils/internal-access.js';
import { isPlainObject } from '../utils/plain-object.js';
import { trackRead } from '../utils/signals.js';
import { cloneValue } from '../utils/snapshot.js';
import { createUpdate } from '../utils/updates.js';
import { applyArrayCommitDiff, applyScopeCommitDiff } from './mutation/commit.js';
import { createSubscriptions } from './mutation/subscriptions.js';
import { createNodeFactory } from './node-factory/index.js';
import { createArraySnapshotReader } from './snapshot/snapshot-array.js';
import {
  createNodeValueReader,
  createScopeSnapshotReader,
  getTreeInternal,
  isArrayInternal,
  isScopeInternal,
} from './snapshot/snapshot-scope.js';
import {
  getPathNode as getPathNodeWithAccess,
  rebuildSubtreeMapping as rebuildSubtreeMappingWithAccess,
  registerSubtree as registerSubtreeWithAccess,
  setPathNode as setPathNodeWithAccess,
  unregisterSubtree as unregisterSubtreeWithAccess,
} from './tree/path-trie.js';

function createSnapshotDeps(): SnapshotDeps {
  let getNodeValue: SnapshotDeps['getNodeValue'] = () => {
    throw new Error('ioTree snapshot layer: getNodeValue not initialized');
  };

  const getScopeSnapshot = createScopeSnapshotReader({
    getNodeValue: (node, cache) => getNodeValue(node, cache),
  });

  const getArraySnapshot = createArraySnapshotReader({
    getNodeValue: (node, cache) => getNodeValue(node, cache),
  });

  getNodeValue = createNodeValueReader({
    getScopeSnapshot,
    getArraySnapshot,
  });

  return {
    getScopeSnapshot,
    getArraySnapshot,
    getNodeValue,
  };
}

function createSubscriptionDeps(snapshots: SnapshotDeps): SubscriptionDeps & LifecycleDeps {
  const subscriptions = createSubscriptions<TreeNode, TreeScopeState, TreeArrayState>({
    getScopeSnapshot: snapshots.getScopeSnapshot,
    getArraySnapshot: snapshots.getArraySnapshot,
  });

  return {
    ...snapshots,
    ...subscriptions,
    trackRead,
  };
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

function createTreeDeps(ctx: TreeContext): TreeDeps {
  const snapshots = createSnapshotDeps();
  const subscriptions = createSubscriptionDeps(snapshots);

  const getInternal = (value: unknown): TreeInternal | undefined =>
    getAnyInternal(value) as TreeInternal | undefined;

  return {
    utils: {
      isPlainObject,
      isUnit,
      createUnit,
      cloneValue,
      emitError,
      createDraft,
      finishDraft,
      createUpdate,
      trackRead: subscriptions.trackRead,
    },
    commit: {
      applyScopeCommitDiff,
      applyArrayCommitDiff,
    },
    snapshots,
    subscriptions: {
      emitScopeValue: subscriptions.emitScopeValue,
      emitScopeUpdate: subscriptions.emitScopeUpdate,
      emitArrayValue: subscriptions.emitArrayValue,
      emitArrayUpdate: subscriptions.emitArrayUpdate,
      markDirty: subscriptions.markDirty,
    },
    registry: {
      registerSubtree: (_ctx, path, node) =>
        registerSubtreeWithAccess(ctx, path, node, subtreeAccess),
      unregisterSubtree: (_ctx, path, node) =>
        unregisterSubtreeWithAccess(ctx, path, node, subtreeAccess),
      rebuildSubtreeMapping: (state, node) =>
        rebuildSubtreeMappingWithAccess({ ctx, path: state.path }, node, subtreeAccess),
      setPathNode: (_ctx, path, node) => setPathNodeWithAccess(ctx, path, node),
      getPathNode: (_ctx, path) => getPathNodeWithAccess(ctx, path),
    },
    internals: {
      getInternal,
      requireInternalOfKind,
      registerInternal,
      INTERNAL,
    },
    lifecycle: {
      attachChildToScope: subscriptions.attachChildToScope,
      detachChildFromScope: subscriptions.detachChildFromScope,
      attachChildToArray: subscriptions.attachChildToArray,
      detachChildFromArray: subscriptions.detachChildFromArray,
    },
  };
}

export function createTreeNodeFactory(ctx: TreeContext): ReturnType<typeof createNodeFactory> {
  return createNodeFactory(createTreeDeps(ctx));
}
