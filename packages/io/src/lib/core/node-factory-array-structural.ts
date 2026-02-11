import type { IoPatch } from '../utils/types.js';

import type { CreateArrayMutationsOptions } from './node-factory-array-mutate-types.js';
import { clearDirtyIndices, resetDirtyIndices } from './dirty-indices.js';

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
  applySortOrder: (
    order: number[],
    options?: { emitValue?: boolean },
  ) => void;
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
  ) => {
    const normalizedStart =
      start < 0 ? Math.max(0, state.children.length + start) : start;
    const dc = Math.max(
      0,
      Math.min(deleteCount, state.children.length - normalizedStart),
    );

    const removed = state.children.splice(normalizedStart, dc);
    const removedValues = removed.map((c) =>
      deps.getNodeValue(c, new WeakMap()),
    );
    for (let i = 0; i < removed.length; i += 1) {
      const child = removed[i];
      deps.detachChildFromArray(state, child);
      deps.unregisterSubtree(ctx, [...path, normalizedStart + i], child);
    }

    const created = items.map((v, i) =>
      createTreeNode(ctx, [...path, normalizedStart + i], v),
    );
    for (const child of created) deps.attachChildToArray(state, child);
    state.children.splice(normalizedStart, 0, ...created);
    rebuildMapping();

    return { normalizedStart, dc, removedValues };
  };

  const applySplice = (
    start: number,
    deleteCount: number,
    items: unknown[],
    options?: { emitValue?: boolean },
  ) => {
    try {
      state.revision += 1;
      performSplice(start, deleteCount, items);
      state.dirtyStructure = true;
      resetDirtyIndices(state.dirtyIndices, state.children.length);
      state.valueEpoch += 1;
      if (options?.emitValue !== false) deps.emitArrayValue(state);
    } catch (error) {
      deps.emitError(getNode(), error, path, 'splice');
      throw error;
    }
  };

  const applySortOrder = (
    order: number[],
    options?: { emitValue?: boolean },
  ) => {
    try {
      validateSortPermutation(order, state.children.length);
      const old = state.children.slice();
      state.children = order.map((oldIndex) => old[oldIndex]);
      rebuildMapping();
      state.revision += 1;
      state.dirtyStructure = true;
      clearDirtyIndices(state.dirtyIndices);
      state.valueEpoch += 1;
      if (options?.emitValue !== false) deps.emitArrayValue(state);
    } catch (error) {
      deps.emitError(getNode(), error, path, 'sort');
      throw error;
    }
  };

  const push = (...items: unknown[]): void => {
    try {
      if (items.length === 0) return;
      const baseRevision = state.revision;
      state.revision += 1;
      state.dirtyStructure = true;
      resetDirtyIndices(state.dirtyIndices, state.children.length + items.length);

      const start = state.children.length;
      const created = items.map((v, i) =>
        createTreeNode(ctx, [...path, start + i], v),
      );
      for (const child of created) deps.attachChildToArray(state, child);
      state.children.push(...created);
      rebuildMapping();

      const patch: IoPatch = {
        op: 'splice',
        path: [],
        start,
        deleteCount: 0,
        deleted: [],
        items: items.map((v) => resolvePatchValue(v)),
      };
      deps.emitArrayUpdate(
        state,
        deps.createUpdate(baseRevision, state.revision, [patch]),
      );
      state.valueEpoch += 1;
      deps.emitArrayValue(state);
    } catch (error) {
      deps.emitError(getNode(), error, path, 'push');
      throw error;
    }
  };

  const pop = (): unknown => {
    try {
      if (state.children.length === 0) return undefined;
      const baseRevision = state.revision;
      state.revision += 1;
      state.dirtyStructure = true;
      resetDirtyIndices(state.dirtyIndices, state.children.length - 1);

      const start = state.children.length - 1;
      const removed = state.children.pop();
      if (!removed) return undefined;
      const removedValue = deps.getNodeValue(removed, new WeakMap());
      deps.detachChildFromArray(state, removed);
      deps.unregisterSubtree(ctx, [...path, start], removed);
      rebuildMapping();

      const patch: IoPatch = {
        op: 'splice',
        path: [],
        start,
        deleteCount: 1,
        deleted: [deps.cloneValue(removedValue)],
        items: [],
      };
      deps.emitArrayUpdate(
        state,
        deps.createUpdate(baseRevision, state.revision, [patch]),
      );
      state.valueEpoch += 1;
      deps.emitArrayValue(state);
      return removedValue;
    } catch (error) {
      deps.emitError(getNode(), error, path, 'pop');
      throw error;
    }
  };

  const splice = (
    start: number,
    deleteCount: number,
    ...items: unknown[]
  ): void => {
    try {
      const baseRevision = state.revision;
      state.revision += 1;
      state.dirtyStructure = true;

      const { normalizedStart, dc, removedValues } = performSplice(
        start,
        deleteCount,
        items,
      );
      resetDirtyIndices(state.dirtyIndices, state.children.length);
      const patch: IoPatch = {
        op: 'splice',
        path: [],
        start: normalizedStart,
        deleteCount: dc,
        deleted: removedValues.map((v) => deps.cloneValue(v)),
        items: items.map((v) => resolvePatchValue(v)),
      };
      deps.emitArrayUpdate(
        state,
        deps.createUpdate(baseRevision, state.revision, [patch]),
      );
      state.valueEpoch += 1;
      deps.emitArrayValue(state);
      rebuildMapping();
    } catch (error) {
      deps.emitError(getNode(), error, path, 'splice');
      throw error;
    }
  };

  const set = (next: unknown[]): void => {
    try {
      const baseRevision = state.revision;
      const prevValue = snapshot();

      state.revision += 1;
      state.dirtyStructure = true;

      performSplice(0, state.children.length, next);
      resetDirtyIndices(state.dirtyIndices, state.children.length);
      rebuildMapping();
      state.valueEpoch += 1;

      const patch: IoPatch = {
        op: 'set',
        path: [],
        prev: deps.cloneValue(prevValue),
        next: deps.cloneValue(next.map((v) => resolvePatchValue(v))),
      };
      deps.emitArrayUpdate(
        state,
        deps.createUpdate(baseRevision, state.revision, [patch]),
      );
      deps.emitArrayValue(state);
    } catch (error) {
      deps.emitError(getNode(), error, path, 'set');
      throw error;
    }
  };

  const sort = (compareFn?: (a: unknown, b: unknown) => number): void => {
    try {
      if (state.children.length <= 1) return;
      const baseRevision = state.revision;
      state.revision += 1;
      state.dirtyStructure = true;
      clearDirtyIndices(state.dirtyIndices);

      const decorated = state.children.map((child, index) => ({
        child,
        index,
        value: deps.getNodeValue(child, new WeakMap()),
      }));
      decorated.sort((a, b) => {
        const av = a.value;
        const bv = b.value;
        if (compareFn) return compareFn(av, bv);
        if (typeof av === 'number' && typeof bv === 'number') return av - bv;
        const as = String(av);
        const bs = String(bv);
        if (as === bs) return 0;
        return as > bs ? 1 : -1;
      });
      const order = decorated.map((d) => d.index);
      state.children = decorated.map((d) => d.child);
      rebuildMapping();

      deps.emitArrayUpdate(
        state,
        deps.createUpdate(baseRevision, state.revision, [
          { op: 'sort', path: [], order },
        ]),
      );
      state.valueEpoch += 1;
      deps.emitArrayValue(state);
    } catch (error) {
      deps.emitError(getNode(), error, path, 'sort');
      throw error;
    }
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
