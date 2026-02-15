import { ScopeMutateCommand } from '../../commands/scope-commands.js';
import { createScopeExecutor } from '../../commands/executor.js';
import type { TreeDeps } from '../../types.js';
import type { NodePath } from '../../tree/path-trie.js';
import type {
  TreeContext,
  TreeNode,
  TreeScopeState,
} from '../../tree/io-tree-types.js';
import { createExecutorDeps } from '../executor-deps.js';

type CreateScopeMutationsOptions = {
  deps: TreeDeps;
  ctx: TreeContext;
  path: NodePath;
  state: TreeScopeState;
  createTreeNode: (
    ctx: TreeContext,
    path: NodePath,
    initial: unknown,
  ) => TreeNode;
  getNode: () => TreeNode;
};

export function createScopeMutations(
  options: CreateScopeMutationsOptions,
): {
  applySet: (
    key: PropertyKey,
    next: unknown,
  options?: { emitUpdate?: boolean; emitValue?: boolean },
  ) => void;
} {
  const { deps, ctx, path, state, createTreeNode, getNode } = options;
  const commandDeps = {
    path,
    isUnit: deps.utils.isUnit,
    requireInternalOfKind: deps.internals.requireInternalOfKind,
    detachChildFromScope: deps.lifecycle.detachChildFromScope,
    unregisterSubtree: (absPath: NodePath, node: TreeNode) =>
      deps.registry.unregisterSubtree(ctx, absPath, node),
    createTreeNode: (absPath: NodePath, initial: unknown) =>
      createTreeNode(ctx, absPath, initial),
    attachChildToScope: deps.lifecycle.attachChildToScope,
    markDirty: deps.subscriptions.markDirty,
  };

  const applySet = (
    key: PropertyKey,
    next: unknown,
    options?: { emitUpdate?: boolean; emitValue?: boolean },
  ): void => {
    createScopeExecutor(
      createExecutorDeps(deps),
      state,
      [...path, key],
      getNode,
    ).runCommand(
      new ScopeMutateCommand(commandDeps, key, next, options),
      {
        emitUpdate: false,
        emitValue: options?.emitValue,
        structural: false,
      },
    );
  };

  return { applySet };
}
