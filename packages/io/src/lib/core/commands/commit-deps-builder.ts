import type { NodeFactoryDeps } from '../node-factory/types.js';
import type {
  TreeArrayInternal,
  TreeArrayState,
  TreeContext,
  TreeNode,
  TreeScopeInternal,
  TreeScopeState,
  UnitInternal,
} from '../io-tree-types.js';
import type { NodePath } from '../path-trie.js';

import { isLink } from '../../utils/link.js';

type CommitDeps = Parameters<NodeFactoryDeps['applyScopeCommitDiff']>[3];

export function buildCommitDeps(
  factoryDeps: NodeFactoryDeps,
  ctx: TreeContext,
  createTreeNode: (
    ctx: TreeContext,
    path: NodePath,
    initial: unknown,
  ) => TreeNode,
  resolvePatchValue: (value: unknown) => unknown,
): CommitDeps {
  return {
    isPlainObject: factoryDeps.isPlainObject,
    isUnit: (node: unknown) => factoryDeps.isUnit(node),
    isLink,
    getInternalKind: (node: unknown) =>
      factoryDeps.getInternal(node as TreeNode)?.kind,
    getScopeState: (node: unknown) =>
      (
        factoryDeps.requireInternalOfKind(
          node as TreeNode,
          'scope',
          'ioTree commit: invalid scope internal',
        ) as TreeScopeInternal
      ).getState(),
    getArrayState: (node: unknown) =>
      (
        factoryDeps.requireInternalOfKind(
          node as TreeNode,
          'array',
          'ioTree commit: invalid array internal',
        ) as TreeArrayInternal
      ).getState(),
    setUnitValue: (node: unknown, value: unknown) => {
      const internal = factoryDeps.requireInternalOfKind(
        node as TreeNode,
        'unit',
        'ioTree commit: invalid unit internal',
      ) as UnitInternal;
      internal.setValue(value, { emitUpdate: false, emitValue: true });
    },
    getNodeValue: (node: unknown) =>
      factoryDeps.getNodeValue(node as TreeNode, new WeakMap()),
    resolvePatchValue,
    createTreeNode: (absPath: NodePath, value: unknown) =>
      createTreeNode(ctx, absPath, value),
    detachChildFromScope: (state, key) =>
      factoryDeps.detachChildFromScope(state as TreeScopeState, key),
    attachChildToScope: (state, key, child) =>
      factoryDeps.attachChildToScope(
        state as TreeScopeState,
        key,
        child as TreeNode,
      ),
    detachChildFromArray: (state, child) =>
      factoryDeps.detachChildFromArray(
        state as TreeArrayState,
        child as TreeNode,
      ),
    attachChildToArray: (state, child) =>
      factoryDeps.attachChildToArray(state as TreeArrayState, child as TreeNode),
    unregisterSubtree: (absPath: NodePath, node: unknown) =>
      factoryDeps.unregisterSubtree(ctx, absPath, node as TreeNode),
    registerSubtree: (absPath: NodePath, node: unknown) =>
      factoryDeps.registerSubtree(ctx, absPath, node as TreeNode),
    getPathNode: (absPath: NodePath) => factoryDeps.getPathNode(ctx, absPath),
    emitScopeValue: (state) =>
      factoryDeps.emitScopeValue(state as TreeScopeState),
    emitArrayValue: (state) =>
      factoryDeps.emitArrayValue(state as TreeArrayState),
    markDirty: (state, segment) =>
      factoryDeps.markDirty(
        state as TreeScopeState | TreeArrayState,
        segment,
      ),
    cloneValue: factoryDeps.cloneValue,
  };
}
