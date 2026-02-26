import { ScopeMutateCommand } from '../../commands/scope-commands.js';
import { createScopeExecutor } from '../../commands/executor.js';
import { isUnit } from '../../../units/unit.js';
import { createUpdate } from '../../../utils/patches/updates.js';
import { appendPath } from '../../tree/path-utils.js';
import type { TreeDepsSlice } from '../../types.js';
import type { NodePath } from '../../tree/path-trie.js';
import type {
  TreeContext,
  TreeNode,
  TreeScopeState,
} from '../../tree/io-tree-types.js';

type ScopeMutationDeps = TreeDepsSlice<
  'emitError' | 'subscriptions' | 'internals' | 'lifecycle' | 'registry'
>;

type CreateScopeMutationsOptions = {
  deps: ScopeMutationDeps;
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
    options?: { emitValue?: boolean },
  ) => void;
} {
  const { deps, ctx, state, createTreeNode, getNode } = options;
  const commandDeps = {
    getPath: () => state.path,
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

  const executors = new Map<PropertyKey, ReturnType<typeof createScopeExecutor>>();
  const resolveExecutor = (
    key: PropertyKey,
  ): ReturnType<typeof createScopeExecutor> => {
    const existing = executors.get(key);
    if (existing) return existing;

    const created = createScopeExecutor(
      {
        createUpdate,
        emitArrayValue: deps.subscriptions.emitArrayValue,
        emitArrayUpdate: deps.subscriptions.emitArrayUpdate,
        emitScopeValue: deps.subscriptions.emitScopeValue,
        emitScopeUpdate: deps.subscriptions.emitScopeUpdate,
        emitError: deps.emitError,
      },
      state,
      () => appendPath(state.path, key),
      getNode,
    );
    executors.set(key, created);
    return created;
  };

  const applySet = (
    key: PropertyKey,
    next: unknown,
    options?: { emitValue?: boolean },
  ): void => {
    resolveExecutor(key).runCommand(
      new ScopeMutateCommand(commandDeps, key, next, options),
      {
        emitValue: options?.emitValue,
        structural: false,
      },
    );
  };

  return { applySet };
}
