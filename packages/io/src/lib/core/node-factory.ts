import type {
  IoMutationOp,
  IoPatch,
  IoPath,
  IoUpdate,
  IoUnsubscribe,
} from '../utils/types.js';
import type { NodePath } from './path-trie.js';
import type {
  TreeArrayState,
  TreeContext,
  TreeInternal,
  TreeNode,
  TreeScopeState,
  UnitInternal,
} from './io-tree-types.js';

export type NodeFactoryDeps = {
  isPlainObject: (value: unknown) => boolean;
  isUnit: (value: unknown) => boolean;
  createUnit: (value: unknown) => unknown;
  cloneValue: (value: unknown) => unknown;
  emitError: (
    target: unknown,
    error: unknown,
    path: IoPath,
    operation: IoMutationOp,
  ) => void;
  createDraft: <T>(value: T) => T;
  finishDraft: <T>(draft: T) => T;
  createUpdate: (base: number, next: number, patches: IoPatch[]) => IoUpdate;
  applyScopeCommitDiff: typeof import('./commit.js').applyScopeCommitDiff;
  applyArrayCommitDiff: typeof import('./commit.js').applyArrayCommitDiff;
  getInternal: (value: unknown) => TreeInternal | undefined;
  requireInternalOfKind: (
    value: unknown,
    kind: TreeInternal['kind'],
    message: string,
  ) => unknown;
  registerInternal: (obj: object, internal: TreeInternal) => void;
  INTERNAL: symbol;
  registerSubtree: (ctx: TreeContext, path: NodePath, node: TreeNode) => void;
  unregisterSubtree: (ctx: TreeContext, path: NodePath, node: TreeNode) => void;
  rebuildSubtreeMapping: (
    state: { ctx: TreeContext; path: NodePath },
    node: TreeNode,
  ) => void;
  setPathNode: (ctx: TreeContext, path: NodePath, node: TreeNode) => void;
  getPathNode: (ctx: TreeContext, path: NodePath) => TreeNode | undefined;
  getScopeSnapshot: (state: TreeScopeState) => Record<string, unknown>;
  getArraySnapshot: (state: TreeArrayState) => unknown[];
  getNodeValue: (node: TreeNode, cache: WeakMap<object, unknown>) => unknown;
  emitScopeValue: (state: TreeScopeState) => void;
  emitScopeUpdate: (state: TreeScopeState, update: IoUpdate) => void;
  emitArrayValue: (state: TreeArrayState) => void;
  emitArrayUpdate: (state: TreeArrayState, update: IoUpdate) => void;
  markDirty: (
    parentState: TreeScopeState | TreeArrayState,
    segment: PropertyKey,
  ) => void;
  attachChildToScope: (
    state: TreeScopeState,
    key: PropertyKey,
    child: TreeNode,
  ) => void;
  detachChildFromScope: (state: TreeScopeState, key: PropertyKey) => void;
  attachChildToArray: (state: TreeArrayState, child: TreeNode) => void;
  detachChildFromArray: (state: TreeArrayState, child: TreeNode) => void;
};

