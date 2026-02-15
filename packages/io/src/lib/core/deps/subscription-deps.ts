import type { IoUnsubscribe, IoUpdate } from '../../utils/types.js';
import type { TreeArrayState, TreeScopeState } from '../tree/io-tree-types.js';
import type { SnapshotDeps } from './snapshot-deps.js';

export type SubscriptionDeps = SnapshotDeps & {
  emitScopeValue: (state: TreeScopeState) => void;
  emitScopeUpdate: (state: TreeScopeState, update: IoUpdate) => void;
  emitArrayValue: (state: TreeArrayState) => void;
  emitArrayUpdate: (state: TreeArrayState, update: IoUpdate) => void;
  markDirty: (
    parentState: TreeScopeState | TreeArrayState,
    segment: PropertyKey,
  ) => void;
  trackRead: (
    dep: { subscribe: (fn: (...args: unknown[]) => void) => IoUnsubscribe },
  ) => void;
};
