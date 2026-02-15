import type { IoUpdate, IoUnsubscribe } from '../../../utils/types.js';

import type { NodeFactoryDeps } from '../types.js';
import type { NodePath } from '../../path-trie.js';
import type {
  TreeArrayState,
  TreeContext,
  TreeNode,
} from '../../io-tree-types.js';
import { createDirtyIndexState } from '../../dirty-indices.js';
import { createArrayOps } from './ops.js';
import {
  initialEpoch,
  initialRevision,
  staleEpoch,
} from '../../../utils/branded.js';

type CreateArrayNodeOptions = {
  deps: NodeFactoryDeps;
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

  const initialNode = {} as TreeNode;

  const state: TreeArrayState = {
    children: new Array(initial.length),
    childIndices: new Map(),
    childIndicesDirty: true,
    node: initialNode,
    revision: initialRevision(),
    isCommitting: false,
    valueEpoch: initialEpoch(),
    snapshotCache: { value: undefined, version: staleEpoch(), hasValue: false },
    dirtyIndices: createDirtyIndexState(initial.length),
    dirtyStructure: false,
    valueListeners: new Set(),
    updateListeners: new Set(),
    childValueUnsubs: new Map(),
    childUpdateUnsubs: new Map(),
    ctx,
    path,
  };

  const snapshot = (): unknown[] => deps.getArraySnapshot(state);
  let node: TreeNode = initialNode;
  const array: Record<PropertyKey, unknown> = {};
  type SubscribableNode = {
    subscribe: (fn: (value: unknown) => void) => IoUnsubscribe;
  };
  const get = (): unknown[] => {
    deps.trackRead(node as SubscribableNode);
    return snapshot();
  };
  const proxy = new Proxy(array as TreeNode & object, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && /^[0-9]+$/.test(prop)) {
        return state.children[Number(prop)];
      }
      return Reflect.get(target, prop, receiver);
    },
    set(target, prop, value, receiver) {
      if (typeof prop === 'string' && /^[0-9]+$/.test(prop)) {
        setIndex(Number(prop), value, {
          emitUpdate: true,
          emitValue: true,
        });
        return true;
      }
      if (prop === 'length')
        throw new Error('ioTree array: length is read-only');
      return Reflect.set(target, prop, value, receiver);
    },
  }) as TreeNode;

  node = proxy;
  state.node = node;
  ctx.seen.set(initial as object, proxy);
  deps.setPathNode(ctx, path, proxy);

  const rebuildMapping = (): void => {
    deps.rebuildSubtreeMapping(state, proxy);
  };

  const subscribe = (fn: (v: unknown[]) => void): IoUnsubscribe => {
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
    getNode: () => node,
  });

  Object.defineProperties(array, {
    get: { value: get },
    snapshot: { value: snapshot },
    subscribe: { value: subscribe },
    subscribeUpdate: { value: subscribeUpdate },
    set: { value: set },
    push: { value: push },
    pop: { value: pop },
    splice: { value: splice },
    sort: { value: sort },
    commit: { value: commit },
    reduce: { value: reduce },
    [Symbol.iterator]: { value: iterator },
    [deps.INTERNAL]: {
      value: internal,
    },
  });

  for (let i = 0; i < initial.length; i += 1) {
    const value = i in initial ? initial[i] : undefined;
    const child = createTreeNode(ctx, [...path, i], value);
    state.children[i] = child;
    deps.attachChildToArray(state, child);
  }

  deps.registerInternal(array as object, internal);
  deps.registerInternal(proxy as object, internal);

  return proxy;
}
