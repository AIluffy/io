import type { IoUpdate, IoUnsubscribe } from '../../../utils/types.js';

import type { NodeCreationDeps } from '../../deps/node-creation-deps.js';
import type { NodePath } from '../../tree/path-trie.js';
import type {
  TreeContext,
  TreeInternal,
  TreeNode,
  TreeScopeState,
} from '../../tree/io-tree-types.js';
import { createScopeCommit } from './commit.js';
import { createScopeMutations } from './mutate.js';
import {
  initialEpoch,
  initialRevision,
  staleEpoch,
} from '../../../utils/branded.js';

type CreateScopeNodeOptions = {
  deps: NodeCreationDeps;
  ctx: TreeContext;
  path: NodePath;
  initial: Record<string, unknown>;
  createTreeNode: (
    ctx: TreeContext,
    path: NodePath,
    initial: unknown,
  ) => TreeNode;
  resolvePatchValue: (value: unknown) => unknown;
};

export function createScopeNode(options: CreateScopeNodeOptions): TreeNode {
  const {
    deps,
    ctx,
    path,
    initial,
    createTreeNode,
    resolvePatchValue,
  } = options;

  const initialNode = {} as TreeNode;

  const state: TreeScopeState = {
    children: new Map(),
    node: initialNode,
    revision: initialRevision(),
    isCommitting: false,
    valueEpoch: initialEpoch(),
    snapshotCache: { value: undefined, version: staleEpoch(), hasValue: false },
    dirtyKeys: new Set(),
    dirtyStructure: false,
    valueListeners: new Set(),
    updateListeners: new Set(),
    childValueUnsubs: new Map(),
    childUpdateUnsubs: new Map(),
    ctx,
    path,
  };

  const scope: Record<PropertyKey, unknown> = {};
  const scopeNode = scope as TreeNode;
  state.node = scopeNode;
  ctx.seen.set(initial as object, scopeNode);

  const initialAny = initial as Record<PropertyKey, unknown>;
  // Reflect.ownKeys keeps symbol/non-enumerable branches in the tree model.
  for (const key of Reflect.ownKeys(initialAny)) {
    const child = createTreeNode(ctx, [...path, key], initialAny[key]);
    state.children.set(key, child);
  }

  state.children.forEach((child, key) => {
    deps.attachChildToScope(state, key, child);
  });

  const snapshot = (): Record<string, unknown> =>
    deps.getScopeSnapshot(state);
  type SubscribableNode = {
    subscribe: (fn: (value: unknown) => void) => IoUnsubscribe;
  };
  const get = (): Record<string, unknown> => {
    deps.trackRead(scopeNode as SubscribableNode);
    return snapshot();
  };

  const subscribe = (
    fn: (v: Record<string, unknown>) => void,
  ): IoUnsubscribe => {
    state.valueListeners.add(fn);
    return () => {
      state.valueListeners.delete(fn);
    };
  };

  const subscribeUpdate = (fn: (u: IoUpdate) => void): IoUnsubscribe => {
    state.updateListeners.add(fn);
    return () => {
      state.updateListeners.delete(fn);
    };
  };

  const { applySet } = createScopeMutations({
    deps,
    ctx,
    path,
    state,
    createTreeNode,
    getNode: () => scopeNode,
  });

  const commit = createScopeCommit({
    deps,
    ctx,
    path,
    state,
    createTreeNode,
    resolvePatchValue,
    snapshot,
    getNode: () => scopeNode,
  });

  state.children.forEach((child, key) => {
    scope[key] = child;
  });

  const internal: TreeInternal = {
    kind: 'scope',
    getChild: (key: PropertyKey) => state.children.get(key),
    applySet,
    getState: () => state,
  };

  Object.defineProperties(scope, {
    commit: { value: commit },
    get: { value: get },
    snapshot: { value: snapshot },
    subscribe: { value: subscribe },
    subscribeUpdate: { value: subscribeUpdate },
    [deps.INTERNAL]: {
      value: internal,
    },
  });

  deps.registerInternal(scope as object, internal);

  deps.setPathNode(ctx, path, scopeNode);
  return scopeNode;
}
