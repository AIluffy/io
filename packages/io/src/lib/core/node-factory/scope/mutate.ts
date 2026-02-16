import { ScopeMutateCommand } from '../../commands/scope-commands.js';
import { createScopeExecutor } from '../../commands/executor.js';
import { isUnit } from '../../../units/unit.js';
import { createUpdate } from '../../../utils/patches/updates.js';
import type { TreeDeps } from '../../types.js';
import type { NodePath } from '../../tree/path-trie.js';
import type {
  TreeContext,
  TreeNode,
  TreeScopeState,
} from '../../tree/io-tree-types.js';

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
    isUnit,
    requireInternalOfKind: deps.internals.requireInternalOfKind,
    detachChildFromScope: deps.lifecycle.detachChildFromScope,
    unregisterSubtree: (absPath: NodePath, node: TreeNode) =>
      deps.registry.unregisterSubtree(absPath, node),
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
      {
        createUpdate,
        emitArrayValue: deps.subscriptions.emitArrayValue,
        emitArrayUpdate: deps.subscriptions.emitArrayUpdate,
        emitScopeValue: deps.subscriptions.emitScopeValue,
        emitScopeUpdate: deps.subscriptions.emitScopeUpdate,
        emitError: deps.emitError,
      },
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
