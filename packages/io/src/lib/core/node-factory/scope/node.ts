import type { TreeDeps } from '../../types.js';
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
  createNodeBase,
  createNodeStateBase,
} from '../create-node-base.js';

type CreateScopeNodeOptions = {
  deps: TreeDeps;
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

  return createNodeBase({
    deps,
    ctx,
    initial: initial as object,
    createState: (initialNode): TreeScopeState => ({
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
    initialize: ({ state }) => {
      const initialAny = initial as Record<PropertyKey, unknown>;
      // Reflect.ownKeys keeps symbol/non-enumerable branches in the tree model.
      for (const key of Reflect.ownKeys(initialAny)) {
        const child = createTreeNode(ctx, [...path, key], initialAny[key]);
        state.children.set(key, child);
      }

      state.children.forEach((child, key) => {
        deps.lifecycle.attachChildToScope(state, key, child);
      });
    },
    createSnapshot: (state) => (): Record<string, unknown> =>
      deps.snapshots.getScopeSnapshot(state),
    createInternalAndProperties: ({ state, target, snapshot, getNode }) => {
      const scope = target as Record<PropertyKey, unknown>;
      const { applySet } = createScopeMutations({
        deps,
        ctx,
        path,
        state,
        createTreeNode,
        getNode,
      });

      const commit = createScopeCommit({
        deps,
        ctx,
        path,
        state,
        createTreeNode,
        resolvePatchValue,
        snapshot,
        getNode,
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

      return {
        internal,
        properties: {
          commit: { value: commit },
        },
      };
    },
    finalize: ({ node }) => {
      deps.registry.setPathNode(ctx, path, node);
    },
  });
}
