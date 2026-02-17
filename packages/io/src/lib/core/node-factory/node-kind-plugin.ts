import type { TreeDeps } from '../types.js';
import type { NodePath } from '../tree/path-trie.js';
import type { TreeContext, TreeInternal, TreeNode } from '../tree/io-tree-types.js';
import { createNodeBase } from './create-node-base.js';

type NodeKindPluginBaseDeps = Pick<TreeDeps, 'trackRead' | 'internals'>;

export type NodeKindPluginOptions<
  TInitial extends object,
  TDeps extends NodeKindPluginBaseDeps,
> = {
  deps: TDeps;
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

type CreateStateArgs<
  TInitial extends object,
  TDeps extends NodeKindPluginBaseDeps,
> = NodeKindPluginOptions<TInitial, TDeps> & { initialNode: TreeNode };

type RuntimeArgs<
  TInitial extends object,
  TState,
  TValue,
  TDeps extends NodeKindPluginBaseDeps,
> = NodeKindPluginOptions<TInitial, TDeps> & {
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
  TDeps extends NodeKindPluginBaseDeps,
> {
  kind: string;
  createState: (args: CreateStateArgs<TInitial, TDeps>) => TState;
  createNode: (args: {
    state: TState;
  }) => {
    target: object;
    node: TreeNode;
    registerTargets?: object[];
  };
  initialize?: (args: RuntimeArgs<TInitial, TState, TValue, TDeps>) => void;
  createSnapshot: (
    args: RuntimeArgs<TInitial, TState, TValue, TDeps>,
  ) => () => TValue;
  createOperations: (
    args: RuntimeArgs<TInitial, TState, TValue, TDeps>,
  ) => TOperations;
  createCommit: (
    args: RuntimeArgs<TInitial, TState, TValue, TDeps> & {
      operations: TOperations;
    },
  ) => ((fn: (draft: TValue) => void) => void) | undefined;
  createInternal: (
    args: RuntimeArgs<TInitial, TState, TValue, TDeps> & {
      operations: TOperations;
    },
  ) => TreeInternal;
  defineProperties?: (
    args: RuntimeArgs<TInitial, TState, TValue, TDeps> & {
      operations: TOperations;
      commit: ((fn: (draft: TValue) => void) => void) | undefined;
    },
  ) => Record<PropertyKey, PropertyDescriptor>;
  finalize?: (args: RuntimeArgs<TInitial, TState, TValue, TDeps>) => void;
}

export function createNodeKindPlugin<
  TInitial extends object,
  TState,
  TValue,
  TOperations extends Record<string, unknown>,
  TDeps extends NodeKindPluginBaseDeps,
>(
  plugin: NodeKindPlugin<TInitial, TState, TValue, TOperations, TDeps>,
): NodeKindPlugin<TInitial, TState, TValue, TOperations, TDeps> {
  return plugin;
}

export function createNodeFromKindPlugin<
  TInitial extends object,
  TState,
  TValue,
  TOperations extends Record<string, unknown>,
  TDeps extends NodeKindPluginBaseDeps,
>(
  options: NodeKindPluginOptions<TInitial, TDeps>,
  plugin: NodeKindPlugin<TInitial, TState, TValue, TOperations, TDeps>,
): TreeNode {
  const { deps, ctx, initial } = options;
  const snapshotPlaceholder = () => undefined as TValue;

  return createNodeBase<TInitial, TState, TValue>({
    deps,
    ctx,
    initial,
    createState: (initialNode) => plugin.createState({ ...options, initialNode }),
    createNode: (state) => plugin.createNode({ state }),
    initialize: ({ state, node, target }) => {
      plugin.initialize?.({
        ...options,
        state,
        node,
        target,
        getNode: () => node,
        snapshot: snapshotPlaceholder,
      });
    },
    createSnapshot: (state) =>
      plugin.createSnapshot({
        ...options,
        state,
        node: (state as { node: TreeNode }).node,
        target: (state as { node: TreeNode }).node as object,
        getNode: () => (state as { node: TreeNode }).node,
        snapshot: snapshotPlaceholder,
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
      return { internal, properties };
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
