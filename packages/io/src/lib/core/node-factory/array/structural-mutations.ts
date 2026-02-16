import type { ArrayCommandDeps } from '../../commands/array-commands.js';
import {
  PopCommand,
  PushCommand,
  SetCommand,
  SortCommand,
  SpliceCommand,
} from '../../commands/array-commands.js';
import { createArrayExecutor } from '../../commands/executor.js';
import { createSnapshotCache } from '../../snapshot/snapshot-cache.js';
import { cloneValue } from '../../../utils/snapshot.js';
import type { CreateArrayMutationsOptions } from './array-ops.js';
import { createExecutorDeps } from '../executor-deps.js';

function validateSortPermutation(order: number[], length: number): void {
  if (order.length !== length)
    throw new Error('ioTree array: invalid sort order length');
  const seen = new Uint8Array(length);
  for (const oldIndex of order) {
    if (!Number.isInteger(oldIndex))
      throw new Error('ioTree array: invalid sort order index');
    if (oldIndex < 0 || oldIndex >= length)
      throw new Error('ioTree array: invalid sort order index');
    if (seen[oldIndex] === 1)
      throw new Error('ioTree array: invalid sort order permutation');
    seen[oldIndex] = 1;
  }
}

export function createArrayStructuralMutations(
  options: CreateArrayMutationsOptions,
): {
  applySplice: (
    start: number,
    deleteCount: number,
    items: unknown[],
    options?: { emitValue?: boolean },
  ) => void;
  applySortOrder: (order: number[], options?: { emitValue?: boolean }) => void;
  set: (next: unknown[]) => void;
  push: (...items: unknown[]) => void;
  pop: () => unknown;
  splice: (start: number, deleteCount: number, ...items: unknown[]) => void;
  sort: (compareFn?: (a: unknown, b: unknown) => number) => void;
} {
  const {
    deps,
    ctx,
    path,
    state,
    createTreeNode,
    resolvePatchValue,
    snapshot,
    rebuildMapping,
    getNode,
  } = options;

  const performSplice = (
    start: number,
    deleteCount: number,
    items: unknown[],
  ): { normalizedStart: number; dc: number; removedValues: unknown[] } => {
    const normalizedStart =
      start < 0 ? Math.max(0, state.children.length + start) : start;
    const dc = Math.max(
      0,
      Math.min(deleteCount, state.children.length - normalizedStart),
    );

    const removed = state.children.splice(normalizedStart, dc);
    const readCache = createSnapshotCache();
    const removedValues = new Array<unknown>(removed.length);
    for (let i = 0; i < removed.length; i += 1) {
      removedValues[i] = deps.snapshots.getNodeValue(removed[i], readCache);
    }
    for (let i = 0; i < removed.length; i += 1) {
      const child = removed[i];
      deps.lifecycle.detachChildFromArray(state, child);
      deps.registry.unregisterSubtree([...path, normalizedStart + i], child);
    }

    const created = items.map((v, i) =>
      createTreeNode(ctx, [...path, normalizedStart + i], v),
    );
    for (const child of created) deps.lifecycle.attachChildToArray(state, child);
    state.children.splice(normalizedStart, 0, ...created);
    rebuildMapping();

    return { normalizedStart, dc, removedValues };
  };

  const commandDeps: ArrayCommandDeps = {
    path,
    createTreeNode: (absPath, initial) => createTreeNode(ctx, absPath, initial),
    attachChildToArray: deps.lifecycle.attachChildToArray,
    detachChildFromArray: deps.lifecycle.detachChildFromArray,
    unregisterSubtree: (absPath, node) =>
      deps.registry.unregisterSubtree(absPath, node),
    getNodeValue: deps.snapshots.getNodeValue,
    cloneValue,
    resolvePatchValue,
    snapshot,
    rebuildMapping,
    performSplice,
    validateSortPermutation,
  };
  const executor = createArrayExecutor(createExecutorDeps(deps), state, path, getNode);

  const applySplice = (
    start: number,
    deleteCount: number,
    items: unknown[],
    options?: { emitValue?: boolean },
  ): void => {
    executor.runCommand(
      new SpliceCommand(commandDeps, start, deleteCount, items, {
        emitPatch: false,
      }),
      {
        emitUpdate: false,
        emitValue: options?.emitValue,
        structural: false,
      },
    );
  };

  const applySortOrder = (
    order: number[],
    options?: { emitValue?: boolean },
  ): void => {
    executor.runCommand(
      new SortCommand(commandDeps, { order }),
      {
        emitUpdate: false,
        emitValue: options?.emitValue,
        structural: false,
      },
    );
  };

  const push = (...items: unknown[]): void => {
    executor.runCommand(
      new PushCommand(commandDeps, items),
      { structural: false },
    );
  };

  const pop = (): unknown => {
    const command = new PopCommand(commandDeps);
    executor.runCommand(command, { structural: false });
    return command.result;
  };

  const splice = (
    start: number,
    deleteCount: number,
    ...items: unknown[]
  ): void => {
    executor.runCommand(
      new SpliceCommand(commandDeps, start, deleteCount, items),
      { structural: false },
    );
  };

  const set = (next: unknown[]): void => {
    executor.runCommand(new SetCommand(commandDeps, next), { structural: false });
  };

  const sort = (compareFn?: (a: unknown, b: unknown) => number): void => {
    executor.runCommand(
      new SortCommand(commandDeps, { compareFn }),
      { structural: false },
    );
  };

  return {
    applySplice,
    applySortOrder,
    set,
    push,
    pop,
    splice,
    sort,
  };
}