export function createNodeFactory(deps: NodeFactoryDeps) {
  const createUnitNode = (
    ctx: TreeContext,
    path: NodePath,
    initial: unknown,
  ): TreeNode => {
    const unit = deps.createUnit(deps.cloneValue(initial)) as TreeNode;
    deps.registerSubtree(ctx, path, unit);
    return unit;
  };

  const createScopeNode = (
    ctx: TreeContext,
    path: NodePath,
    initial: Record<string, unknown>,
  ): TreeNode => {
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
    for (const key of Reflect.ownKeys(initialAny)) {
      const child = createTreeNode(ctx, [...path, key], initialAny[key]);
      state.children.set(key, child);
    }

    for (const [key, child] of state.children.entries())
      deps.attachChildToScope(state, key, child);

    const snapshot = (): Record<string, unknown> =>
      deps.getScopeSnapshot(state);

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

    const applySet = (
      key: PropertyKey,
      next: unknown,
      options?: { emitUpdate?: boolean; emitValue?: boolean },
    ): void => {
      try {
        const existing = state.children.get(key);
        if (!existing)
          throw new Error(`ioTree scope: missing key ${String(key)}`);

        if (deps.isUnit(existing)) {
          const internal = deps.requireInternalOfKind(
            existing,
            'unit',
            'ioTree scope: invalid unit internal',
          ) as UnitInternal;
          const before = internal.getValue();
          const emitValue = options?.emitValue !== false;
          internal.setValue(next, {
            emitUpdate: false,
            emitValue,
          });
          const after = internal.getValue();
          if (!Object.is(before, after)) {
            state.revision += 1;
            if (!emitValue) {
              state.valueEpoch += 1;
              deps.markDirty(state, key);
            }
          }
          return;
        }

        deps.detachChildFromScope(state, key);
        deps.unregisterSubtree(ctx, [...path, key], existing);
        const replaced = createTreeNode(ctx, [...path, key], next);
        state.children.set(key, replaced);
        deps.attachChildToScope(state, key, replaced);
        state.revision += 1;
        state.dirtyKeys.add(key);
        state.valueEpoch += 1;
        if (options?.emitValue !== false) deps.emitScopeValue(state);
      } catch (error) {
        deps.emitError(scope, error, [...path, key], 'set');
        throw error;
      }
    };

    const commit = (fn: (draft: Record<string, unknown>) => void): void => {
      try {
        const before = snapshot();
        const draft = deps.createDraft(before);
        fn(draft);
        const next = deps.finishDraft(draft);

        const nextAny = next as unknown as Record<PropertyKey, unknown>;
        for (const key of Reflect.ownKeys(nextAny)) {
          if (!Reflect.has(before as object, key))
            throw new Error(`ioTree scope: unknown key ${String(key)}`);
        }

        const baseRevision = state.revision;
        const { changed, patches } = deps.applyScopeCommitDiff(
          state,
          before,
          nextAny,
          {
            isPlainObject: deps.isPlainObject,
            isUnit: deps.isUnit,
            getInternalKind: (node: TreeNode) => deps.getInternal(node)?.kind,
            getScopeState: (node: TreeNode) =>
              deps.requireInternalOfKind(
                node,
                'scope',
                'ioTree commit: invalid scope internal',
              ) as TreeScopeState,
            getArrayState: (node: TreeNode) =>
              deps.requireInternalOfKind(
                node,
                'array',
                'ioTree commit: invalid array internal',
              ) as TreeArrayState,
            setUnitValue: (node: TreeNode, value: unknown) => {
              const internal = deps.requireInternalOfKind(
                node,
                'unit',
                'ioTree commit: invalid unit internal',
              ) as UnitInternal;
              internal.setValue(value, { emitUpdate: false, emitValue: true });
            },
            createTreeNode: (absPath: NodePath, value: unknown) =>
              createTreeNode(ctx, absPath, value),
            detachChildFromScope: deps.detachChildFromScope,
            attachChildToScope: deps.attachChildToScope,
            detachChildFromArray: deps.detachChildFromArray,
            attachChildToArray: deps.attachChildToArray,
            unregisterSubtree: (absPath: NodePath, node: TreeNode) =>
              deps.unregisterSubtree(ctx, absPath, node),
            registerSubtree: (absPath: NodePath, node: TreeNode) =>
              deps.registerSubtree(ctx, absPath, node),
            getPathNode: (absPath: NodePath) => deps.getPathNode(ctx, absPath),
            emitScopeValue: deps.emitScopeValue,
            emitArrayValue: deps.emitArrayValue,
            markDirty: deps.markDirty,
            cloneValue: deps.cloneValue,
          },
        );

        if (!changed) return;
        state.revision += 1;
        state.valueEpoch += 1;
        deps.emitScopeUpdate(
          state,
          deps.createUpdate(baseRevision, state.revision, patches),
        );
        deps.emitScopeValue(state);
      } catch (error) {
        state.isCommitting = false;
        deps.emitError(scope, error, path, 'commit');
        throw error;
      }
    };

    for (const [key, child] of state.children.entries()) scope[key] = child;

    const internal: TreeInternal = {
      kind: 'scope',
      getChild: (key: PropertyKey) => state.children.get(key),
      applySet,
      getState: () => state,
    };

    Object.defineProperties(scope, {
      commit: { value: commit },
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
  };

  const createArrayNode = (
    ctx: TreeContext,
    path: NodePath,
    initial: unknown[],
  ): TreeNode => {
    const state: TreeArrayState = {
      children: new Array(initial.length),
      node: undefined as unknown as TreeNode,
      revision: 0,
      isCommitting: false,
      valueEpoch: 0,
      snapshotCache: { value: undefined, version: -1, hasValue: false },
      dirtyIndices: new Set(),
      dirtyStructure: false,
      valueListeners: new Set(),
      updateListeners: new Set(),
      childValueUnsubs: new Map(),
      childUpdateUnsubs: new Map(),
      ctx,
      path,
    };

    const snapshot = (): unknown[] => deps.getArraySnapshot(state);

    const array = function (): unknown[] {
      return snapshot();
    } as unknown as TreeNode & object;
    const proxy = new Proxy(array as TreeNode & object, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && /^[0-9]+$/.test(prop)) {
          return state.children[Number(prop)];
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as TreeNode;

    state.node = proxy as unknown as TreeNode;
    ctx.seen.set(initial as unknown as object, proxy as unknown as TreeNode);
    deps.setPathNode(ctx, path, proxy as unknown as TreeNode);

    const rebuildMapping = (): void => {
      deps.rebuildSubtreeMapping(state, proxy as unknown as TreeNode);
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

    const performSplice = (
      start: number,
      deleteCount: number,
      items: unknown[],
    ) => {
      const normalizedStart =
        start < 0 ? Math.max(0, state.children.length + start) : start;
      const dc = Math.max(
        0,
        Math.min(deleteCount, state.children.length - normalizedStart),
      );

      const removed = state.children.splice(normalizedStart, dc);
      const removedValues = removed.map((c) =>
        deps.getNodeValue(c, new WeakMap()),
      );
      for (let i = 0; i < removed.length; i += 1) {
        const child = removed[i];
        deps.detachChildFromArray(state, child);
        deps.unregisterSubtree(ctx, [...path, normalizedStart + i], child);
      }

      const created = items.map((v, i) =>
        createTreeNode(ctx, [...path, normalizedStart + i], v),
      );
      for (const child of created) deps.attachChildToArray(state, child);
      state.children.splice(normalizedStart, 0, ...created);
      rebuildMapping();

      return { normalizedStart, dc, removedValues };
    };

    const applySplice = (
      start: number,
      deleteCount: number,
      items: unknown[],
      options?: { emitValue?: boolean },
    ) => {
      try {
        state.revision += 1;
        performSplice(start, deleteCount, items);
        state.dirtyStructure = true;
        state.valueEpoch += 1;
        if (options?.emitValue !== false) deps.emitArrayValue(state);
      } catch (error) {
        deps.emitError(array, error, path, 'splice');
        throw error;
      }
    };

    const applySortOrder = (
      order: number[],
      options?: { emitValue?: boolean },
    ) => {
      try {
        if (order.length !== state.children.length)
          throw new Error('ioTree array: invalid sort order length');
        const old = state.children.slice();
        state.children = order.map((oldIndex) => old[oldIndex]);
        rebuildMapping();
        state.revision += 1;
        state.dirtyStructure = true;
        state.valueEpoch += 1;
        if (options?.emitValue !== false) deps.emitArrayValue(state);
      } catch (error) {
        deps.emitError(array, error, path, 'sort');
        throw error;
      }
    };

    const setIndex = (
      index: number,
      next: unknown,
      options?: { emitUpdate?: boolean; emitValue?: boolean },
    ) => {
      try {
        const existing = state.children[index];
        if (!existing)
          throw new Error(`ioTree array: index out of range ${index}`);

        if (deps.isUnit(existing)) {
          const internal = deps.getInternal(existing);
          if (!internal || internal.kind !== 'unit')
            throw new Error('ioTree array: invalid unit internal');
          const before = internal.getValue();
          const emitValue = options?.emitValue !== false;
          internal.setValue(next, {
            emitUpdate: false,
            emitValue,
          });
          const after = internal.getValue();
          if (!Object.is(before, after)) {
            state.revision += 1;
            if (!emitValue) {
              state.valueEpoch += 1;
              state.dirtyIndices.add(index);
            }
          }
          return;
        }

        deps.detachChildFromArray(state, existing);
        deps.unregisterSubtree(ctx, [...path, index], existing);
        const replaced = createTreeNode(ctx, [...path, index], next);
        state.children[index] = replaced;
        deps.attachChildToArray(state, replaced);
        state.revision += 1;
        state.dirtyIndices.add(index);
        state.valueEpoch += 1;
        if (options?.emitValue !== false) deps.emitArrayValue(state);
      } catch (error) {
        deps.emitError(array, error, [...path, index], 'set');
        throw error;
      }
    };

    const push = (...items: unknown[]): void => {
      try {
        if (items.length === 0) return;
        const baseRevision = state.revision;
        state.revision += 1;
        state.dirtyStructure = true;

        const start = state.children.length;
        const created = items.map((v, i) =>
          createTreeNode(ctx, [...path, start + i], v),
        );
        for (const child of created) deps.attachChildToArray(state, child);
        state.children.push(...created);
        rebuildMapping();

        const patch: IoPatch = {
          op: 'splice',
          path: [],
          start,
          deleteCount: 0,
          deleted: [],
          items: items.map((v) => deps.cloneValue(v)),
        };
        deps.emitArrayUpdate(
          state,
          deps.createUpdate(baseRevision, state.revision, [patch]),
        );
        state.valueEpoch += 1;
        deps.emitArrayValue(state);
      } catch (error) {
        deps.emitError(array, error, path, 'push');
        throw error;
      }
    };

    const pop = (): unknown => {
      try {
        if (state.children.length === 0) return undefined;
        const baseRevision = state.revision;
        state.revision += 1;
        state.dirtyStructure = true;

        const start = state.children.length - 1;
        const removed = state.children.pop();
        if (!removed) return undefined;
        const removedValue = deps.getNodeValue(removed, new WeakMap());
        deps.detachChildFromArray(state, removed);
        deps.unregisterSubtree(ctx, [...path, start], removed);
        rebuildMapping();

        const patch: IoPatch = {
          op: 'splice',
          path: [],
          start,
          deleteCount: 1,
          deleted: [deps.cloneValue(removedValue)],
          items: [],
        };
        deps.emitArrayUpdate(
          state,
          deps.createUpdate(baseRevision, state.revision, [patch]),
        );
        state.valueEpoch += 1;
        deps.emitArrayValue(state);
        return removedValue;
      } catch (error) {
        deps.emitError(array, error, path, 'pop');
        throw error;
      }
    };

    const splice = (
      start: number,
      deleteCount: number,
      ...items: unknown[]
    ): void => {
      try {
        const baseRevision = state.revision;
        state.revision += 1;
        state.dirtyStructure = true;

        const { normalizedStart, dc, removedValues } = performSplice(
          start,
          deleteCount,
          items,
        );
        const patch: IoPatch = {
          op: 'splice',
          path: [],
          start: normalizedStart,
          deleteCount: dc,
          deleted: removedValues.map((v) => deps.cloneValue(v)),
          items: items.map((v) => deps.cloneValue(v)),
        };
        deps.emitArrayUpdate(
          state,
          deps.createUpdate(baseRevision, state.revision, [patch]),
        );
        state.valueEpoch += 1;
        deps.emitArrayValue(state);
        rebuildMapping();
      } catch (error) {
        deps.emitError(array, error, path, 'splice');
        throw error;
      }
    };

    const sort = (compareFn?: (a: unknown, b: unknown) => number): void => {
      try {
        if (state.children.length <= 1) return;
        const baseRevision = state.revision;
        state.revision += 1;
        state.dirtyStructure = true;

        const decorated = state.children.map((child, index) => ({
          child,
          index,
          value: deps.getNodeValue(child, new WeakMap()),
        }));
        decorated.sort((a, b) => {
          const av = a.value;
          const bv = b.value;
          if (compareFn) return compareFn(av, bv);
          if (typeof av === 'number' && typeof bv === 'number') return av - bv;
          const as = String(av);
          const bs = String(bv);
          if (as === bs) return 0;
          return as > bs ? 1 : -1;
        });
        const order = decorated.map((d) => d.index);
        state.children = decorated.map((d) => d.child);
        rebuildMapping();

        deps.emitArrayUpdate(
          state,
          deps.createUpdate(baseRevision, state.revision, [
            { op: 'sort', path: [], order },
          ]),
        );
        state.valueEpoch += 1;
        deps.emitArrayValue(state);
      } catch (error) {
        deps.emitError(array, error, path, 'sort');
        throw error;
      }
    };

    const commit = (fn: (draft: unknown[]) => void): void => {
      try {
        const before = snapshot();
        const draft = deps.createDraft(before);
        fn(draft);
        const next = deps.finishDraft(draft);

        const baseRevision = state.revision;
        const { changed, patches } = deps.applyArrayCommitDiff(
          state,
          before,
          next as unknown[],
          {
            isPlainObject: deps.isPlainObject,
            isUnit: deps.isUnit,
            getInternalKind: (node: TreeNode) => deps.getInternal(node)?.kind,
            getScopeState: (node: TreeNode) =>
              deps.requireInternalOfKind(
                node,
                'scope',
                'ioTree commit: invalid scope internal',
              ) as TreeScopeState,
            getArrayState: (node: TreeNode) =>
              deps.requireInternalOfKind(
                node,
                'array',
                'ioTree commit: invalid array internal',
              ) as TreeArrayState,
            setUnitValue: (node: TreeNode, value: unknown) => {
              const internal = deps.requireInternalOfKind(
                node,
                'unit',
                'ioTree commit: invalid unit internal',
              ) as UnitInternal;
              internal.setValue(value, { emitUpdate: false, emitValue: true });
            },
            createTreeNode: (absPath: NodePath, value: unknown) =>
              createTreeNode(ctx, absPath, value),
            detachChildFromScope: deps.detachChildFromScope,
            attachChildToScope: deps.attachChildToScope,
            detachChildFromArray: deps.detachChildFromArray,
            attachChildToArray: deps.attachChildToArray,
            unregisterSubtree: (absPath: NodePath, node: TreeNode) =>
              deps.unregisterSubtree(ctx, absPath, node),
            registerSubtree: (absPath: NodePath, node: TreeNode) =>
              deps.registerSubtree(ctx, absPath, node),
            getPathNode: (absPath: NodePath) => deps.getPathNode(ctx, absPath),
            emitScopeValue: deps.emitScopeValue,
            emitArrayValue: deps.emitArrayValue,
            markDirty: deps.markDirty,
            cloneValue: deps.cloneValue,
          },
        );

        if (!changed) return;
        state.revision += 1;
        deps.emitArrayUpdate(
          state,
          deps.createUpdate(baseRevision, state.revision, patches),
        );
        state.valueEpoch += 1;
        deps.emitArrayValue(state);
      } catch (error) {
        state.isCommitting = false;
        deps.emitError(array, error, path, 'commit');
        throw error;
      }
    };

    const reduce = <R>(
      reducer: (acc: R, item: TreeNode, index: number) => R,
      initialValue: R,
    ): R => {
      let acc = initialValue;
      for (let i = 0; i < state.children.length; i += 1)
        acc = reducer(acc, state.children[i], i);
      return acc;
    };

    const iterator = function* (): Generator<TreeNode> {
      for (const child of state.children) yield child;
    };

    const internal: TreeInternal = {
      kind: 'array',
      getChild: (index: number) => state.children[index],
      setIndex,
      applySplice,
      applySortOrder,
      getState: () => state,
    };

    Object.defineProperties(array, {
      snapshot: { value: snapshot },
      subscribe: { value: subscribe },
      subscribeUpdate: { value: subscribeUpdate },
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

    deps.registerInternal(array as unknown as object, internal);
    deps.registerInternal(proxy as unknown as object, internal);

    return proxy as unknown as TreeNode;
  };

  const createTreeNode = (
    ctx: TreeContext,
    path: NodePath,
    initial: unknown,
  ): TreeNode => {
    if (typeof ctx.maxDepth === 'number' && path.length >= ctx.maxDepth) {
      return createUnitNode(ctx, path, initial);
    }
    if (initial !== null && typeof initial === 'object') {
      const existing = ctx.seen.get(initial as object);
      if (existing) {
        deps.setPathNode(ctx, path, existing);
        return existing;
      }
    }
    if (Array.isArray(initial)) return createArrayNode(ctx, path, initial);
    if (deps.isPlainObject(initial))
      return createScopeNode(ctx, path, initial as Record<string, unknown>);
    if (initial !== null && typeof initial === 'object') {
      if (ctx.silent) return createUnitNode(ctx, path, initial);
      throw new TypeError(
        'ioTree: deep mode only supports plain objects and arrays',
      );
    }
    return createUnitNode(ctx, path, initial);
  };

  return { createTreeNode };
}
