import type { TreeDeps } from '../types.js';
import type { NodePath } from '../tree/path-trie.js';
import type { TreeContext, TreeInternal, TreeNode } from '../tree/io-tree-types.js';
import { createNodeBase } from './create-node-base.js';

export type NodeKindPluginOptions<TInitial extends object> = {
  deps: TreeDeps;
  ctx: TreeContext;
  path: NodePath;
  initial: TInitial;
  createTreeNode: (
    ctx: TreeContext,
    path: NodePath,
    initial: unknown,
  ) => TreeNode;
  resolvePatchValue: (value: unknown) => unknown;
};

type CreateStateArgs<TInitial extends object> = NodeKindPluginOptions<TInitial> & {
  initialNode: TreeNode;
};

type RuntimeArgs<TInitial extends object, TState, TValue> =
  NodeKindPluginOptions<TInitial> & {
    state: TState;
    node: TreeNode;
    target: object;
    getNode: () => TreeNode;
    snapshot: () => TValue;
  };

export interface NodeKindPlugin<
  TInitial extends object,
  TState,
  TValue,
  TOperations extends Record<string, unknown>,
> {
  kind: string;
  createState: (args: CreateStateArgs<TInitial>) => TState;
  createNode: (args: {
    state: TState;
  }) => {
    target: object;
    node: TreeNode;
    registerTargets?: object[];
  };
  initialize?: (args: RuntimeArgs<TInitial, TState, TValue>) => void;
  createSnapshot: (args: RuntimeArgs<TInitial, TState, TValue>) => () => TValue;
  createOperations: (
    args: RuntimeArgs<TInitial, TState, TValue>,
  ) => TOperations;
  createCommit: (
    args: RuntimeArgs<TInitial, TState, TValue> & {
      operations: TOperations;
    },
  ) => ((fn: (draft: TValue) => void) => void) | undefined;
  createInternal: (
    args: RuntimeArgs<TInitial, TState, TValue> & {
      operations: TOperations;
    },
  ) => TreeInternal;
  defineProperties?: (
    args: RuntimeArgs<TInitial, TState, TValue> & {
      operations: TOperations;
      commit: ((fn: (draft: TValue) => void) => void) | undefined;
    },
  ) => Record<PropertyKey, PropertyDescriptor>;
  finalize?: (args: RuntimeArgs<TInitial, TState, TValue>) => void;
}

export function createNodeFromKindPlugin<
  TInitial extends object,
  TState,
  TValue,
  TOperations extends Record<string, unknown>,
>(
  options: NodeKindPluginOptions<TInitial>,
  plugin: NodeKindPlugin<TInitial, TState, TValue, TOperations>,
): TreeNode {
  const { deps, ctx, initial } = options;

  return createNodeBase({
    deps,
    ctx,
    initial,
    createState: (initialNode) => plugin.createState({ ...options, initialNode }),
    createNode: (state) => plugin.createNode({ state }),
    initialize: ({ state, node, target }) => {
      const snapshot = () => undefined as TValue;
      plugin.initialize?.({
        ...options,
        state,
        node,
        target,
        getNode: () => node,
        snapshot,
      });
    },
    createSnapshot: (state) =>
      plugin.createSnapshot({
        ...options,
        state,
        node: (state as { node: TreeNode }).node,
        target: (state as { node: TreeNode }).node as object,
        getNode: () => (state as { node: TreeNode }).node,
        snapshot: () => undefined as TValue,
      }),
    createInternalAndProperties: ({ state, node, target, snapshot, getNode }) => {
      const runtimeArgs = {
        ...options,
        state,
        node,
        target,
        getNode,
        snapshot,
      };

      const operations = plugin.createOperations(runtimeArgs);
      const commit = plugin.createCommit({ ...runtimeArgs, operations });
      const internal = plugin.createInternal({ ...runtimeArgs, operations });
      const properties = plugin.defineProperties?.({
        ...runtimeArgs,
        operations,
        commit,
      });

      return {
        internal,
        properties,
      };
    },
    finalize: ({ state, node, target }) => {
      const snapshot = () => undefined as TValue;
      plugin.finalize?.({
        ...options,
        state,
        node,
        target,
        getNode: () => node,
        snapshot,
      });
    },
  });
}
