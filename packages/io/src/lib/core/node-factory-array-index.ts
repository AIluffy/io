import { isLink } from '../utils/link.js';

import type { CreateArrayMutationsOptions } from './node-factory-array-mutate-types.js';
import { markDirtyIndex } from './dirty-indices.js';

export function createArrayIndexMutation(
  options: CreateArrayMutationsOptions,
): {
  setIndex: (
    index: number,
    next: unknown,
    options?: { emitUpdate?: boolean; emitValue?: boolean },
  ) => void;
} {
  const { deps, ctx, path, state, createTreeNode, getNode } = options;

  const setIndex = (
    index: number,
    next: unknown,
    options?: { emitUpdate?: boolean; emitValue?: boolean },
  ) => {
    try {
      const existing = state.children[index];
      if (!existing)
        throw new Error(`ioTree array: index out of range ${index}`);

      const emitValue = options?.emitValue !== false;
      const emitUpdate = options?.emitUpdate !== false;
      const baseRevision = state.revision;

      if (isLink(next)) {
        const prevValue = deps.getNodeValue(existing, new WeakMap());
        deps.detachChildFromArray(state, existing);
        deps.unregisterSubtree(ctx, [...path, index], existing);
        const replaced = createTreeNode(ctx, [...path, index], next);
        state.children[index] = replaced;
        deps.attachChildToArray(state, replaced);
        state.revision += 1;
        markDirtyIndex(state.dirtyIndices, index, state.children.length);
        state.valueEpoch += 1;
        if (emitUpdate) {
          const nextValue = deps.getNodeValue(replaced, new WeakMap());
          deps.emitArrayUpdate(
            state,
            deps.createUpdate(baseRevision, state.revision, [
              {
                op: 'set',
                path: [index],
                prev: deps.cloneValue(prevValue),
                next: deps.cloneValue(nextValue),
              },
            ]),
          );
        }
        if (emitValue) deps.emitArrayValue(state);
        return;
      }

      if (deps.isUnit(existing)) {
        const internal = deps.getInternal(existing);
        if (!internal || internal.kind !== 'unit')
          throw new Error('ioTree array: invalid unit internal');
        const before = internal.getValue();
        internal.setValue(next, { emitUpdate: false, emitValue: false });
        const after = internal.getValue();
        if (Object.is(before, after)) return;
        state.revision += 1;
        state.valueEpoch += 1;
        markDirtyIndex(state.dirtyIndices, index, state.children.length);
        if (emitUpdate) {
          deps.emitArrayUpdate(
            state,
            deps.createUpdate(baseRevision, state.revision, [
              {
                op: 'set',
                path: [index],
                prev: deps.cloneValue(before),
                next: deps.cloneValue(after),
              },
            ]),
          );
        }
        if (emitValue) deps.emitArrayValue(state);
        return;
      }

      const prevValue = deps.getNodeValue(existing, new WeakMap());
      deps.detachChildFromArray(state, existing);
      deps.unregisterSubtree(ctx, [...path, index], existing);
      const replaced = createTreeNode(ctx, [...path, index], next);
      state.children[index] = replaced;
      deps.attachChildToArray(state, replaced);
      state.revision += 1;
      markDirtyIndex(state.dirtyIndices, index, state.children.length);
      state.valueEpoch += 1;
      if (emitUpdate) {
        deps.emitArrayUpdate(
          state,
          deps.createUpdate(baseRevision, state.revision, [
            {
              op: 'set',
              path: [index],
              prev: deps.cloneValue(prevValue),
              next: deps.cloneValue(next),
            },
          ]),
        );
      }
      if (emitValue) deps.emitArrayValue(state);
    } catch (error) {
      deps.emitError(getNode(), error, [...path, index], 'set');
      throw error;
    }
  };

  return { setIndex };
}
