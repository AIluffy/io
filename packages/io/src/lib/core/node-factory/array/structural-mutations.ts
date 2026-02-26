import {
  type ArrayChildrenContext,
  type ArrayLifecycleContext,
  type ArrayPatchContext,
  type ArrayReadContext,
  type ArrayStructureContext,
  PopCommand,
  PushCommand,
  SetCommand,
  SortCommand,
  SpliceCommand,
} from '../../commands/array-commands.js';
import { createArrayExecutor } from '../../commands/executor.js';
import { createSnapshotCache } from '../../snapshot/snapshot-cache.js';
import { cloneValue } from '../../../utils/immutable/immutable.js';
import { createUpdate } from '../../../utils/patches/updates.js';
import { appendPath } from '../../tree/path-utils.js';
import type { NodePath } from '../../tree/path-trie.js';
import type { TreeNode } from '../../tree/io-tree-types.js';
import type { CreateArrayMutationsOptions } from './array-ops.js';

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
    const length = state.children.length;
    const normalizedStart =
      start < 0 ? Math.max(0, length + start) : Math.min(start, length);
    const dc = Math.max(
      0,
      Math.min(deleteCount, length - normalizedStart),
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
      deps.registry.unregisterSubtree(
        appendPath(state.path, normalizedStart + i),
        child,
      );
    }

    const created = items.map((v, i) =>
      createTreeNode(ctx, appendPath(state.path, normalizedStart + i), v),
    );
    for (const child of created) deps.lifecycle.attachChildToArray(state, child);
    state.children.splice(normalizedStart, 0, ...created);
    rebuildMapping();

    return { normalizedStart, dc, removedValues };
  };

  const childrenContext: ArrayChildrenContext = {
    getPath: () => state.path,
    createTreeNode: (absPath: NodePath, initial: unknown) =>
      createTreeNode(ctx, absPath, initial),
  };
  const lifecycleContext: ArrayLifecycleContext = {
    attachChildToArray: deps.lifecycle.attachChildToArray,
    detachChildFromArray: deps.lifecycle.detachChildFromArray,
    unregisterSubtree: (absPath: NodePath, node: TreeNode) =>
      deps.registry.unregisterSubtree(absPath, node),
  };
  const readContext: ArrayReadContext = {
    getNodeValue: deps.snapshots.getNodeValue,
    snapshot,
  };
  const patchContext: ArrayPatchContext = {
    cloneValue,
    resolvePatchValue,
  };
  const structureContext: ArrayStructureContext = {
    rebuildMapping,
    performSplice,
    validateSortPermutation,
  };
  const executor = createArrayExecutor(
    {
      createUpdate,
      emitArrayValue: deps.subscriptions.emitArrayValue,
      emitArrayUpdate: deps.subscriptions.emitArrayUpdate,
      emitScopeValue: deps.subscriptions.emitScopeValue,
      emitScopeUpdate: deps.subscriptions.emitScopeUpdate,
      emitError: deps.emitError,
    },
    state,
    () => state.path,
    getNode,
  );

  const applySplice = (
    start: number,
    deleteCount: number,
    items: unknown[],
    options?: { emitValue?: boolean },
  ): void => {
    executor.runCommand(
      new SpliceCommand(
        structureContext,
        patchContext,
        start,
        deleteCount,
        items,
        { emitPatch: false },
      ),
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
      new SortCommand(readContext, structureContext, { order }),
      {
        emitUpdate: false,
        emitValue: options?.emitValue,
        structural: false,
      },
    );
  };

  const push = (...items: unknown[]): void => {
    executor.runCommand(
      new PushCommand(
        childrenContext,
        lifecycleContext,
        patchContext,
        structureContext,
        items,
      ),
      { structural: false },
    );
  };

  const pop = (): unknown => {
    const command = new PopCommand(
      childrenContext,
      lifecycleContext,
      readContext,
      patchContext,
      structureContext,
    );
    executor.runCommand(command, { structural: false });
    return command.result;
  };

  const splice = (
    start: number,
    deleteCount: number,
    ...items: unknown[]
  ): void => {
    executor.runCommand(
      new SpliceCommand(
        structureContext,
        patchContext,
        start,
        deleteCount,
        items,
      ),
      { structural: false },
    );
  };

  const set = (next: unknown[]): void => {
    executor.runCommand(
      new SetCommand(readContext, patchContext, structureContext, next),
      { structural: false },
    );
  };

  const sort = (compareFn?: (a: unknown, b: unknown) => number): void => {
    executor.runCommand(
      new SortCommand(readContext, structureContext, { compareFn }),
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
