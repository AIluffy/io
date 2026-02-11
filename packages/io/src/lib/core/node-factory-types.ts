import type {
  IoMutationOp,
  IoPatch,
  IoPath,
  IoUpdate,
  IoUnsubscribe,
} from '../utils/types.js';
import type { NodePath } from './path-trie.js';
import type {
  TreeArrayState,
  TreeContext,
  TreeInternal,
  TreeNode,
  TreeScopeState,
} from './io-tree-types.js';

export type NodeFactoryDeps = {
  isPlainObject: (value: unknown) => boolean;
  isUnit: (value: unknown) => boolean;
  createUnit: (value: unknown) => unknown;
  cloneValue: (value: unknown) => unknown;
  emitError: (
    target: unknown,
    error: unknown,
    path: IoPath,
    operation: IoMutationOp,
  ) => void;
  createDraft: <T>(value: T) => T;
  finishDraft: <T>(draft: T) => T;
  createUpdate: (base: number, next: number, patches: IoPatch[]) => IoUpdate;
  applyScopeCommitDiff: typeof import('./commit.js').applyScopeCommitDiff;
  applyArrayCommitDiff: typeof import('./commit.js').applyArrayCommitDiff;
  getInternal: (value: unknown) => TreeInternal | undefined;
  requireInternalOfKind: (
    value: unknown,
    kind: TreeInternal['kind'],
    message: string,
  ) => unknown;
  registerInternal: (obj: object, internal: TreeInternal) => void;
  INTERNAL: symbol;
  registerSubtree: (ctx: TreeContext, path: NodePath, node: TreeNode) => void;
  unregisterSubtree: (ctx: TreeContext, path: NodePath, node: TreeNode) => void;
  rebuildSubtreeMapping: (
    state: { ctx: TreeContext; path: NodePath },
    node: TreeNode,
  ) => void;
  setPathNode: (ctx: TreeContext, path: NodePath, node: TreeNode) => void;
  getPathNode: (ctx: TreeContext, path: NodePath) => TreeNode | undefined;
  getScopeSnapshot: (state: TreeScopeState) => Record<string, unknown>;
  getArraySnapshot: (state: TreeArrayState) => unknown[];
  getNodeValue: (node: TreeNode, cache: WeakMap<object, unknown>) => unknown;
  emitScopeValue: (state: TreeScopeState) => void;
  emitScopeUpdate: (state: TreeScopeState, update: IoUpdate) => void;
  emitArrayValue: (state: TreeArrayState) => void;
  emitArrayUpdate: (state: TreeArrayState, update: IoUpdate) => void;
  trackRead: (
    dep: { subscribe: (fn: (...args: unknown[]) => void) => IoUnsubscribe },
  ) => void;
  markDirty: (
    parentState: TreeScopeState | TreeArrayState,
    segment: PropertyKey,
  ) => void;
  attachChildToScope: (
    state: TreeScopeState,
    key: PropertyKey,
    child: TreeNode,
  ) => void;
  detachChildFromScope: (state: TreeScopeState, key: PropertyKey) => void;
  attachChildToArray: (state: TreeArrayState, child: TreeNode) => void;
  detachChildFromArray: (state: TreeArrayState, child: TreeNode) => void;
};
