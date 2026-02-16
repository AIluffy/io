import type { TreeDepsSlice } from '../../types.js';
import type { NodePath } from '../../tree/path-trie.js';
import type {
  TreeContext,
  TreeInternal,
  TreeNode,
  TreeScopeState,
} from '../../tree/io-tree-types.js';
import { createScopeCommit } from './commit.js';
import { createScopeMutations } from './mutate.js';
import { createNodeStateBase } from '../create-node-base.js';
import {
  createNodeKindPlugin,
  createNodeFromKindPlugin,
} from '../node-kind-plugin.js';

type ScopeNodeDeps = TreeDepsSlice<
  | 'emitError'
  | 'trackRead'
  | 'snapshots'
  | 'subscriptions'
  | 'registry'
  | 'internals'
  | 'lifecycle'
>;

type CreateScopeNodeOptions = {
  deps: ScopeNodeDeps;
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

type ScopeOperations = {
  applySet: (
    key: PropertyKey,
    next: unknown,
    options?: { emitUpdate?: boolean; emitValue?: boolean },
  ) => void;
};

const scopePlugin = createNodeKindPlugin<
  Record<string, unknown>,
  TreeScopeState,
  Record<string, unknown>,
  ScopeOperations,
  ScopeNodeDeps
>({
  kind: 'scope',
  createState: ({ ctx, path, initialNode }) => ({
    children: new Map<PropertyKey, TreeNode>(),
    dirtyKeys: new Set<PropertyKey>(),
    childValueUnsubs: new Map(),
    childUpdateUnsubs: new Map(),
    ...createNodeStateBase<Record<string, unknown>, Record<string, unknown>>(
      ctx,
      path,
      initialNode,
    ),
  }),
  createNode: () => {
    const scope: Record<PropertyKey, unknown> = {};
    return {
      target: scope as object,
      node: scope as TreeNode,
    };
  },
  initialize: ({ deps, ctx, path, initial, state, createTreeNode }) => {
    const initialAny = initial as Record<PropertyKey, unknown>;
    for (const key of Reflect.ownKeys(initialAny)) {
      const child = createTreeNode(ctx, [...path, key], initialAny[key]);
      state.children.set(key, child);
    }

    state.children.forEach((child, key) => {
      deps.lifecycle.attachChildToScope(state, key, child);
    });
  },
  createSnapshot: ({ deps, state }) => (): Record<string, unknown> =>
    deps.snapshots.getScopeSnapshot(state),
  createOperations: ({ deps, ctx, path, state, getNode, createTreeNode }) =>
    createScopeMutations({
      deps,
      ctx,
      path,
      state,
      createTreeNode,
      getNode,
    }),
  createCommit: ({ deps, ctx, path, state, createTreeNode, resolvePatchValue, snapshot, getNode }) =>
    createScopeCommit({
      deps,
      ctx,
      path,
      state,
      createTreeNode,
      resolvePatchValue,
      snapshot,
      getNode,
    }),
  createInternal: ({ state, target, operations }) => {
    const scope = target as Record<PropertyKey, unknown>;
    state.children.forEach((child, key) => {
      scope[key] = child;
    });

    const internal: TreeInternal = {
      kind: 'scope',
      getChild: (key: PropertyKey) => state.children.get(key),
      applySet: operations.applySet,
      getState: () => state,
    };

    return internal;
  },
  defineProperties: ({ commit }) => ({
    commit: { value: commit },
  }),
  finalize: ({ deps, path, node }) => {
    deps.registry.setPathNode(path, node);
  },
});

export function createScopeNode(options: CreateScopeNodeOptions): TreeNode {
  return createNodeFromKindPlugin(options, scopePlugin);
}
