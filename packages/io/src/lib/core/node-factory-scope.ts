import type { IoUpdate, IoUnsubscribe } from '../utils/types.js';

import type { NodeFactoryDeps } from './node-factory-types.js';
import type { NodePath } from './path-trie.js';
import type {
  TreeContext,
  TreeInternal,
  TreeNode,
  TreeScopeState,
} from './io-tree-types.js';
import { createScopeCommit } from './node-factory-scope-commit.js';
import { createScopeMutations } from './node-factory-scope-mutate.js';

type CreateScopeNodeOptions = {
  deps: NodeFactoryDeps;
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

  const state: TreeScopeState = {
    children: new Map(),
    node: undefined as unknown as TreeNode,
    revision: 0,
    isCommitting: false,
    valueEpoch: 0,
    snapshotCache: { value: undefined, version: -1, hasValue: false },
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
  state.node = scope as unknown as TreeNode;
  ctx.seen.set(initial as unknown as object, scope as unknown as TreeNode);

  const initialAny = initial as unknown as Record<PropertyKey, unknown>;
  // Reflect.ownKeys keeps symbol/non-enumerable branches in the tree model.
  for (const key of Reflect.ownKeys(initialAny)) {
    const child = createTreeNode(ctx, [...path, key], initialAny[key]);
    state.children.set(key, child);
  }

  for (const [key, child] of state.children.entries())
    deps.attachChildToScope(state, key, child);

  const snapshot = (): Record<string, unknown> =>
    deps.getScopeSnapshot(state);
  const get = (): Record<string, unknown> => {
    deps.trackRead(
      scope as unknown as {
        subscribe: (fn: (value: unknown) => void) => IoUnsubscribe;
      },
    );
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
    getNode: () => scope as unknown as TreeNode,
  });

  const commit = createScopeCommit({
    deps,
    ctx,
    path,
    state,
    createTreeNode,
    resolvePatchValue,
    snapshot,
    getNode: () => scope as unknown as TreeNode,
  });

  for (const [key, child] of state.children.entries()) scope[key] = child;

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

  deps.registerInternal(scope as unknown as object, internal);

  deps.setPathNode(ctx, path, scope as unknown as TreeNode);
  return scope as unknown as TreeNode;
}
