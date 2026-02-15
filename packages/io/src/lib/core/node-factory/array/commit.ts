import { ArrayCommitCommand } from '../../commands/array-commit-command.js';
import { buildCommitDeps } from '../../commands/commit-deps-builder.js';
import { createArrayExecutor } from '../../commands/executor.js';
import type { NodeCreationDeps } from '../../deps/node-creation-deps.js';
import type { NodePath } from '../../tree/path-trie.js';
import type {
  TreeArrayState,
  TreeContext,
  TreeNode,
} from '../../tree/io-tree-types.js';

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
  const commitDeps = buildCommitDeps(deps, ctx, createTreeNode, resolvePatchValue);

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
