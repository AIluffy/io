import type { TreeDeps } from '../../types.js';
import type { NodePath } from '../../tree/path-trie.js';
import type {
  TreeArrayState,
  TreeContext,
  TreeNode,
} from '../../tree/io-tree-types.js';
import { createDirtyIndexState } from '../../mutation/dirty-indices.js';
import { createArrayOps } from './array-ops.js';
import { isIndexKey } from '../../../utils/is-index-key.js';
import {
  createNodeBase,
  createNodeStateBase,
} from '../create-node-base.js';

type CreateArrayNodeOptions = {
  deps: TreeDeps;
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

export function createArrayNode(options: CreateArrayNodeOptions): TreeNode {
  const { deps, ctx, path, initial, createTreeNode, resolvePatchValue } =
    options;
  let bindSetIndex: ((
    fn: (
      index: number,
      next: unknown,
      options?: { emitUpdate?: boolean; emitValue?: boolean },
    ) => void,
  ) => void) | undefined;

  return createNodeBase({
    deps,
    ctx,
    initial,
    createState: (initialNode): TreeArrayState => ({
      children: new Array(initial.length),
      childIndices: new Map<TreeNode, Set<number>>(),
      childIndicesDirty: true,
      dirtyIndices: createDirtyIndexState(initial.length),
      childValueUnsubs: new Map(),
      childUpdateUnsubs: new Map(),
      ...createNodeStateBase<unknown[], unknown[]>(ctx, path, initialNode),
    }),
    createNode: (state) => {
      let setIndex: (
        index: number,
        next: unknown,
        options?: { emitUpdate?: boolean; emitValue?: boolean },
      ) => void = () => {
        throw new Error('ioTree array: setIndex not initialized');
      };
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

      const setSetIndex = (
        fn: (
          index: number,
          next: unknown,
          options?: { emitUpdate?: boolean; emitValue?: boolean },
        ) => void,
      ) => {
        setIndex = fn;
      };
      bindSetIndex = setSetIndex;

      return {
        target: array as object,
        node: proxy,
        registerTargets: [array as object, proxy as object],
      };
    },
    initialize: ({ state, node }) => {
      deps.registry.setPathNode(ctx, path, node);
      for (let i = 0; i < initial.length; i += 1) {
        const value = i in initial ? initial[i] : undefined;
        const child = createTreeNode(ctx, [...path, i], value);
        state.children[i] = child;
        deps.lifecycle.attachChildToArray(state, child);
      }
    },
    createSnapshot: (state) => (): unknown[] => deps.snapshots.getArraySnapshot(state),
    createInternalAndProperties: ({ state, node, snapshot, getNode }) => {
      const rebuildMapping = (): void => {
        deps.registry.rebuildSubtreeMapping(state, node);
      };

      const {
        internal,
        setIndex,
        set,
        push,
        pop,
        splice,
        sort,
        commit,
        reduce,
        iterator,
      } = createArrayOps({
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

      bindSetIndex?.(setIndex);
      return {
        internal,
        properties: {
          set: { value: set },
          push: { value: push },
          pop: { value: pop },
          splice: { value: splice },
          sort: { value: sort },
          commit: { value: commit },
          reduce: { value: reduce },
          [Symbol.iterator]: { value: iterator },
        },
      };
    },
    finalize: () => {
      if (!bindSetIndex) {
        throw new Error('ioTree array: setIndex binder not initialized');
      }
    },
  });
}
