import type { IoUnsubscribe, IoUpdate } from '../utils/types.js';

import { notifyUpdate, notifyValue } from '../utils/batch.js';
import { createUpdate } from '../utils/updates.js';
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
  dirtyIndices: Set<number>;
  valueListeners: Set<(value: unknown[]) => void>;
  updateListeners: Set<(update: IoUpdate) => void>;
  childValueUnsubs: Map<TNode, IoUnsubscribe>;
  childUpdateUnsubs: Map<TNode, IoUnsubscribe>;
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
      if (index >= 0) parentState.dirtyIndices.add(index);
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
    const { valueUnsub, updateUnsub } = subscribeIndexedChild(
      child,
      (c) => state.children.indexOf(c as TNode),
      {
        onValue: () => {
          if (state.isCommitting) return;
          const index = state.children.indexOf(child);
          if (index >= 0) state.dirtyIndices.add(index);
          state.valueEpoch += 1;
          emitArrayValue(state);
        },
        onUpdate: (u, index) => {
          if (index >= 0) state.dirtyIndices.add(index);
          const baseRevision = state.revision;
          state.revision += 1;
          emitArrayUpdate(
            state,
            createUpdate(baseRevision, state.revision, u.patches),
          );
        },
      },
    );

    state.childValueUnsubs.set(child, valueUnsub);
    state.childUpdateUnsubs.set(child, updateUnsub);
  };

  const detachChildFromArray = (state: TArrayState, child: TNode): void => {
    state.childValueUnsubs.get(child)?.();
    state.childUpdateUnsubs.get(child)?.();
    state.childValueUnsubs.delete(child);
    state.childUpdateUnsubs.delete(child);
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
