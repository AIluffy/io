import type { IoMutationOp, IoPatch, IoPath, IoUnsubscribe, IoUpdate } from '../utils/types/types.js';
import type { SnapshotCache } from './snapshot/snapshot-cache.js';
import type {
  TreeArrayState,
  TreeInternal,
  TreeNode,
  TreeScopeState,
} from './tree/io-tree-types.js';
import type { NodePath } from './tree/path-trie.js';

export type CommitUtilDeps = {
  isPlainObject: (value: unknown) => boolean;
  cloneValue: (value: unknown) => unknown;
  createDraft: <T>(value: T) => T;
  finishDraft: <T>(draft: T) => T;
  createUpdate: (base: number, next: number, patches: IoPatch[]) => IoUpdate;
  applyScopeCommitDiff: typeof import('./mutation/commit.js').applyScopeCommitDiff;
  applyArrayCommitDiff: typeof import('./mutation/commit.js').applyArrayCommitDiff;
};

export type SnapshotDeps = {
  getScopeSnapshot: (state: TreeScopeState) => Record<string, unknown>;
  getArraySnapshot: (state: TreeArrayState) => unknown[];
  getNodeValue: (node: TreeNode, cache: SnapshotCache) => unknown;
};

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

export type RegistryDeps = {
  registerSubtree: (path: NodePath, node: TreeNode) => void;
  unregisterSubtree: (path: NodePath, node: TreeNode) => void;
  rebuildSubtreeMapping: (path: NodePath, node: TreeNode) => void;
  setPathNode: (path: NodePath, node: TreeNode) => void;
  getPathNode: (path: NodePath) => TreeNode | undefined;
};

export type InternalDeps = {
  getInternal: (value: unknown) => TreeInternal | undefined;
  requireInternalOfKind: (
    value: unknown,
    kind: TreeInternal['kind'],
    message: string,
  ) => unknown;
  registerInternal: (obj: object, internal: TreeInternal) => void;
  INTERNAL: symbol;
};

export type LifecycleDeps = {
  attachChildToScope: (
    state: TreeScopeState,
    key: PropertyKey,
    child: TreeNode,
  ) => void;
  detachChildFromScope: (state: TreeScopeState, key: PropertyKey) => void;
  attachChildToArray: (state: TreeArrayState, child: TreeNode) => void;
  detachChildFromArray: (state: TreeArrayState, child: TreeNode) => void;
};

export type TreeDeps = {
  emitError: (
    target: unknown,
    error: unknown,
    path: IoPath,
    operation: IoMutationOp,
  ) => void;
  trackRead: SubscriptionDeps['trackRead'];
  snapshots: SnapshotDeps;
  subscriptions: Omit<SubscriptionDeps, keyof SnapshotDeps | 'trackRead'>;
  registry: RegistryDeps;
  internals: InternalDeps;
  lifecycle: LifecycleDeps;
};

export type TreeDepsSlice<TKey extends keyof TreeDeps> = Pick<TreeDeps, TKey>;

export type SharedCommitTreeDeps = TreeDepsSlice<
  'snapshots' | 'subscriptions' | 'registry' | 'internals' | 'lifecycle'
>;

export type CommitFactoryTreeDeps = TreeDepsSlice<
  | 'emitError'
  | 'snapshots'
  | 'subscriptions'
  | 'registry'
  | 'internals'
  | 'lifecycle'
>;
