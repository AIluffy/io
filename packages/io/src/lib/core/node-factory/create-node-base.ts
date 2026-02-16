import type { IoUpdate, IoUnsubscribe } from '../../utils/types/types.js';
import type { VersionedCache } from '../snapshot/versioned-cache.js';
import type { Revision, ValueEpoch } from '../../utils/types/branded.js';
import type { TreeDeps } from '../types.js';
import type { NodePath } from '../tree/path-trie.js';
import type { TreeContext, TreeInternal, TreeNode } from '../tree/io-tree-types.js';

import {
  initialEpoch,
  initialRevision,
  staleEpoch,
} from '../../utils/types/branded.js';

type BaseState<TSnapshot, TValue> = {
  node: TreeNode;
  revision: Revision;
  isCommitting: boolean;
  valueEpoch: ValueEpoch;
  snapshotCache: VersionedCache<TSnapshot>;
  dirtyStructure: boolean;
  valueListeners: Set<(value: TValue) => void>;
  updateListeners: Set<(update: IoUpdate) => void>;
  ctx: TreeContext;
  path: NodePath;
};

type SubscribableNode = {
  subscribe: (fn: (value: unknown) => void) => IoUnsubscribe;
};

export function createNodeStateBase<TSnapshot, TValue>(
  ctx: TreeContext,
  path: NodePath,
  node: TreeNode,
): BaseState<TSnapshot, TValue> {
  return {
    node,
    revision: initialRevision(),
    isCommitting: false,
    valueEpoch: initialEpoch(),
    snapshotCache: {
      value: undefined,
      version: staleEpoch(),
      hasValue: false,
    },
    dirtyStructure: false,
    valueListeners: new Set(),
    updateListeners: new Set(),
    ctx,
    path,
  };
}

export function createNodeApiMethods<TValue>(config: {
  deps: Pick<TreeDeps, 'trackRead'>;
  state: {
    valueListeners: Set<(value: TValue) => void>;
    updateListeners: Set<(update: IoUpdate) => void>;
  };
  getNode: () => TreeNode;
  snapshot: () => TValue;
}): {
  get: () => TValue;
  subscribe: (fn: (value: TValue) => void) => IoUnsubscribe;
  subscribeUpdate: (fn: (update: IoUpdate) => void) => IoUnsubscribe;
} {
  const {
    deps,
    state,
    getNode,
    snapshot,
  } = config;

  const get = (): TValue => {
    deps.trackRead(getNode() as SubscribableNode);
    return snapshot();
  };

  const subscribe = (fn: (value: TValue) => void): IoUnsubscribe => {
    state.valueListeners.add(fn);
    return () => {
      state.valueListeners.delete(fn);
    };
  };

  const subscribeUpdate = (fn: (update: IoUpdate) => void): IoUnsubscribe => {
    state.updateListeners.add(fn);
    return () => {
      state.updateListeners.delete(fn);
    };
  };

  return {
    get,
    subscribe,
    subscribeUpdate,
  };
}

export function attachNodeBase(config: {
  deps: Pick<TreeDeps, 'internals'>;
  target: object;
  internal: TreeInternal;
  snapshot: () => unknown;
  get: () => unknown;
  subscribe: (fn: (value: unknown) => void) => IoUnsubscribe;
  subscribeUpdate: (fn: (update: IoUpdate) => void) => IoUnsubscribe;
  properties?: Record<PropertyKey, PropertyDescriptor>;
  registerTargets?: object[];
}): void {
  const {
    deps,
    target,
    internal,
    snapshot,
    get,
    subscribe,
    subscribeUpdate,
    properties,
    registerTargets,
  } = config;

  Object.defineProperties(target, {
    get: { value: get },
    snapshot: { value: snapshot },
    subscribe: { value: subscribe },
    subscribeUpdate: { value: subscribeUpdate },
    ...(properties ?? {}),
    [deps.internals.INTERNAL]: {
      value: internal,
    },
  });

  for (const registerTarget of registerTargets ?? [target]) {
    deps.internals.registerInternal(registerTarget, internal);
  }
}

