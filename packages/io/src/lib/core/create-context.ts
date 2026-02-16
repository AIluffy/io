import type {
  LifecycleDeps,
  SnapshotDeps,
  SubscriptionDeps,
  TreeDeps,
} from './types.js';
import type { TreeArrayState, TreeInternal, TreeNode, TreeScopeState } from './tree/io-tree-types.js';
import type { TreeContext } from './tree/io-tree-types.js';

import { emitError } from '../utils/debug/debug.js';
import {
  INTERNAL,
  getInternal as getAnyInternal,
  registerInternal,
  requireInternalOfKind,
} from '../utils/internal/internal-access.js';
import { trackRead } from '../utils/reactive/signals.js';
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

class Lazy<T> {
  private current: T | undefined;

  get value(): T {
    if (this.current === undefined) {
      throw new Error('ioTree context: lazy value not initialized');
    }
    return this.current;
  }

  set value(next: T) {
    this.current = next;
  }
}

function createSnapshotDeps(): SnapshotDeps {
  const getNodeValue = new Lazy<SnapshotDeps['getNodeValue']>();

  const getScopeSnapshot = createScopeSnapshotReader({
    getNodeValue: (node, cache) => getNodeValue.value(node, cache),
  });

  const getArraySnapshot = createArraySnapshotReader({
    getNodeValue: (node, cache) => getNodeValue.value(node, cache),
  });

  getNodeValue.value = createNodeValueReader({
    getScopeSnapshot,
    getArraySnapshot,
  });

  return {
    getScopeSnapshot,
    getArraySnapshot,
    getNodeValue: (node, cache) => getNodeValue.value(node, cache),
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
    emitError,
    trackRead: subscriptions.trackRead,
    snapshots,
    subscriptions: {
      emitScopeValue: subscriptions.emitScopeValue,
      emitScopeUpdate: subscriptions.emitScopeUpdate,
      emitArrayValue: subscriptions.emitArrayValue,
      emitArrayUpdate: subscriptions.emitArrayUpdate,
      markDirty: subscriptions.markDirty,
    },
    registry: {
      registerSubtree: (path, node) =>
        registerSubtreeWithAccess(ctx, path, node, subtreeAccess),
      unregisterSubtree: (path, node) =>
        unregisterSubtreeWithAccess(ctx, path, node, subtreeAccess),
      rebuildSubtreeMapping: (path, node) =>
        rebuildSubtreeMappingWithAccess({ ctx, path }, node, subtreeAccess),
      setPathNode: (path, node) => setPathNodeWithAccess(ctx, path, node),
      getPathNode: (path) => getPathNodeWithAccess(ctx, path),
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
