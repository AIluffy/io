import type { TreeDeps } from '../types.js';
import type { createArrayExecutor } from '../commands/executor.js';

type ExecutorDeps = Parameters<typeof createArrayExecutor>[0];

export function createExecutorDeps(deps: TreeDeps): ExecutorDeps {
  return {
    createUpdate: deps.utils.createUpdate,
    emitArrayValue: deps.subscriptions.emitArrayValue,
    emitArrayUpdate: deps.subscriptions.emitArrayUpdate,
    emitScopeValue: deps.subscriptions.emitScopeValue,
    emitScopeUpdate: deps.subscriptions.emitScopeUpdate,
    emitError: deps.utils.emitError,
  };
}
