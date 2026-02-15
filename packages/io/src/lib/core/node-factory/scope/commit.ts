import { ScopeCommitCommand } from '../../commands/scope-commands.js';
import { buildCommitDeps } from '../../commands/commit-deps-builder.js';
import { createScopeExecutor } from '../../commands/executor.js';
import type { NodeCreationDeps } from '../../deps/node-creation-deps.js';
import type { NodePath } from '../../tree/path-trie.js';
import type {
  TreeContext,
  TreeNode,
  TreeScopeState,
} from '../../tree/io-tree-types.js';

type CreateScopeCommitOptions = {
  deps: NodeCreationDeps;
  ctx: TreeContext;
  path: NodePath;
  state: TreeScopeState;
  createTreeNode: (
    ctx: TreeContext,
    path: NodePath,
    initial: unknown,
  ) => TreeNode;
  resolvePatchValue: (value: unknown) => unknown;
  snapshot: () => Record<string, unknown>;
  getNode: () => TreeNode;
};

export function createScopeCommit(
  options: CreateScopeCommitOptions,
): (fn: (draft: Record<string, unknown>) => void) => void {
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

  const executor = createScopeExecutor(deps, state, path, getNode);
  const commitDeps = buildCommitDeps(deps, ctx, createTreeNode, resolvePatchValue);

  return (fn: (draft: Record<string, unknown>) => void): void => {
    executor.runCommand(
      new ScopeCommitCommand(fn, {
        snapshot,
        createDraft: deps.createDraft,
        finishDraft: deps.finishDraft,
        applyScopeCommitDiff: deps.applyScopeCommitDiff,
        commitDeps,
      }),
      { structural: false },
    );
  };
}
