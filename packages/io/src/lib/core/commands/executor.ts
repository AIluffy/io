import type { IoMutationOp, IoPath, IoPatch, IoUpdate } from '../../utils/types.js';
import type {
  TreeArrayState,
  TreeNode,
  TreeScopeState,
} from '../tree/io-tree-types.js';
import type { NodePath } from '../tree/path-trie.js';
import type { TreeCommand } from './command.js';

import { resetDirtyIndices } from '../mutation/dirty-indices.js';
import { nextEpoch, nextRevision } from '../../utils/branded.js';
import { SkipExecution } from './command.js';

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

function shouldSkipExecution(error: unknown): error is SkipExecution {
  return error instanceof SkipExecution;
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
  const runCommand = (
    command: TreeCommand<TreeArrayState>,
    options?: ExecuteOptions,
  ): IoUpdate | undefined => {
    try {
      command.validate?.(state);
      const baseRevision = state.revision;
      state.revision = nextRevision(state.revision);

      if (options?.structural !== false) {
        state.dirtyStructure = true;
        resetDirtyIndices(state.dirtyIndices, state.children.length);
      }

      const patches = command.execute(state);
      const update = deps.createUpdate(baseRevision, state.revision, patches);
      if (options?.emitUpdate !== false) deps.emitArrayUpdate(state, update);
      state.valueEpoch = nextEpoch(state.valueEpoch);
      if (options?.emitValue !== false) deps.emitArrayValue(state);
      return update;
    } catch (error) {
      if (shouldSkipExecution(error)) return undefined;
      deps.emitError(getNode(), error, path, command.op);
      throw error;
    }
  };

  return { runCommand };
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
  const runCommand = (
    command: TreeCommand<TreeScopeState>,
    options?: ExecuteOptions,
  ): IoUpdate | undefined => {
    state.isCommitting = true;
    try {
      try {
        command.validate?.(state);
        const baseRevision = state.revision;
        state.revision = nextRevision(state.revision);

        if (options?.structural !== false) {
          state.dirtyStructure = true;
        }

        const patches = command.execute(state);
        const update = deps.createUpdate(baseRevision, state.revision, patches);
        if (options?.emitUpdate !== false) deps.emitScopeUpdate(state, update);
        state.valueEpoch = nextEpoch(state.valueEpoch);
        if (options?.emitValue !== false) deps.emitScopeValue(state);
        return update;
      } catch (error) {
        if (shouldSkipExecution(error)) return undefined;
        deps.emitError(getNode(), error, path, command.op);
        throw error;
      }
    } finally {
      state.isCommitting = false;
    }
  };

  return { runCommand };
}
