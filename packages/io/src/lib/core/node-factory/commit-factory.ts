import type { IoUpdate } from '../../utils/types.js';
import type { TreeCommand } from '../commands/command.js';
import type { CommitCommandDeps } from '../commands/commit-command.js';
import type { ExecuteOptions } from '../commands/executor.js';
import type { TreeDeps } from '../types.js';
import type { NodePath } from '../tree/path-trie.js';
import type { TreeContext, TreeNode } from '../tree/io-tree-types.js';

import { CommitCommand } from '../commands/commit-command.js';
import { createExecutorDeps } from './executor-deps.js';
import { createSharedCommitDeps } from './shared-commit-deps.js';
import type { SharedCommitDeps } from './shared-commit-deps.js';

type CommitExecutor<TState> = {
  runCommand: (
    command: TreeCommand<TState>,
    options?: ExecuteOptions,
  ) => IoUpdate | undefined;
};

type CommitExecutorFactory<TState> = (
  deps: ReturnType<typeof createExecutorDeps>,
  state: TState,
  path: NodePath,
  getNode: () => TreeNode,
) => CommitExecutor<TState>;

type CreateCommitFactoryOptions<TState, TData> = {
  deps: TreeDeps;
  ctx: TreeContext;
  path: NodePath;
  state: TState;
  createTreeNode: (
    ctx: TreeContext,
    path: NodePath,
    initial: unknown,
  ) => TreeNode;
  resolvePatchValue: (value: unknown) => unknown;
  snapshot: () => TData;
  getNode: () => TreeNode;
  executorFactory: CommitExecutorFactory<TState>;
  applyDiff: (
    state: TState,
    before: TData,
    next: TData,
    deps: SharedCommitDeps,
    treeDeps: TreeDeps,
  ) => ReturnType<CommitCommandDeps<TData>['applyDiff']>;
  validateNext?: CommitCommandDeps<TData>['validateNext'];
};

export function createCommitFactory<TState, TData>(
  options: CreateCommitFactoryOptions<TState, TData>,
): (fn: (draft: TData) => void) => void {
  const {
    deps,
    ctx,
    path,
    state,
    createTreeNode,
    resolvePatchValue,
    snapshot,
    getNode,
    executorFactory,
    applyDiff,
    validateNext,
  } = options;

  const executor = executorFactory(createExecutorDeps(deps), state, path, getNode);
  const commitDeps = createSharedCommitDeps(
    deps,
    ctx,
    createTreeNode,
    resolvePatchValue,
  );

  return (fn: (draft: TData) => void): void => {
    executor.runCommand(
      new CommitCommand<TState, TData>(fn, {
        snapshot,
        createDraft: deps.utils.createDraft,
        finishDraft: deps.utils.finishDraft,
        validateNext,
        applyDiff: (currentState, before, next) =>
          applyDiff(currentState as TState, before, next, commitDeps, deps),
      }),
      { structural: false },
    );
  };
}