export type CreateNodeBaseConfig<TInitial extends object, TState, TValue> = {
  deps: Pick<TreeDeps, 'trackRead' | 'internals'>;
  ctx: TreeContext;
  initial: TInitial;
  createState: (initialNode: TreeNode) => TState;
  createNode: (state: TState) => {
    target: object;
    node: TreeNode;
    registerTargets?: object[];
  };
  initialize?: (args: {
    state: TState;
    node: TreeNode;
    target: object;
  }) => void;
  createSnapshot: (state: TState) => () => TValue;
  createInternalAndProperties: (args: {
    state: TState;
    node: TreeNode;
    target: object;
    snapshot: () => TValue;
    getNode: () => TreeNode;
  }) => {
    internal: TreeInternal;
    properties?: Record<PropertyKey, PropertyDescriptor>;
  };
  finalize?: (args: {
    state: TState;
    node: TreeNode;
    target: object;
  }) => void;
};

export function createNodeBase<TInitial extends object, TState, TValue>(
  config: CreateNodeBaseConfig<TInitial, TState, TValue>,
): TreeNode {
  const {
    deps,
    ctx,
    initial,
    createState,
    createNode,
    initialize,
    createSnapshot,
    createInternalAndProperties,
    finalize,
  } = config;

  const initialNode = {} as TreeNode;
  const state = createState(initialNode);
  const { target, node, registerTargets } = createNode(state);

  (state as { node: TreeNode }).node = node;
  ctx.seen.set(initial, node);

  initialize?.({ state, node, target });

  const snapshot = createSnapshot(state);
  const { get, subscribe, subscribeUpdate } = createNodeApiMethods({
    deps,
    state: state as {
      valueListeners: Set<(value: TValue) => void>;
      updateListeners: Set<(update: IoUpdate) => void>;
    },
    getNode: () => node,
    snapshot,
  });

  const { internal, properties } = createInternalAndProperties({
    state,
    node,
    target,
    snapshot,
    getNode: () => node,
  });

  attachNodeBase({
    deps,
    target,
    internal,
    snapshot: snapshot as () => unknown,
    get: get as () => unknown,
    subscribe: subscribe as (fn: (value: unknown) => void) => IoUnsubscribe,
    subscribeUpdate,
    properties,
    registerTargets,
  });

  finalize?.({ state, node, target });
  return node;
}

export function nodeBuilder<TInitial extends object, TState, TValue>(base: {
  deps: Pick<TreeDeps, 'trackRead' | 'internals'>;
  ctx: TreeContext;
  initial: TInitial;
}) {
  let createState: CreateNodeBaseConfig<TInitial, TState, TValue>['createState'] | undefined;
  let createNode: CreateNodeBaseConfig<TInitial, TState, TValue>['createNode'] | undefined;
  let initialize: CreateNodeBaseConfig<TInitial, TState, TValue>['initialize'] | undefined;
  let createSnapshot: CreateNodeBaseConfig<TInitial, TState, TValue>['createSnapshot'] | undefined;
  let createInternalAndProperties:
    | CreateNodeBaseConfig<TInitial, TState, TValue>['createInternalAndProperties']
    | undefined;
  let finalize: CreateNodeBaseConfig<TInitial, TState, TValue>['finalize'] | undefined;

  const requireDefined = <T>(
    value: T | undefined,
    name: string,
  ): T => {
    if (value === undefined)
      throw new Error(`nodeBuilder: ${name} is not configured`);
    return value;
  };

  const builder = {
    withState(
      value: CreateNodeBaseConfig<TInitial, TState, TValue>['createState'],
    ) {
      createState = value;
      return builder;
    },
    withNode(
      value: CreateNodeBaseConfig<TInitial, TState, TValue>['createNode'],
    ) {
      createNode = value;
      return builder;
    },
    withInitialize(
      value: CreateNodeBaseConfig<TInitial, TState, TValue>['initialize'],
    ) {
      initialize = value;
      return builder;
    },
    withSnapshot(
      value: CreateNodeBaseConfig<TInitial, TState, TValue>['createSnapshot'],
    ) {
      createSnapshot = value;
      return builder;
    },
    withInternalAndProperties(
      value: CreateNodeBaseConfig<TInitial, TState, TValue>['createInternalAndProperties'],
    ) {
      createInternalAndProperties = value;
      return builder;
    },
    withFinalize(
      value: CreateNodeBaseConfig<TInitial, TState, TValue>['finalize'],
    ) {
      finalize = value;
      return builder;
    },
    build(): TreeNode {
      return createNodeBase({
        ...base,
        createState: requireDefined(createState, 'createState'),
        createNode: requireDefined(createNode, 'createNode'),
        initialize,
        createSnapshot: requireDefined(createSnapshot, 'createSnapshot'),
        createInternalAndProperties: requireDefined(
          createInternalAndProperties,
          'createInternalAndProperties',
        ),
        finalize,
      });
    },
  };

  return builder;
}
