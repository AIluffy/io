import { isLink } from '../../../utils/link.js';

import type { CreateArrayMutationsOptions } from './mutate-types.js';
import { markDirtyIndex } from '../../dirty-indices.js';
import { nextEpoch, nextRevision } from '../../../utils/branded.js';
import { createSnapshotCache } from '../../snapshot-cache.js';
import type { SnapshotCache } from '../../snapshot-cache.js';

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
      let readCache: SnapshotCache | undefined;
      const readNodeValue = (node: (typeof state.children)[number]): unknown =>
        deps.getNodeValue(
          node,
          (readCache ??= createSnapshotCache()),
        );

      const existing = state.children[index];
      if (!existing)
        throw new Error(`ioTree array: index out of range ${index}`);

      const emitValue = options?.emitValue !== false;
      const emitUpdate = options?.emitUpdate !== false;
      const stateWithListeners = state as {
        updateListeners?: Set<(u: unknown) => void>;
      };
      const shouldEmitUpdate = emitUpdate && (
        stateWithListeners.updateListeners === undefined ||
        stateWithListeners.updateListeners.size > 0
      );
      const baseRevision = state.revision;

      if (isLink(next)) {
        const prevValue = readNodeValue(existing);
        deps.detachChildFromArray(state, existing);
        deps.unregisterSubtree(ctx, [...path, index], existing);
        const replaced = createTreeNode(ctx, [...path, index], next);
        state.children[index] = replaced;
        deps.attachChildToArray(state, replaced);
        readCache?.clear();
        state.revision = nextRevision(state.revision);
        markDirtyIndex(state.dirtyIndices, index, state.children.length);
        state.valueEpoch = nextEpoch(state.valueEpoch);
        if (shouldEmitUpdate) {
          const nextValue = readNodeValue(replaced);
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
        state.revision = nextRevision(state.revision);
        state.valueEpoch = nextEpoch(state.valueEpoch);
        markDirtyIndex(state.dirtyIndices, index, state.children.length);
        if (shouldEmitUpdate) {
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

      const prevValue = readNodeValue(existing);
      deps.detachChildFromArray(state, existing);
      deps.unregisterSubtree(ctx, [...path, index], existing);
      const replaced = createTreeNode(ctx, [...path, index], next);
      state.children[index] = replaced;
      deps.attachChildToArray(state, replaced);
      state.revision = nextRevision(state.revision);
      markDirtyIndex(state.dirtyIndices, index, state.children.length);
      state.valueEpoch = nextEpoch(state.valueEpoch);
      if (shouldEmitUpdate) {
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
