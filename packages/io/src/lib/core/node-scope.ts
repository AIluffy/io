import type { IoUnsubscribe, IoUpdate } from '../utils/types.js';
import type { NodePath } from './path-trie.js';
import type {
  TreeArrayState,
  TreeContext,
  TreeInternal,
  TreeNode,
  TreeScopeState,
  UnitInternal,
} from './io-tree-types.js';
import type { NodeFactoryDeps } from './node-factory.js';
import { getLinkTarget, isLink } from '../utils/link.js';

export function createScopeNode(
  ctx: TreeContext,
  path: NodePath,
  initial: Record<string, unknown>,
  deps: NodeFactoryDeps,
  createTreeNode: (
    ctx: TreeContext,
    path: NodePath,
    initial: unknown,
  ) => TreeNode,
): TreeNode {
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

  const snapshot = (): Record<string, unknown> => deps.getScopeSnapshot(state);

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
          isLink,
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
          getNodeValue: (node: TreeNode) => deps.getNodeValue(node, new WeakMap()),
          resolvePatchValue: (value: unknown) => {
            if (isLink(value)) {
              const target = getLinkTarget(value) as TreeNode;
              return deps.getNodeValue(target, new WeakMap());
            }
            return deps.cloneValue(value);
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
}
