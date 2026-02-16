import type { TreeDeps } from '../../types.js';
import type { NodePath } from '../../tree/path-trie.js';
import type {
  TreeContext,
  TreeNode,
  TreeScopeState,
} from '../../tree/io-tree-types.js';

import { CommitCommand } from '../../commands/commit-command.js';
import { createScopeExecutor } from '../../commands/executor.js';
import { createExecutorDeps } from '../executor-deps.js';
import { createSharedCommitDeps } from '../shared-commit-deps.js';

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

function createCommitDeps(
  deps: TreeDeps,
  ctx: TreeContext,
  createTreeNode: (
    ctx: TreeContext,
    path: NodePath,
    initial: unknown,
  ) => TreeNode,
  resolvePatchValue: (value: unknown) => unknown,
): Parameters<TreeDeps['commit']['applyScopeCommitDiff']>[3] &
  Pick<TreeDeps['commit'], 'applyScopeCommitDiff'> {
  return {
    ...createSharedCommitDeps(deps, ctx, createTreeNode, resolvePatchValue),
    applyScopeCommitDiff: deps.commit.applyScopeCommitDiff,
  };
}

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

  const executor = createScopeExecutor(
    createExecutorDeps(deps),
    state,
    path,
    getNode,
  );
  const { applyScopeCommitDiff, ...commitDeps } = createCommitDeps(
    deps,
    ctx,
    createTreeNode,
    resolvePatchValue,
  );

  return (fn: (draft: Record<string, unknown>) => void): void => {
    executor.runCommand(
      new CommitCommand<TreeScopeState, Record<string, unknown>>(fn, {
        snapshot,
        createDraft: deps.utils.createDraft,
        finishDraft: deps.utils.finishDraft,
        validateNext: (before, next) => {
          for (const key of Reflect.ownKeys(next as Record<PropertyKey, unknown>)) {
            if (!Reflect.has(before as object, key))
              throw new Error(`ioTree scope: unknown key ${String(key)}`);
          }
        },
        applyDiff: (currentState, before, next) =>
          applyScopeCommitDiff(
            currentState as TreeScopeState,
            before,
            next as Record<PropertyKey, unknown>,
            commitDeps,
          ),
      }),
      { structural: false },
    );
  };
}
