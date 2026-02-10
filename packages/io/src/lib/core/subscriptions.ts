import type { IoUnsubscribe, IoUpdate } from '../utils/types.js';
import type { DirtyIndexState } from './dirty-indices.js';
import { markDirtyIndex } from './dirty-indices.js';

import { notifyUpdate, notifyValue } from '../utils/batch.js';
import { createUpdate } from '../utils/updates.js';
import { prependPatchPath } from '../utils/patch-path.js';
import {
  subscribeIndexedChild,
  subscribeKeyedChild,
} from '../container/bubbling.js';

type ScopeStateLike<TNode> = {
  children: Map<PropertyKey, TNode>;
  revision: number;
  isCommitting: boolean;
  valueEpoch: number;
  dirtyKeys: Set<PropertyKey>;
  valueListeners: Set<(value: Record<string, unknown>) => void>;
  updateListeners: Set<(update: IoUpdate) => void>;
  childValueUnsubs: Map<PropertyKey, IoUnsubscribe>;
  childUpdateUnsubs: Map<PropertyKey, IoUnsubscribe>;
};

type ArrayStateLike<TNode> = {
  children: TNode[];
  revision: number;
  isCommitting: boolean;
  valueEpoch: number;
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

export function createSubscriptions<
  TNode,
  TScopeState extends ScopeStateLike<TNode>,
  TArrayState extends ArrayStateLike<TNode>,
>(deps: SnapshotDeps<TScopeState, TArrayState>) {
  const emitScopeValue = (state: TScopeState): void => {
    const value = deps.getScopeSnapshot(state);
    notifyValue(state.valueListeners, value);
  };

  const emitScopeUpdate = (state: TScopeState, update: IoUpdate): void => {
    notifyUpdate(state.updateListeners, update);
  };

  const emitArrayValue = (state: TArrayState): void => {
    notifyValue(state.valueListeners, deps.getArraySnapshot(state));
  };

  const emitArrayUpdate = (state: TArrayState, update: IoUpdate): void => {
    notifyUpdate(state.updateListeners, update);
  };

  const markDirty = (
    parentState: TScopeState | TArrayState,
    segment: PropertyKey,
  ): void => {
    if ('dirtyIndices' in parentState) {
      const index =
        typeof segment === 'number'
          ? segment
          : typeof segment === 'string' && /^[0-9]+$/.test(segment)
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

  const attachChildToScope = (
    state: TScopeState,
    key: PropertyKey,
    child: TNode,
  ): void => {
    const { valueUnsub, updateUnsub } = subscribeKeyedChild(child, key, {
      onValue: () => {
        if (state.isCommitting) return;
        state.dirtyKeys.add(key);
        state.valueEpoch += 1;
        emitScopeValue(state);
      },
      onUpdate: (u) => {
        state.dirtyKeys.add(key);
        const baseRevision = state.revision;
        state.revision += 1;
        emitScopeUpdate(
          state,
          createUpdate(baseRevision, state.revision, u.patches),
        );
      },
    });

    state.childValueUnsubs.set(key, valueUnsub);
    state.childUpdateUnsubs.set(key, updateUnsub);
  };

  const detachChildFromScope = (state: TScopeState, key: PropertyKey): void => {
    state.childValueUnsubs.get(key)?.();
    state.childUpdateUnsubs.get(key)?.();
    state.childValueUnsubs.delete(key);
    state.childUpdateUnsubs.delete(key);
  };

  const attachChildToArray = (state: TArrayState, child: TNode): void => {
    const valueEntry = state.childValueUnsubs.get(child);
    const updateEntry = state.childUpdateUnsubs.get(child);
    if (valueEntry && updateEntry) {
      valueEntry.count += 1;
      updateEntry.count += 1;
      return;
    }

    const { valueUnsub, updateUnsub } = subscribeIndexedChild(
      child,
      (c) => {
        const indices: number[] = [];
        for (let i = 0; i < state.children.length; i += 1) {
          if (state.children[i] === c) indices.push(i);
        }
        return indices;
      },
      {
        onValue: (indices) => {
          if (state.isCommitting) return;
          for (const index of indices)
            markDirtyIndex(state.dirtyIndices, index, state.children.length);
          state.valueEpoch += 1;
          emitArrayValue(state);
        },
        onUpdate: (u, indices) => {
          for (const index of indices)
            markDirtyIndex(state.dirtyIndices, index, state.children.length);
          const baseRevision = state.revision;
          state.revision += 1;
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

  const detachChildFromArray = (state: TArrayState, child: TNode): void => {
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
