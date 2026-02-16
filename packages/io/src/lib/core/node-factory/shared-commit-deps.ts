import type { TreeDeps } from '../types.js';
import type { SnapshotCache } from '../snapshot/snapshot-cache.js';
import type { NodePath } from '../tree/path-trie.js';
import type {
  TreeArrayInternal,
  TreeArrayState,
  TreeContext,
  TreeNode,
  TreeScopeInternal,
  TreeScopeState,
  UnitInternal,
} from '../tree/io-tree-types.js';

import { isLink } from '../../utils/link.js';
import { createSnapshotCache } from '../snapshot/snapshot-cache.js';

type ScopeCommitDiffDeps = Parameters<TreeDeps['commit']['applyScopeCommitDiff']>[3];

export type SharedCommitDeps = Pick<
  ScopeCommitDiffDeps,
  | 'isPlainObject'
  | 'isUnit'
  | 'isLink'
  | 'getInternalKind'
  | 'getScopeState'
  | 'getArrayState'
  | 'setUnitValue'
  | 'getNodeValue'
  | 'resolvePatchValue'
  | 'createTreeNode'
  | 'detachChildFromScope'
  | 'attachChildToScope'
  | 'detachChildFromArray'
  | 'attachChildToArray'
  | 'unregisterSubtree'
  | 'registerSubtree'
  | 'getPathNode'
  | 'emitScopeValue'
  | 'emitArrayValue'
  | 'markDirty'
  | 'cloneValue'
>;

export function createSharedCommitDeps(
  deps: TreeDeps,
  ctx: TreeContext,
  createTreeNode: (
    ctx: TreeContext,
    path: NodePath,
    initial: unknown,
  ) => TreeNode,
  resolvePatchValue: (value: unknown) => unknown,
): SharedCommitDeps {
  let readCache: SnapshotCache | undefined;
  const invalidateReadCache = (): void => {
    readCache?.clear();
  };
  const readNodeValue = (node: unknown): unknown =>
    deps.snapshots.getNodeValue(
      node as TreeNode,
      (readCache ??= createSnapshotCache()),
    );

  return {
    isPlainObject: deps.utils.isPlainObject,
    isUnit: (node: unknown) => deps.utils.isUnit(node),
    isLink,
    getInternalKind: (node: unknown) =>
      deps.internals.getInternal(node as TreeNode)?.kind,
    getScopeState: (node: unknown) =>
      (
        deps.internals.requireInternalOfKind(
          node as TreeNode,
          'scope',
          'ioTree commit: invalid scope internal',
        ) as TreeScopeInternal
      ).getState(),
    getArrayState: (node: unknown) =>
      (
        deps.internals.requireInternalOfKind(
          node as TreeNode,
          'array',
          'ioTree commit: invalid array internal',
        ) as TreeArrayInternal
      ).getState(),
    setUnitValue: (node: unknown, value: unknown) => {
      const internal = deps.internals.requireInternalOfKind(
        node as TreeNode,
        'unit',
        'ioTree commit: invalid unit internal',
      ) as UnitInternal;
      invalidateReadCache();
      internal.setValue(value, { emitUpdate: false, emitValue: true });
    },
    getNodeValue: readNodeValue,
    resolvePatchValue,
    createTreeNode: (absPath: NodePath, value: unknown) =>
      createTreeNode(ctx, absPath, value),
    detachChildFromScope: (state, key) => {
      invalidateReadCache();
      deps.lifecycle.detachChildFromScope(state as TreeScopeState, key);
    },
    attachChildToScope: (state, key, child) => {
      invalidateReadCache();
      deps.lifecycle.attachChildToScope(
        state as TreeScopeState,
        key,
        child as TreeNode,
      );
    },
    detachChildFromArray: (state, child) => {
      invalidateReadCache();
      deps.lifecycle.detachChildFromArray(
        state as TreeArrayState,
        child as TreeNode,
      );
    },
    attachChildToArray: (state, child) => {
      invalidateReadCache();
      deps.lifecycle.attachChildToArray(
        state as TreeArrayState,
        child as TreeNode,
      );
    },
    unregisterSubtree: (absPath: NodePath, node: unknown) => {
      invalidateReadCache();
      deps.registry.unregisterSubtree(ctx, absPath, node as TreeNode);
    },
    registerSubtree: (absPath: NodePath, node: unknown) => {
      invalidateReadCache();
      deps.registry.registerSubtree(ctx, absPath, node as TreeNode);
    },
    getPathNode: (absPath: NodePath) => deps.registry.getPathNode(ctx, absPath),
    emitScopeValue: (state) =>
      deps.subscriptions.emitScopeValue(state as TreeScopeState),
    emitArrayValue: (state) =>
      deps.subscriptions.emitArrayValue(state as TreeArrayState),
    markDirty: (state, segment) =>
      deps.subscriptions.markDirty(
        state as TreeScopeState | TreeArrayState,
        segment,
      ),
    cloneValue: deps.utils.cloneValue,
  };
}
