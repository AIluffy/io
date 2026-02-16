import type { IoUnsubscribe, IoUpdate } from '../../utils/types/types.js';
import type { DirtyIndexState } from './dirty-indices.js';
import { markDirtyIndex } from './dirty-indices.js';
import type { Revision, ValueEpoch } from '../../utils/types/branded.js';

import { notifyUpdate, notifyValue } from '../../utils/reactive/batch.js';
import { createUpdate } from '../../utils/patches/updates.js';
import { prependPatchPath } from '../../utils/patches/patch-path.js';
import { nextEpoch, nextRevision } from '../../utils/types/branded.js';
import { isIndexKey } from '../../utils/internal/is-index-key.js';
import {
  subscribeIndexedChild,
  subscribeKeyedChild,
} from './bubbling.js';

type ScopeStateLike<TNode> = {
  children: Map<PropertyKey, TNode>;
  revision: Revision;
  isCommitting: boolean;
  valueEpoch: ValueEpoch;
  dirtyKeys: Set<PropertyKey>;
  valueListeners: Set<(value: Record<string, unknown>) => void>;
  updateListeners: Set<(update: IoUpdate) => void>;
  childValueUnsubs: Map<PropertyKey, IoUnsubscribe>;
  childUpdateUnsubs: Map<PropertyKey, IoUnsubscribe>;
};

type ArrayStateLike<TNode> = {
  children: TNode[];
  childIndices?: Map<TNode, Set<number>>;
  childIndicesDirty?: boolean;
  revision: Revision;
  isCommitting: boolean;
  valueEpoch: ValueEpoch;
  dirtyIndices: DirtyIndexState;
  valueListeners: Set<(value: unknown[]) => void>;
  updateListeners: Set<(update: IoUpdate) => void>;
  childValueUnsubs: Map<TNode, { unsub: IoUnsubscribe; count: number }>;
  childUpdateUnsubs: Map<TNode, { unsub: IoUnsubscribe; count: number }>;
};

type SnapshotDeps<TScopeState, TArrayState> = {
  getScopeSnapshot: (state: TScopeState) => Record<string, unknown>;
  getArraySnapshot: (state: TArrayState) => unknown[];
};

/**
 * Creates subscription wiring helpers for scope/array nodes.
 *
 * Responsibilities:
 * - Emit value/update notifications with revision/valueEpoch updates.
 * - Bubble child events to parent paths (keyed/indexed).
 * - Track dirty keys/indices so snapshot rebuild stays incremental.
 */
export function createSubscriptions<
  TNode,
  TScopeState extends ScopeStateLike<TNode>,
  TArrayState extends ArrayStateLike<TNode>,
