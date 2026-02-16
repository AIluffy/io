import type { TreeDeps } from '../../types.js';
import type { NodePath } from '../../tree/path-trie.js';
import type {
  TreeContext,
  TreeNode,
  TreeScopeState,
} from '../../tree/io-tree-types.js';

import { createScopeExecutor } from '../../commands/executor.js';
import { createCommitFactory } from '../commit-factory.js';

type CreateScopeCommitOptions = {
  deps: TreeDeps;
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
  return createCommitFactory<TreeScopeState, Record<string, unknown>>({
    ...options,
    executorFactory: createScopeExecutor,
    validateNext: (before, next) => {
      for (const key of Reflect.ownKeys(next as Record<PropertyKey, unknown>)) {
        if (!Reflect.has(before as object, key))
          throw new Error(`ioTree scope: unknown key ${String(key)}`);
      }
    },
    applyDiff: (state, before, next, commitDeps, deps) =>
      deps.commit.applyScopeCommitDiff(
        state,
        before,
        next as Record<PropertyKey, unknown>,
        commitDeps,
      ),
  });
}
