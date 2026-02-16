import type { TreeDepsSlice } from '../../types.js';
import type { NodePath } from '../../tree/path-trie.js';
import type {
  TreeArrayState,
  TreeContext,
  TreeInternal,
  TreeNode,
} from '../../tree/io-tree-types.js';
import { createDirtyIndexState } from '../../mutation/dirty-indices.js';
import { createArrayOps } from './array-ops.js';
import { isIndexKey } from '../../../utils/internal/is-index-key.js';
import { createNodeStateBase } from '../create-node-base.js';
import {
  createNodeKindPlugin,
  createNodeFromKindPlugin,
} from '../node-kind-plugin.js';

type ArrayNodeDeps = TreeDepsSlice<
  | 'emitError'
  | 'trackRead'
  | 'snapshots'
  | 'subscriptions'
  | 'registry'
  | 'internals'
  | 'lifecycle'
>;

type CreateArrayNodeOptions = {
  deps: ArrayNodeDeps;
  ctx: TreeContext;
  path: NodePath;
  initial: unknown[];
  createTreeNode: (
    ctx: TreeContext,
    path: NodePath,
    initial: unknown,
  ) => TreeNode;
  resolvePatchValue: (value: unknown) => unknown;
};

type ArrayOperations = ReturnType<typeof createArrayOps>;

export function createArrayNode(options: CreateArrayNodeOptions): TreeNode {
  let bindSetIndex: ((
    fn: (
      index: number,
      next: unknown,
      options?: { emitUpdate?: boolean; emitValue?: boolean },
    ) => void,
  ) => void) | undefined;

  const arrayPlugin = createNodeKindPlugin<
    unknown[],
    TreeArrayState,
    unknown[],
    ArrayOperations,
    ArrayNodeDeps
  >({
    kind: 'array',
    createState: ({ ctx, path, initial, initialNode }) => ({
      children: new Array(initial.length),
      childIndices: new Map<TreeNode, Set<number>>(),
      childIndicesDirty: true,
      dirtyIndices: createDirtyIndexState(initial.length),
      childValueUnsubs: new Map(),
      childUpdateUnsubs: new Map(),
      ...createNodeStateBase<unknown[], unknown[]>(ctx, path, initialNode),
    }),
    createNode: ({ state }) => {
      let setIndex!: (
        index: number,
        next: unknown,
        options?: { emitUpdate?: boolean; emitValue?: boolean },
      ) => void;

      const array: Record<PropertyKey, unknown> = {};
      const proxy = new Proxy(array as TreeNode & object, {
        get(target, prop, receiver) {
          if (isIndexKey(prop)) {
            return state.children[Number(prop)];
          }
          return Reflect.get(target, prop, receiver);
        },
        set(target, prop, value, receiver) {
          if (isIndexKey(prop)) {
            setIndex(Number(prop), value, {
              emitUpdate: true,
              emitValue: true,
            });
            return true;
          }
          if (typeof prop === 'string' && prop === 'length')
            throw new Error('ioTree array: length is read-only');
          return Reflect.set(target, prop, value, receiver);
        },
      }) as TreeNode;

      bindSetIndex = (fn) => {
        setIndex = fn;
      };

      return {
        target: array as object,
        node: proxy,
        registerTargets: [array as object, proxy as object],
      };
    },
    initialize: ({ deps, ctx, path, initial, state, node, createTreeNode }) => {
      deps.registry.setPathNode(path, node);
      for (let i = 0; i < initial.length; i += 1) {
        const value = i in initial ? initial[i] : undefined;
        const child = createTreeNode(ctx, [...path, i], value);
        state.children[i] = child;
        deps.lifecycle.attachChildToArray(state, child);
      }
    },
    createSnapshot: ({ deps, state }) => (): unknown[] =>
      deps.snapshots.getArraySnapshot(state),
    createOperations: ({
      deps,
      ctx,
      path,
      state,
      createTreeNode,
      resolvePatchValue,
      snapshot,
      getNode,
      node,
    }) => {
      const rebuildMapping = (): void => {
        deps.registry.rebuildSubtreeMapping(state.path, node);
      };

      const operations = createArrayOps({
        deps,
        ctx,
        path,
        state,
        createTreeNode,
        resolvePatchValue,
        snapshot,
        rebuildMapping,
        getNode,
      });
      bindSetIndex?.(operations.setIndex);
      return operations;
    },
    createCommit: ({ operations }) => operations.commit,
    createInternal: ({ operations }) => operations.internal as TreeInternal,
    defineProperties: ({ operations }) => ({
      set: { value: operations.set },
      push: { value: operations.push },
      pop: { value: operations.pop },
      splice: { value: operations.splice },
      sort: { value: operations.sort },
      commit: { value: operations.commit },
      reduce: { value: operations.reduce },
      [Symbol.iterator]: { value: operations.iterator },
    }),
  });

  return createNodeFromKindPlugin(options, arrayPlugin);
}
