import type { TreeDeps } from '../../types.js';
import type { NodePath } from '../../tree/path-trie.js';
import type {
  TreeArrayState,
  TreeContext,
  TreeNode,
} from '../../tree/io-tree-types.js';

import { createArrayExecutor } from '../../commands/executor.js';
import { createCommitFactory } from '../commit-factory.js';

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

export function createArrayCommit(
  options: CreateArrayCommitOptions,
): (fn: (draft: unknown[]) => void) => void {
  return createCommitFactory<TreeArrayState, unknown[]>({
    ...options,
    executorFactory: createArrayExecutor,
    applyDiff: (state, before, next, commitDeps, deps) =>
      deps.commit.applyArrayCommitDiff(state, before, next, commitDeps),
  });
}