>(deps: SnapshotDeps<TScopeState, TArrayState>) {
  const rebuildArrayChildIndices = (state: TArrayState): void => {
    if (!state.childIndices) return;
    state.childIndices.clear();
    for (let i = 0; i < state.children.length; i += 1) {
      const child = state.children[i];
      const indices = state.childIndices.get(child);
      if (indices) {
        indices.add(i);
      } else {
        state.childIndices.set(child, new Set([i]));
      }
    }
    if ('childIndicesDirty' in state) state.childIndicesDirty = false;
  };

  const resolveArrayChildIndices = (
    state: TArrayState,
    child: TNode,
  ): number[] => {
    if (!state.childIndices) {
      const indices: number[] = [];
      for (let i = 0; i < state.children.length; i += 1) {
        if (state.children[i] === child) indices.push(i);
      }
      return indices;
    }

    if (state.childIndicesDirty !== false) rebuildArrayChildIndices(state);
    const indices = state.childIndices.get(child);
    if (!indices) return [];
    return [...indices];
  };

  /**
   * Emits latest scope snapshot to value listeners.
   */
  const emitScopeValue = (state: TScopeState): void => {
    if (state.valueListeners.size === 0) return;
    const value = deps.getScopeSnapshot(state);
    notifyValue(state.valueListeners, value);
  };

  /**
   * Emits a scope update event without modifying listeners.
   */
  const emitScopeUpdate = (state: TScopeState, update: IoUpdate): void => {
    notifyUpdate(state.updateListeners, update);
  };

  /**
   * Emits latest array snapshot to value listeners.
   */
  const emitArrayValue = (state: TArrayState): void => {
    if (state.valueListeners.size === 0) return;
    notifyValue(state.valueListeners, deps.getArraySnapshot(state));
  };

  /**
   * Emits an array update event without modifying listeners.
   */
  const emitArrayUpdate = (state: TArrayState, update: IoUpdate): void => {
    notifyUpdate(state.updateListeners, update);
  };

  /**
   * Marks a child segment as dirty on the parent container.
   *
   * Invariants:
   * - Scope parents track keys in `dirtyKeys`.
   * - Array parents track numeric indices in `dirtyIndices`.
   */
  const markDirty = (
    parentState: TScopeState | TArrayState,
    segment: PropertyKey,
  ): void => {
    if ('dirtyIndices' in parentState) {
      const index =
        typeof segment === 'number'
          ? segment
          : isIndexKey(segment)
            ? Number(segment)
            : -1;
      if (index >= 0)
        markDirtyIndex(
          parentState.dirtyIndices,
          index,
          parentState.children.length,
        );
    } else {
      parentState.dirtyKeys.add(segment);
    }
  };

  /**
   * Subscribes a scope child and bubbles child value/update events as parent
   * key-scoped notifications.
   */
  const attachChildToScope = (
    state: TScopeState,
    key: PropertyKey,
    child: TNode,
  ): void => {
    const { valueUnsub, updateUnsub } = subscribeKeyedChild(child, key, {
      onValue: () => {
        if (state.isCommitting) return;
        state.dirtyKeys.add(key);
        state.valueEpoch = nextEpoch(state.valueEpoch);
        emitScopeValue(state);
      },
      onUpdate: (u) => {
        state.dirtyKeys.add(key);
        const baseRevision = state.revision;
        state.revision = nextRevision(state.revision);
        state.valueEpoch = nextEpoch(state.valueEpoch);
        emitScopeUpdate(
          state,
          createUpdate(baseRevision, state.revision, u.patches),
        );
      },
    });

    state.childValueUnsubs.set(key, valueUnsub);
    state.childUpdateUnsubs.set(key, updateUnsub);
  };

  /**
   * Removes both value/update subscriptions for a scope child key.
   */
  const detachChildFromScope = (state: TScopeState, key: PropertyKey): void => {
    state.childValueUnsubs.get(key)?.();
    state.childUpdateUnsubs.get(key)?.();
    state.childValueUnsubs.delete(key);
    state.childUpdateUnsubs.delete(key);
  };

  /**
   * Subscribes an array child and bubbles events for every index where the same
   * child instance appears.
   *
   * Duplicate references are ref-counted so only one underlying child
   * subscription is active per child instance.
   */
  const attachChildToArray = (state: TArrayState, child: TNode): void => {
    if ('childIndicesDirty' in state) state.childIndicesDirty = true;
    const valueEntry = state.childValueUnsubs.get(child);
    const updateEntry = state.childUpdateUnsubs.get(child);
    if (valueEntry && updateEntry) {
      valueEntry.count += 1;
      updateEntry.count += 1;
      return;
    }

    const { valueUnsub, updateUnsub } = subscribeIndexedChild(
      child,
      (c) => resolveArrayChildIndices(state, c as TNode),
      {
        onValue: (indices) => {
          if (state.isCommitting) return;
          for (const index of indices)
            markDirtyIndex(state.dirtyIndices, index, state.children.length);
          state.valueEpoch = nextEpoch(state.valueEpoch);
          emitArrayValue(state);
        },
        onUpdate: (u, indices) => {
          for (const index of indices)
            markDirtyIndex(state.dirtyIndices, index, state.children.length);
          const baseRevision = state.revision;
          state.revision = nextRevision(state.revision);
          state.valueEpoch = nextEpoch(state.valueEpoch);
          const patches = indices.flatMap((index) =>
            u.patches.map((p) => prependPatchPath(index, p)),
          );
          emitArrayUpdate(
            state,
            createUpdate(baseRevision, state.revision, patches),
          );
        },
      },
    );

    state.childValueUnsubs.set(child, { unsub: valueUnsub, count: 1 });
    state.childUpdateUnsubs.set(child, { unsub: updateUnsub, count: 1 });
  };

  /**
   * Decrements array child subscription refs and unsubscribes when count hits 0.
   */
  const detachChildFromArray = (state: TArrayState, child: TNode): void => {
    if ('childIndicesDirty' in state) state.childIndicesDirty = true;
    const valueEntry = state.childValueUnsubs.get(child);
    if (valueEntry) {
      valueEntry.count -= 1;
      if (valueEntry.count <= 0) {
        valueEntry.unsub();
        state.childValueUnsubs.delete(child);
      }
    }

    const updateEntry = state.childUpdateUnsubs.get(child);
    if (updateEntry) {
      updateEntry.count -= 1;
      if (updateEntry.count <= 0) {
        updateEntry.unsub();
        state.childUpdateUnsubs.delete(child);
      }
    }
  };

  return {
    emitScopeValue,
    emitScopeUpdate,
    emitArrayValue,
    emitArrayUpdate,
    markDirty,
    attachChildToScope,
    detachChildFromScope,
    attachChildToArray,
    detachChildFromArray,
  };
}
