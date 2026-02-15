import { isLink } from '../../../utils/link.js';
import type { IoPatch } from '../../../utils/types.js';

import type { CreateArrayMutationsOptions } from './array-ops.js';
import { markDirtyIndex } from '../../mutation/dirty-indices.js';
import { nextEpoch, nextRevision } from '../../../utils/branded.js';
import { createSnapshotCache } from '../../snapshot/snapshot-cache.js';
import type { SnapshotCache } from '../../snapshot/snapshot-cache.js';

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
  const postSetIndex = (
    index: number,
    baseRevision: number,
    patch: IoPatch | null,
    flags: { emitUpdate: boolean; emitValue: boolean },
  ): void => {
    state.revision = nextRevision(state.revision);
    markDirtyIndex(state.dirtyIndices, index, state.children.length);
    state.valueEpoch = nextEpoch(state.valueEpoch);
    if (flags.emitUpdate && patch) {
      deps.subscriptions.emitArrayUpdate(
        state,
        deps.utils.createUpdate(baseRevision, state.revision, [patch]),
      );
    }
    if (flags.emitValue) deps.subscriptions.emitArrayValue(state);
  };

  const setIndex = (
    index: number,
    next: unknown,
    options?: { emitUpdate?: boolean; emitValue?: boolean },
  ) => {
    try {
      let readCache: SnapshotCache | undefined;
      const readNodeValue = (node: (typeof state.children)[number]): unknown =>
        deps.snapshots.getNodeValue(
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
        deps.lifecycle.detachChildFromArray(state, existing);
        deps.registry.unregisterSubtree(ctx, [...path, index], existing);
        const replaced = createTreeNode(ctx, [...path, index], next);
        state.children[index] = replaced;
        deps.lifecycle.attachChildToArray(state, replaced);
        readCache?.clear();
        const nextValue = shouldEmitUpdate ? readNodeValue(replaced) : undefined;
        postSetIndex(
          index,
          baseRevision,
          shouldEmitUpdate
            ? {
                op: 'set',
                path: [index],
                prev: deps.utils.cloneValue(prevValue),
                next: deps.utils.cloneValue(nextValue),
              }
            : null,
          { emitUpdate: shouldEmitUpdate, emitValue },
        );
        return;
      }

      if (deps.utils.isUnit(existing)) {
        const internal = deps.internals.getInternal(existing);
        if (!internal || internal.kind !== 'unit')
          throw new Error('ioTree array: invalid unit internal');
        const before = internal.getValue();
        internal.setValue(next, { emitUpdate: false, emitValue: false });
        const after = internal.getValue();
        if (Object.is(before, after)) return;
        postSetIndex(
          index,
          baseRevision,
          shouldEmitUpdate
            ? {
                op: 'set',
                path: [index],
                prev: deps.utils.cloneValue(before),
                next: deps.utils.cloneValue(after),
              }
            : null,
          { emitUpdate: shouldEmitUpdate, emitValue },
        );
        return;
      }

      const prevValue = readNodeValue(existing);
      deps.lifecycle.detachChildFromArray(state, existing);
      deps.registry.unregisterSubtree(ctx, [...path, index], existing);
      const replaced = createTreeNode(ctx, [...path, index], next);
      state.children[index] = replaced;
      deps.lifecycle.attachChildToArray(state, replaced);
      postSetIndex(
        index,
        baseRevision,
        shouldEmitUpdate
          ? {
              op: 'set',
              path: [index],
              prev: deps.utils.cloneValue(prevValue),
              next: deps.utils.cloneValue(next),
            }
          : null,
        { emitUpdate: shouldEmitUpdate, emitValue },
      );
    } catch (error) {
      deps.utils.emitError(getNode(), error, [...path, index], 'set');
      throw error;
    }
  };

  return { setIndex };
}
