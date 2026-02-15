import type { NodeCreationDeps } from '../../types.js';
import type { SnapshotCache } from '../../snapshot/snapshot-cache.js';
import type { NodePath } from '../../tree/path-trie.js';
import type {
  TreeArrayInternal,
  TreeArrayState,
  TreeContext,
  TreeNode,
  TreeScopeInternal,
  TreeScopeState,
  UnitInternal,
} from '../../tree/io-tree-types.js';

import { ArrayCommitCommand } from '../../commands/array-commit-command.js';
import { createArrayExecutor } from '../../commands/executor.js';
import { isLink } from '../../../utils/link.js';
import { createSnapshotCache } from '../../snapshot/snapshot-cache.js';

type CreateArrayCommitOptions = {
  deps: NodeCreationDeps;
  ctx: TreeContext;
  path: NodePath;
  state: TreeArrayState;
  createTreeNode: (
    ctx: TreeContext,
    path: NodePath,
    initial: unknown,
  ) => TreeNode;
  resolvePatchValue: (value: unknown) => unknown;
  snapshot: () => unknown[];
  getNode: () => TreeNode;
};

function createCommitDeps(
  deps: NodeCreationDeps,
  ctx: TreeContext,
  createTreeNode: (
    ctx: TreeContext,
    path: NodePath,
    initial: unknown,
  ) => TreeNode,
  resolvePatchValue: (value: unknown) => unknown,
): Parameters<NodeCreationDeps['applyArrayCommitDiff']>[3] {
  let readCache: SnapshotCache | undefined;
  const invalidateReadCache = (): void => {
    readCache?.clear();
  };
  const readNodeValue = (node: unknown): unknown =>
    deps.getNodeValue(
      node as TreeNode,
      (readCache ??= createSnapshotCache()),
    );

  return {
    isPlainObject: deps.isPlainObject,
    isUnit: (node: unknown) => deps.isUnit(node),
    isLink,
    getInternalKind: (node: unknown) => deps.getInternal(node as TreeNode)?.kind,
    getScopeState: (node: unknown) =>
      (
        deps.requireInternalOfKind(
          node as TreeNode,
          'scope',
          'ioTree commit: invalid scope internal',
        ) as TreeScopeInternal
      ).getState(),
    getArrayState: (node: unknown) =>
      (
        deps.requireInternalOfKind(
          node as TreeNode,
          'array',
          'ioTree commit: invalid array internal',
        ) as TreeArrayInternal
      ).getState(),
    setUnitValue: (node: unknown, value: unknown) => {
      const internal = deps.requireInternalOfKind(
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
      deps.detachChildFromScope(state as TreeScopeState, key);
    },
    attachChildToScope: (state, key, child) => {
      invalidateReadCache();
      deps.attachChildToScope(
        state as TreeScopeState,
        key,
        child as TreeNode,
      );
    },
    detachChildFromArray: (state, child) => {
      invalidateReadCache();
      deps.detachChildFromArray(
        state as TreeArrayState,
        child as TreeNode,
      );
    },
    attachChildToArray: (state, child) => {
      invalidateReadCache();
      deps.attachChildToArray(state as TreeArrayState, child as TreeNode);
    },
    unregisterSubtree: (absPath: NodePath, node: unknown) => {
      invalidateReadCache();
      deps.unregisterSubtree(ctx, absPath, node as TreeNode);
    },
    registerSubtree: (absPath: NodePath, node: unknown) => {
      invalidateReadCache();
      deps.registerSubtree(ctx, absPath, node as TreeNode);
    },
    getPathNode: (absPath: NodePath) => deps.getPathNode(ctx, absPath),
    emitScopeValue: (state) =>
      deps.emitScopeValue(state as TreeScopeState),
    emitArrayValue: (state) =>
      deps.emitArrayValue(state as TreeArrayState),
    markDirty: (state, segment) =>
      deps.markDirty(
        state as TreeScopeState | TreeArrayState,
        segment,
      ),
    cloneValue: deps.cloneValue,
  };
}

export function createArrayCommit(
  options: CreateArrayCommitOptions,
): (fn: (draft: unknown[]) => void) => void {
  const {
    deps,
    ctx,
    path,
    state,
    createTreeNode,
    resolvePatchValue,
    snapshot,
    getNode,
  } = options;

  const executor = createArrayExecutor(deps, state, path, getNode);
  const commitDeps = createCommitDeps(deps, ctx, createTreeNode, resolvePatchValue);

  return (fn: (draft: unknown[]) => void): void => {
    executor.runCommand(
      new ArrayCommitCommand(fn, {
        snapshot,
        createDraft: deps.createDraft,
        finishDraft: deps.finishDraft,
        applyArrayCommitDiff: deps.applyArrayCommitDiff,
        commitDeps,
      }),
      { structural: false },
    );
  };
}
