import type { IoMutationOp, IoPath } from '../../utils/types.js';
import type {
  TreeArrayState,
  TreeInternal,
  TreeNode,
  TreeScopeState,
} from '../tree/io-tree-types.js';
import type { CommitDeps } from './commit-deps.js';
import type { RegistryDeps } from './registry-deps.js';
import type { SubscriptionDeps } from './subscription-deps.js';

export type InternalDeps = {
  getInternal: (value: unknown) => TreeInternal | undefined;
  requireInternalOfKind: (
    value: unknown,
    kind: TreeInternal['kind'],
    message: string,
  ) => unknown;
  registerInternal: (obj: object, internal: TreeInternal) => void;
  INTERNAL: symbol;
  isUnit: (value: unknown) => boolean;
  createUnit: (value: unknown) => unknown;
  emitError: (
    target: unknown,
    error: unknown,
    path: IoPath,
    operation: IoMutationOp,
  ) => void;
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

export type NodeCreationDeps =
  & CommitDeps
  & InternalDeps
  & LifecycleDeps
  & SubscriptionDeps
  & RegistryDeps;
