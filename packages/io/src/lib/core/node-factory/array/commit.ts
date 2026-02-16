import type { TreeDeps } from '../../types.js';
import type { NodePath } from '../../tree/path-trie.js';
import type {
  TreeArrayState,
  TreeContext,
  TreeNode,
} from '../../tree/io-tree-types.js';

import { ArrayCommitCommand } from '../../commands/array-commit-command.js';
import { createArrayExecutor } from '../../commands/executor.js';
import { createExecutorDeps } from '../executor-deps.js';
import { createSharedCommitDeps } from '../shared-commit-deps.js';

type CreateArrayCommitOptions = {
  deps: TreeDeps;
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
  deps: TreeDeps,
  ctx: TreeContext,
  createTreeNode: (
    ctx: TreeContext,
    path: NodePath,
    initial: unknown,
  ) => TreeNode,
  resolvePatchValue: (value: unknown) => unknown,
): Parameters<TreeDeps['commit']['applyArrayCommitDiff']>[3] &
  Pick<TreeDeps['commit'], 'applyArrayCommitDiff'> {
  return {
    ...createSharedCommitDeps(deps, ctx, createTreeNode, resolvePatchValue),
    applyArrayCommitDiff: deps.commit.applyArrayCommitDiff,
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

  const executor = createArrayExecutor(createExecutorDeps(deps), state, path, getNode);
  const { applyArrayCommitDiff, ...commitDeps } = createCommitDeps(
    deps,
    ctx,
    createTreeNode,
    resolvePatchValue,
  );

  return (fn: (draft: unknown[]) => void): void => {
    executor.runCommand(
      new ArrayCommitCommand(fn, {
        snapshot,
        createDraft: deps.utils.createDraft,
        finishDraft: deps.utils.finishDraft,
        applyArrayCommitDiff,
        commitDeps,
      }),
      { structural: false },
    );
  };
}
