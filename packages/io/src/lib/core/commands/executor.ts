import type { IoMutationOp, IoPath, IoPatch, IoUpdate } from '../../utils/types/types.js';
import type { Revision, ValueEpoch } from '../../utils/types/branded.js';
import type {
  TreeArrayState,
  TreeNode,
  TreeScopeState,
} from '../tree/io-tree-types.js';
import type { NodePath } from '../tree/path-trie.js';
import type { TreeCommand } from './command.js';

import { resetDirtyIndices } from '../mutation/dirty-indices.js';
import { profileEnd, profileStart } from '../mutation/commit-profile.js';
import { nextEpoch, nextRevision } from '../../utils/types/branded.js';

export type ExecuteOptions = {
  emitValue?: boolean;
  emitUpdate?: boolean;
  structural?: boolean;
};

type ExecutorDeps = {
  createUpdate: (base: number, next: number, patches: IoPatch[]) => IoUpdate;
  emitArrayValue: (state: TreeArrayState) => void;
  emitArrayUpdate: (state: TreeArrayState, update: IoUpdate) => void;
  emitScopeValue: (state: TreeScopeState) => void;
  emitScopeUpdate: (state: TreeScopeState, update: IoUpdate) => void;
  emitError: (
    target: unknown,
    error: unknown,
    path: IoPath,
    operation: IoMutationOp,
  ) => void;
};

type ExecutorState = {
  revision: Revision;
  valueEpoch: ValueEpoch;
  dirtyStructure: boolean;
};

type ExecutorConfig<TState extends ExecutorState> = {
  beforeExecute?: (state: TState) => void;
  afterExecute?: (state: TState) => void;
  onStructural?: (state: TState) => void;
  emitUpdate: (state: TState, update: IoUpdate) => void;
  emitValue: (state: TState) => void;
};

function createExecutor<TState extends ExecutorState>(
  deps: ExecutorDeps,
  state: TState,
  path: NodePath,
  getNode: () => TreeNode,
  config: ExecutorConfig<TState>,
): {
  runCommand: (command: TreeCommand<TState>, options?: ExecuteOptions) => IoUpdate | undefined;
} {
  const runCommand = (
    command: TreeCommand<TState>,
    options?: ExecuteOptions,
  ): IoUpdate | undefined => {
    config.beforeExecute?.(state);
    try {
      if (command.validate && !command.validate(state)) return undefined;
      const patches = command.execute(state);
      if (!patches) return undefined;

      if (options?.structural !== false) {
        state.dirtyStructure = true;
        config.onStructural?.(state);
      }

      const baseRevision = state.revision;
      state.revision = nextRevision(state.revision);
      const createUpdateStart = command.op === 'commit' ? profileStart() : 0;
      const update = deps.createUpdate(baseRevision, state.revision, patches);
      if (createUpdateStart !== 0)
        profileEnd('commit.executor.createUpdate', createUpdateStart);
      if (options?.emitUpdate !== false) {
        const emitUpdateStart = command.op === 'commit' ? profileStart() : 0;
        config.emitUpdate(state, update);
        if (emitUpdateStart !== 0)
          profileEnd('commit.notifications.emitUpdate', emitUpdateStart);
      }
      state.valueEpoch = nextEpoch(state.valueEpoch);
      if (options?.emitValue !== false) {
        const emitValueStart = command.op === 'commit' ? profileStart() : 0;
        config.emitValue(state);
        if (emitValueStart !== 0)
          profileEnd('commit.notifications.emitValue', emitValueStart);
      }
      return update;
    } catch (error) {
      deps.emitError(getNode(), error, path, command.op);
      throw error;
    } finally {
      config.afterExecute?.(state);
    }
  };

  return { runCommand };
}

export function createArrayExecutor(
  deps: ExecutorDeps,
  state: TreeArrayState,
  path: NodePath,
  getNode: () => TreeNode,
): {
  runCommand: (
    command: TreeCommand<TreeArrayState>,
    options?: ExecuteOptions,
  ) => IoUpdate | undefined;
} {
  return createExecutor(deps, state, path, getNode, {
    onStructural: (currentState) => {
      resetDirtyIndices(currentState.dirtyIndices, currentState.children.length);
    },
    emitUpdate: (currentState, update) =>
      deps.emitArrayUpdate(currentState, update),
    emitValue: (currentState) => deps.emitArrayValue(currentState),
  });
}

export function createScopeExecutor(
  deps: ExecutorDeps,
  state: TreeScopeState,
  path: NodePath,
  getNode: () => TreeNode,
): {
  runCommand: (
    command: TreeCommand<TreeScopeState>,
    options?: ExecuteOptions,
  ) => IoUpdate | undefined;
} {
  return createExecutor(deps, state, path, getNode, {
    beforeExecute: (currentState) => {
      currentState.isCommitting = true;
    },
    afterExecute: (currentState) => {
      currentState.isCommitting = false;
    },
    emitUpdate: (currentState, update) =>
      deps.emitScopeUpdate(currentState, update),
    emitValue: (currentState) => deps.emitScopeValue(currentState),
  });
}
