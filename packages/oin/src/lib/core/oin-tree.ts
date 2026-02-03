import type {
  OinErrorHandler,
  OinTreeArrayUnit,
  OinTreeNode,
  OinPatch,
  OinTreeScope,
  OinUnit,
  OinUnsubscribe,
  OinUpdate,
} from '../utils/types.js';
import type { VersionedCache } from '../container/cache.js';

import { cloneValue, freezeRootShallow, snapshotValue } from '../utils/snapshot.js';
import { createDraft, finishDraft } from '../utils/cow.js';
import { notifyUpdate, notifyValue } from '../utils/batch.js';
import { createUpdate } from '../utils/updates.js';
import { createUnit, isUnit } from '../units/unit.js';
import { emitError } from '../utils/debug.js';
import { getInternal as getAnyInternal, requireInternalOfKind } from '../utils/internal-access.js';
import { INTERNAL } from '../utils/internal-symbol.js';
import { isPlainObject } from '../utils/plain-object.js';
import { subscribeIndexedChild, subscribeKeyedChild } from '../container/bubbling.js';
import { readCachedByVersion } from '../container/cache.js';

type PathSegment = PropertyKey;
type NodePath = readonly PathSegment[];

type TreeScopeNode = OinTreeScope<Record<string, unknown>>;
type TreeArrayNode = OinTreeArrayUnit<unknown>;
type TreeNode = OinUnit<unknown> | TreeScopeNode | TreeArrayNode;

type PathTrieNode = {
  node: TreeNode | undefined;
  children: Map<PathSegment, PathTrieNode>;
};

type TreeContext = {
  root: PathTrieNode;
  errorListeners: Set<OinErrorHandler>;
  devtools: boolean;
  silent: boolean;
  seen: WeakMap<object, TreeNode>;
};

function createTrieNode(): PathTrieNode {
  return { node: undefined, children: new Map() };
}

function setPathNode(ctx: TreeContext, path: NodePath, node: TreeNode): void {
  if (!ctx.devtools) return;
  let current = ctx.root;
  for (const seg of path) {
    const next = current.children.get(seg);
    if (next) {
      current = next;
      continue;
    }
    const created = createTrieNode();
    current.children.set(seg, created);
    current = created;
  }
  current.node = node;
}

function getPathNode(ctx: TreeContext, path: NodePath): TreeNode | undefined {
  if (!ctx.devtools) return undefined;
  let current = ctx.root;
  for (const seg of path) {
    const next = current.children.get(seg);
    if (!next) return undefined;
    current = next;
  }
  return current.node;
}

function deletePathNode(ctx: TreeContext, path: NodePath): void {
  if (!ctx.devtools) return;
  if (path.length === 0) {
    ctx.root.node = undefined;
    return;
  }
  const stack: PathTrieNode[] = [ctx.root];
  let current = ctx.root;
  for (const seg of path) {
    const next = current.children.get(seg);
    if (!next) return;
    current = next;
    stack.push(current);
  }
  current.node = undefined;

  for (let i = path.length - 1; i >= 0; i -= 1) {
    const parent = stack[i];
    const seg = path[i];
    const child = parent.children.get(seg);
    if (!child) continue;
    if (child.node !== undefined) break;
    if (child.children.size > 0) break;
    parent.children.delete(seg);
  }
}

type UnitInternal = {
  kind: 'unit';
  getValue: () => unknown;
  setValue: (
    next: unknown,
    options?: { emitUpdate?: boolean; emitValue?: boolean },
  ) => void;
  getState: () => unknown;
};

type TreeScopeInternal = {
  kind: 'scope';
  getChild: (key: PropertyKey) => TreeNode | undefined;
  applySet: (
    key: PropertyKey,
    next: unknown,
    options?: { emitUpdate?: boolean; emitValue?: boolean },
  ) => void;
  getState: () => TreeScopeState;
};

type TreeArrayInternal = {
  kind: 'array';
  getChild: (index: number) => TreeNode | undefined;
  setIndex: (
    index: number,
    next: unknown,
    options?: { emitUpdate?: boolean; emitValue?: boolean },
  ) => void;
  applySplice: (
    start: number,
    deleteCount: number,
    items: unknown[],
    options?: { emitValue?: boolean },
  ) => void;
  applySortOrder: (order: number[], options?: { emitValue?: boolean }) => void;
  getState: () => TreeArrayState;
};

type TreeInternal =
  | UnitInternal
  | TreeScopeInternal
  | TreeArrayInternal
  | { kind: 'derived' };

type TreeScopeState = {
  children: Map<PropertyKey, TreeNode>;
  node: TreeNode;
  revision: number;
  isCommitting: boolean;
  valueEpoch: number;
  snapshotCache: VersionedCache<Record<string, unknown>>;
  dirtyKeys: Set<PropertyKey>;
  dirtyStructure: boolean;
  valueListeners: Set<(value: Record<string, unknown>) => void>;
  updateListeners: Set<(update: OinUpdate) => void>;
  childValueUnsubs: Map<PropertyKey, OinUnsubscribe>;
  childUpdateUnsubs: Map<PropertyKey, OinUnsubscribe>;
  ctx: TreeContext;
  path: NodePath;
};

type TreeArrayState = {
  children: TreeNode[];
  node: TreeNode;
  revision: number;
  isCommitting: boolean;
  valueEpoch: number;
  snapshotCache: VersionedCache<unknown[]>;
  dirtyIndices: Set<number>;
  dirtyStructure: boolean;
  valueListeners: Set<(value: unknown[]) => void>;
  updateListeners: Set<(update: OinUpdate) => void>;
  childValueUnsubs: Map<TreeNode, OinUnsubscribe>;
  childUpdateUnsubs: Map<TreeNode, OinUnsubscribe>;
  ctx: TreeContext;
  path: NodePath;
};

function getInternal(value: unknown): TreeInternal | undefined {
  return getAnyInternal(value) as unknown as TreeInternal | undefined;
}

function registerSubtree(
  ctx: TreeContext,
  path: NodePath,
  node: TreeNode,
  visited?: WeakSet<object>,
): void {
  const seen = visited ?? new WeakSet<object>();
  if (seen.has(node as unknown as object)) return;
  seen.add(node as unknown as object);
  setPathNode(ctx, path, node);

  const internal = getInternal(node);
  if (!internal) return;

  if (internal.kind === 'scope') {
    const state = internal.getState();
    for (const [key, child] of state.children.entries()) {
      registerSubtree(ctx, [...path, key], child, seen);
    }
    return;
  }

  if (internal.kind === 'array') {
    const state = internal.getState();
    for (let i = 0; i < state.children.length; i += 1) {
      registerSubtree(ctx, [...path, i], state.children[i], seen);
    }
  }
}

function unregisterSubtree(
  ctx: TreeContext,
  path: NodePath,
  node: TreeNode,
  visited?: WeakSet<object>,
): void {
  const seen = visited ?? new WeakSet<object>();
  if (seen.has(node as unknown as object)) return;
  seen.add(node as unknown as object);
  deletePathNode(ctx, path);

  const internal = getInternal(node);
  if (!internal) return;

  if (internal.kind === 'scope') {
    const state = internal.getState();
    for (const [key, child] of state.children.entries()) {
      unregisterSubtree(ctx, [...path, key], child, seen);
    }
    return;
  }

  if (internal.kind === 'array') {
    const state = internal.getState();
    for (let i = 0; i < state.children.length; i += 1) {
      unregisterSubtree(ctx, [...path, i], state.children[i], seen);
    }
  }
}

function rebuildSubtreeMapping(
  state: { ctx: TreeContext; path: NodePath },
  node: TreeNode,
): void {
  unregisterSubtree(state.ctx, state.path, node);
  registerSubtree(state.ctx, state.path, node);
}

function hasSnapshot(value: unknown): value is { snapshot(): unknown } {
  if (typeof value !== 'object' || value === null) return false;
  return typeof (value as { snapshot?: unknown }).snapshot === 'function';
}

function getNodeValue(
  node: TreeNode,
  cache: WeakMap<object, unknown>,
): unknown {
  const internal = getInternal(node);
  if (internal?.kind === 'unit') return (node as OinUnit<unknown>).snapshot();
  if (internal?.kind === 'scope')
    return getScopeSnapshot(internal.getState(), cache);
  if (internal?.kind === 'array')
    return getArraySnapshot(internal.getState(), cache);
  if (hasSnapshot(node)) return node.snapshot();
  return snapshotValue(node, { owned: false });
}

function getScopeSnapshot(
  state: TreeScopeState,
  cache?: WeakMap<object, unknown>,
): Record<string, unknown> {
  return readCachedByVersion(state.snapshotCache, state.valueEpoch, () => {
    const local = cache ?? new WeakMap<object, unknown>();
    const cached = local.get(state.node as unknown as object);
    if (cached) return cached as Record<string, unknown>;

    const prev = state.snapshotCache.hasValue
      ? (state.snapshotCache.value as Record<string, unknown>)
      : undefined;

    if (prev && !state.dirtyStructure && state.dirtyKeys.size === 0) {
      local.set(state.node as unknown as object, prev);
      return prev;
    }

    const base =
      prev && !state.dirtyStructure ? { ...prev } : ({} as Record<string, unknown>);
    local.set(state.node as unknown as object, base);

    if (!prev || state.dirtyStructure) {
      for (const [key, node] of state.children.entries()) {
        base[key] = getNodeValue(node, local);
      }
    } else {
      for (const key of state.dirtyKeys) {
        const node = state.children.get(key);
        if (node) base[key] = getNodeValue(node, local);
      }
    }

    state.dirtyKeys.clear();
    state.dirtyStructure = false;
    const value = freezeRootShallow(base) as Record<string, unknown>;
    local.set(state.node as unknown as object, value);
    return value;
  });
}

function getArraySnapshot(
  state: TreeArrayState,
  cache?: WeakMap<object, unknown>,
): unknown[] {
  return readCachedByVersion(state.snapshotCache, state.valueEpoch, () => {
    const local = cache ?? new WeakMap<object, unknown>();
    const cached = local.get(state.node as unknown as object);
    if (cached) return cached as unknown[];

    const prev = state.snapshotCache.hasValue
      ? (state.snapshotCache.value as unknown[])
      : undefined;

    if (
      prev &&
      !state.dirtyStructure &&
      state.dirtyIndices.size === 0 &&
      prev.length === state.children.length
    ) {
      local.set(state.node as unknown as object, prev);
      return prev;
    }

    const values =
      prev && !state.dirtyStructure && prev.length === state.children.length
        ? prev.slice()
        : new Array(state.children.length);
    local.set(state.node as unknown as object, values);

    if (!prev || state.dirtyStructure || prev.length !== state.children.length) {
      for (let i = 0; i < state.children.length; i += 1) {
        values[i] = getNodeValue(state.children[i], local);
      }
    } else {
      for (const index of state.dirtyIndices) {
        if (index < 0 || index >= state.children.length) continue;
        values[index] = getNodeValue(state.children[index], local);
      }
    }

    state.dirtyIndices.clear();
    state.dirtyStructure = false;
    const frozen = freezeRootShallow(values) as unknown[];
    local.set(state.node as unknown as object, frozen);
    return frozen;
  });
}

function emitScopeValue(state: TreeScopeState): void {
  const value = getScopeSnapshot(state);
  notifyValue(state.valueListeners, value);
}

function emitScopeUpdate(state: TreeScopeState, update: OinUpdate): void {
  notifyUpdate(state.updateListeners, update);
}

function emitArrayValue(state: TreeArrayState): void {
  notifyValue(state.valueListeners, getArraySnapshot(state));
}

function emitArrayUpdate(state: TreeArrayState, update: OinUpdate): void {
  notifyUpdate(state.updateListeners, update);
}

function markDirty(
  parentState: TreeScopeState | TreeArrayState,
  segment: PropertyKey,
): void {
  if (Array.isArray(parentState.children)) {
    const index =
      typeof segment === 'number'
        ? segment
        : typeof segment === 'string' && /^[0-9]+$/.test(segment)
          ? Number(segment)
          : -1;
    if (index >= 0) parentState.dirtyIndices.add(index);
  } else {
    parentState.dirtyKeys.add(segment);
  }
}

function attachChildToScope(
  state: TreeScopeState,
  key: PropertyKey,
  child: TreeNode,
): void {
  const { valueUnsub, updateUnsub } = subscribeKeyedChild(child, key, {
    onValue: () => {
      if (state.isCommitting) return;
      state.dirtyKeys.add(key);
      state.valueEpoch += 1;
      emitScopeValue(state);
    },
    onUpdate: (u) => {
      state.dirtyKeys.add(key);
      const baseRevision = state.revision;
      state.revision += 1;
      emitScopeUpdate(state, createUpdate(baseRevision, state.revision, u.patches));
    },
  });

  state.childValueUnsubs.set(key, valueUnsub);
  state.childUpdateUnsubs.set(key, updateUnsub);
}

function detachChildFromScope(state: TreeScopeState, key: PropertyKey): void {
  state.childValueUnsubs.get(key)?.();
  state.childUpdateUnsubs.get(key)?.();
  state.childValueUnsubs.delete(key);
  state.childUpdateUnsubs.delete(key);
}

function attachChildToArray(state: TreeArrayState, child: TreeNode): void {
  const { valueUnsub, updateUnsub } = subscribeIndexedChild(
    child,
    (c) => state.children.indexOf(c as TreeNode),
    {
      onValue: () => {
        if (state.isCommitting) return;
        const index = state.children.indexOf(child);
        if (index >= 0) state.dirtyIndices.add(index);
        state.valueEpoch += 1;
        emitArrayValue(state);
      },
      onUpdate: (u, index) => {
        if (index >= 0) state.dirtyIndices.add(index);
        const baseRevision = state.revision;
        state.revision += 1;
        emitArrayUpdate(state, createUpdate(baseRevision, state.revision, u.patches));
      },
    },
  );

  state.childValueUnsubs.set(child, valueUnsub);
  state.childUpdateUnsubs.set(child, updateUnsub);
}

function detachChildFromArray(state: TreeArrayState, child: TreeNode): void {
  state.childValueUnsubs.get(child)?.();
  state.childUpdateUnsubs.get(child)?.();
  state.childValueUnsubs.delete(child);
  state.childUpdateUnsubs.delete(child);
}

function createTreeNode(
  ctx: TreeContext,
  path: NodePath,
  initial: unknown,
): TreeNode {
  if (initial !== null && typeof initial === 'object') {
    const existing = ctx.seen.get(initial as object);
    if (existing) {
      setPathNode(ctx, path, existing);
      return existing;
    }
  }
  if (Array.isArray(initial)) return createTreeArray(ctx, path, initial);
  if (isPlainObject(initial)) return createTreeScope(ctx, path, initial);
  if (initial !== null && typeof initial === 'object') {
    if (ctx.silent) {
      const unit = createUnit(cloneValue(initial)) as unknown as TreeNode;
      registerSubtree(ctx, path, unit);
      return unit;
    }
    throw new TypeError(
      'oinTree: deep mode only supports plain objects and arrays',
    );
  }
  const unit = createUnit(cloneValue(initial)) as unknown as TreeNode;
  registerSubtree(ctx, path, unit);
  return unit;
}

function createTreeScope(
  ctx: TreeContext,
  path: NodePath,
  initial: Record<string, unknown>,
): OinTreeScope<Record<string, unknown>> {
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
    attachChildToScope(state, key, child);

  const snapshot = (): Record<string, unknown> => getScopeSnapshot(state);

  const subscribe = (
    fn: (v: Record<string, unknown>) => void,
  ): OinUnsubscribe => {
    state.valueListeners.add(fn);
    return () => {
      state.valueListeners.delete(fn);
    };
  };

  const subscribeUpdate = (fn: (u: OinUpdate) => void): OinUnsubscribe => {
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
        throw new Error(`oinTree scope: missing key ${String(key)}`);

      if (isUnit(existing)) {
        const internal = requireInternalOfKind(
          existing,
          'unit',
          'oinTree scope: invalid unit internal',
        ) as unknown as UnitInternal;
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
            markDirty(state, key);
          }
        }
        return;
      }

      detachChildFromScope(state, key);
      unregisterSubtree(ctx, [...path, key], existing);
      const replaced = createTreeNode(ctx, [...path, key], next);
      state.children.set(key, replaced);
      attachChildToScope(state, key, replaced);
      state.revision += 1;
      state.dirtyKeys.add(key);
      state.valueEpoch += 1;
      if (options?.emitValue !== false) emitScopeValue(state);
    } catch (error) {
      emitError(scope, error, [...path, key], 'set');
      throw error;
    }
  };

  const commit = (fn: (draft: Record<string, unknown>) => void): void => {
    try {
      const before = snapshot();
      const draft = createDraft(before);
      fn(draft);
      const next = finishDraft(draft);

      const nextAny = next as unknown as Record<PropertyKey, unknown>;
      for (const key of Reflect.ownKeys(nextAny)) {
        if (!Reflect.has(before as object, key))
          throw new Error(`oinTree scope: unknown key ${String(key)}`);
      }

      const patches: OinPatch[] = [];
      const baseRevision = state.revision;

      const applyNodeDiff = (
        parentState: TreeScopeState | TreeArrayState,
        segment: PathSegment,
        node: TreeNode,
        prev: unknown,
        next: unknown,
        relPath: PathSegment[],
      ): boolean => {
        if (isPlainObject(prev) && isPlainObject(next)) {
          const internal = getInternal(node);
          if (internal?.kind === 'scope') {
            const childState = internal.getState();
            childState.isCommitting = true;
            const changed = applyScopeDiff(childState, prev, next, relPath);
            childState.isCommitting = false;
            if (changed) emitScopeValue(childState);
            return changed;
          }
        }

        if (Array.isArray(prev) && Array.isArray(next)) {
          const internal = getInternal(node);
          if (internal?.kind === 'array') {
            const childState = internal.getState();
            childState.isCommitting = true;
            const changed = applyArrayDiff(childState, prev, next, relPath);
            childState.isCommitting = false;
            if (changed) emitArrayValue(childState);
            return changed;
          }
        }

        if (Object.is(prev, next)) return false;

        if (isUnit(node)) {
          const internal = requireInternalOfKind(
            node,
            'unit',
            'oinTree commit: invalid unit internal',
          ) as unknown as UnitInternal;
          internal.setValue(next, { emitUpdate: false, emitValue: true });
          patches.push({
            op: 'set',
            path: relPath,
            prev: cloneValue(prev),
            next: cloneValue(next),
          });
          markDirty(parentState, segment);
          return true;
        }

        if (typeof segment === 'string') {
          detachChildFromScope(parentState as TreeScopeState, segment);
          unregisterSubtree(ctx, [...parentState.path, segment], node);
          const replaced = createTreeNode(
            ctx,
            [...parentState.path, segment],
            next,
          );
          (parentState as TreeScopeState).children.set(segment, replaced);
          attachChildToScope(parentState as TreeScopeState, segment, replaced);
          patches.push({
            op: 'set',
            path: relPath,
            prev: cloneValue(prev),
            next: cloneValue(next),
          });
          return true;
        }

        if (typeof segment !== 'number')
          throw new Error('oinTree array: invalid segment');
        if (typeof segment !== 'number')
          throw new Error('oinTree array: invalid segment');
        detachChildFromArray(parentState as TreeArrayState, node);
        unregisterSubtree(ctx, [...parentState.path, segment], node);
        const replaced = createTreeNode(
          ctx,
          [...parentState.path, segment],
          next,
        );
        const index = segment as number;
        (parentState as TreeArrayState).children[index] = replaced;
        attachChildToArray(parentState as TreeArrayState, replaced);
        patches.push({
          op: 'set',
          path: relPath,
          prev: cloneValue(prev),
          next: cloneValue(next),
        });
        return true;
      };

      const applyScopeDiff = (
        scopeState: TreeScopeState,
        prevObj: Record<PropertyKey, unknown>,
        nextObj: Record<PropertyKey, unknown>,
        relPath: PathSegment[],
      ): boolean => {
        let changed = false;
        for (const key of Reflect.ownKeys(nextObj)) {
          if (!Reflect.has(prevObj as object, key))
            throw new Error(`oinTree scope: unknown key ${String(key)}`);
        }
        for (const key of Reflect.ownKeys(prevObj)) {
          const node = scopeState.children.get(key);
          if (!node) continue;
          const prev = prevObj[key];
          const next = nextObj[key];

        if (isPlainObject(prev) && isPlainObject(next)) {
          const internal = getInternal(node);
          if (internal?.kind === 'scope') {
            const childState = internal.getState();
            childState.isCommitting = true;
            const childChanged = applyScopeDiff(childState, prev, next, [
              ...relPath,
              key,
            ]);
            childState.isCommitting = false;
            if (childChanged) emitScopeValue(childState);
            if (childChanged) markDirty(scopeState, key);
            changed = changed || childChanged;
            continue;
          }
        }

        if (Array.isArray(prev) && Array.isArray(next)) {
          const internal = getInternal(node);
          if (internal?.kind === 'array') {
            const childState = internal.getState();
            childState.isCommitting = true;
            const childChanged = applyArrayDiff(childState, prev, next, [
              ...relPath,
              key,
            ]);
            childState.isCommitting = false;
            if (childChanged) emitArrayValue(childState);
            if (childChanged) markDirty(scopeState, key);
            changed = changed || childChanged;
            continue;
          }
        }

          const nodeChanged = applyNodeDiff(scopeState, key, node, prev, next, [
            ...relPath,
            key,
          ]);
          changed = changed || nodeChanged;
        }
        return changed;
      };

      const applyArrayDiff = (
        arrayState: TreeArrayState,
        prevArr: unknown[],
        nextArr: unknown[],
        relPath: PathSegment[],
      ): boolean => {
        if (prevArr.length !== nextArr.length) {
          arrayState.dirtyStructure = true;
          arrayState.dirtyIndices.clear();
          const arrayNode = getPathNode(ctx, arrayState.path);
          if (arrayNode) unregisterSubtree(ctx, arrayState.path, arrayNode);

          for (let i = 0; i < arrayState.children.length; i += 1) {
            const child = arrayState.children[i];
            detachChildFromArray(arrayState, child);
            unregisterSubtree(ctx, [...arrayState.path, i], child);
          }
          arrayState.children = nextArr.map((v, index) =>
            createTreeNode(ctx, [...arrayState.path, index], v),
          );
          for (const child of arrayState.children)
            attachChildToArray(arrayState, child);

          if (arrayNode) registerSubtree(ctx, arrayState.path, arrayNode);

          patches.push({
            op: 'splice',
            path: relPath,
            start: 0,
            deleteCount: prevArr.length,
            deleted: prevArr,
            items: nextArr,
          });
          return true;
        }

        let changed = false;
        for (let i = 0; i < prevArr.length; i += 1) {
          const node = arrayState.children[i];
          const prev = prevArr[i];
          const next = nextArr[i];

          if (isPlainObject(prev) && isPlainObject(next)) {
            const internal = getInternal(node);
            if (internal?.kind === 'scope') {
              const childState = internal.getState();
              childState.isCommitting = true;
              const childChanged = applyScopeDiff(childState, prev, next, [
                ...relPath,
                i,
              ]);
              childState.isCommitting = false;
              if (childChanged) emitScopeValue(childState);
              if (childChanged) markDirty(arrayState, i);
              changed = changed || childChanged;
              continue;
            }
          }

          if (Array.isArray(prev) && Array.isArray(next)) {
            const internal = getInternal(node);
            if (internal?.kind === 'array') {
              const childState = internal.getState();
              childState.isCommitting = true;
              const childChanged = applyArrayDiff(childState, prev, next, [
                ...relPath,
                i,
              ]);
              childState.isCommitting = false;
              if (childChanged) emitArrayValue(childState);
              if (childChanged) markDirty(arrayState, i);
              changed = changed || childChanged;
              continue;
            }
          }

          const nodeChanged = applyNodeDiff(arrayState, i, node, prev, next, [
            ...relPath,
            i,
          ]);
          changed = changed || nodeChanged;
        }
        return changed;
      };

      state.isCommitting = true;
      const changed = applyScopeDiff(state, before, next, []);
      state.isCommitting = false;

      if (!changed) return;
      state.revision += 1;
      state.valueEpoch += 1;
      emitScopeUpdate(
        state,
        createUpdate(baseRevision, state.revision, patches),
      );
      emitScopeValue(state);
    } catch (error) {
      state.isCommitting = false;
      emitError(scope, error, path, 'commit');
      throw error;
    }
  };

  for (const [key, child] of state.children.entries()) scope[key] = child;

  Object.defineProperties(scope, {
    commit: { value: commit },
    snapshot: { value: snapshot },
    subscribe: { value: subscribe },
    subscribeUpdate: { value: subscribeUpdate },
    [INTERNAL]: {
      value: {
        kind: 'scope',
        getChild: (key: PropertyKey) => state.children.get(key),
        applySet,
        getState: () => state,
      },
    },
  });

  setPathNode(ctx, path, scope as unknown as TreeNode);
  return scope as unknown as OinTreeScope<Record<string, unknown>>;
}

function createTreeArray(
  ctx: TreeContext,
  path: NodePath,
  initial: unknown[],
): OinTreeArrayUnit<unknown> {
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

  const snapshot = (): unknown[] => getArraySnapshot(state);

  const array = function (): unknown[] {
    return snapshot();
  } as unknown as OinTreeArrayUnit<unknown> & object;
  const proxy = new Proxy(array as OinTreeArrayUnit<unknown> & object, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && /^[0-9]+$/.test(prop)) {
        return state.children[Number(prop)];
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as OinTreeArrayUnit<unknown>;

  state.node = proxy as unknown as TreeNode;
  ctx.seen.set(initial as unknown as object, proxy as unknown as TreeNode);
  setPathNode(ctx, path, proxy as unknown as TreeNode);

  const rebuildMapping = (): void => {
    rebuildSubtreeMapping(state, proxy as unknown as TreeNode);
  };

  const subscribe = (fn: (v: unknown[]) => void): OinUnsubscribe => {
    state.valueListeners.add(fn);
    return () => {
      state.valueListeners.delete(fn);
    };
  };

  const subscribeUpdate = (fn: (u: OinUpdate) => void): OinUnsubscribe => {
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
    const removedValues = removed.map((c) => getNodeValue(c, new WeakMap()));
    for (let i = 0; i < removed.length; i += 1) {
      const child = removed[i];
      detachChildFromArray(state, child);
      unregisterSubtree(ctx, [...path, normalizedStart + i], child);
    }

    const created = items.map((v, i) =>
      createTreeNode(ctx, [...path, normalizedStart + i], v),
    );
    for (const child of created) attachChildToArray(state, child);
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
      if (options?.emitValue !== false) emitArrayValue(state);
    } catch (error) {
      emitError(array, error, path, 'splice');
      throw error;
    }
  };

  const applySortOrder = (
    order: number[],
    options?: { emitValue?: boolean },
  ) => {
    try {
      if (order.length !== state.children.length)
        throw new Error('oinTree array: invalid sort order length');
      const old = state.children.slice();
      state.children = order.map((oldIndex) => old[oldIndex]);
      rebuildMapping();
      state.revision += 1;
      state.dirtyStructure = true;
      state.valueEpoch += 1;
      if (options?.emitValue !== false) emitArrayValue(state);
    } catch (error) {
      emitError(array, error, path, 'sort');
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
        throw new Error(`oinTree array: index out of range ${index}`);

      if (isUnit(existing)) {
        const internal = getInternal(existing);
        if (!internal || internal.kind !== 'unit')
          throw new Error('oinTree array: invalid unit internal');
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

      detachChildFromArray(state, existing);
      unregisterSubtree(ctx, [...path, index], existing);
      const replaced = createTreeNode(ctx, [...path, index], next);
      state.children[index] = replaced;
      attachChildToArray(state, replaced);
      state.revision += 1;
      state.dirtyIndices.add(index);
      state.valueEpoch += 1;
      if (options?.emitValue !== false) emitArrayValue(state);
    } catch (error) {
      emitError(array, error, [...path, index], 'set');
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
      for (const child of created) attachChildToArray(state, child);
      state.children.push(...created);
      rebuildMapping();

      const patch: OinPatch = {
        op: 'splice',
        path: [],
        start,
        deleteCount: 0,
        deleted: [],
        items: items.map((v) => cloneValue(v)),
      };
      emitArrayUpdate(
        state,
        createUpdate(baseRevision, state.revision, [patch]),
      );
      state.valueEpoch += 1;
      emitArrayValue(state);
    } catch (error) {
      emitError(array, error, path, 'push');
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
      const removedValue = getNodeValue(removed, new WeakMap());
      detachChildFromArray(state, removed);
      unregisterSubtree(ctx, [...path, start], removed);
      rebuildMapping();

      const patch: OinPatch = {
        op: 'splice',
        path: [],
        start,
        deleteCount: 1,
        deleted: [cloneValue(removedValue)],
        items: [],
      };
      emitArrayUpdate(
        state,
        createUpdate(baseRevision, state.revision, [patch]),
      );
      state.valueEpoch += 1;
      emitArrayValue(state);
      return removedValue;
    } catch (error) {
      emitError(array, error, path, 'pop');
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
      const patch: OinPatch = {
        op: 'splice',
        path: [],
        start: normalizedStart,
        deleteCount: dc,
        deleted: removedValues.map((v) => cloneValue(v)),
        items: items.map((v) => cloneValue(v)),
      };
      emitArrayUpdate(
        state,
        createUpdate(baseRevision, state.revision, [patch]),
      );
      state.valueEpoch += 1;
      emitArrayValue(state);
      rebuildMapping();
    } catch (error) {
      emitError(array, error, path, 'splice');
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
        value: getNodeValue(child, new WeakMap()),
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

      emitArrayUpdate(
        state,
        createUpdate(baseRevision, state.revision, [
          { op: 'sort', path: [], order },
        ]),
      );
      state.valueEpoch += 1;
      emitArrayValue(state);
    } catch (error) {
      emitError(array, error, path, 'sort');
      throw error;
    }
  };

  const commit = (fn: (draft: unknown[]) => void): void => {
    try {
      const before = snapshot();
      const draft = cloneValue(before);
      fn(draft);

      const baseRevision = state.revision;
      const patches: OinPatch[] = [];

      const applyScopeDiff = (
        scopeState: TreeScopeState,
        prevObj: Record<PropertyKey, unknown>,
        nextObj: Record<PropertyKey, unknown>,
        relPath: PathSegment[],
      ): boolean => {
        let changed = false;
        for (const key of Reflect.ownKeys(nextObj)) {
          if (!Reflect.has(prevObj as object, key))
            throw new Error(`oinTree scope: unknown key ${String(key)}`);
        }
        for (const key of Reflect.ownKeys(prevObj)) {
          const node = scopeState.children.get(key);
          if (!node) continue;
          const prev = prevObj[key];
          const next = nextObj[key];

          if (isPlainObject(prev) && isPlainObject(next)) {
            const internal = getInternal(node);
            if (internal?.kind === 'scope') {
              const childState = internal.getState();
              childState.isCommitting = true;
              const childChanged = applyScopeDiff(childState, prev, next, [
                ...relPath,
                key,
              ]);
              childState.isCommitting = false;
              if (childChanged) emitScopeValue(childState);
              if (childChanged) markDirty(scopeState, key);
              changed = changed || childChanged;
              continue;
            }
          }

          if (Array.isArray(prev) && Array.isArray(next)) {
            const internal = getInternal(node);
            if (internal?.kind === 'array') {
              const childState = internal.getState();
              childState.isCommitting = true;
              const childChanged = applyArrayDiff(childState, prev, next, [
                ...relPath,
                key,
              ]);
              childState.isCommitting = false;
              if (childChanged) emitArrayValue(childState);
              if (childChanged) markDirty(scopeState, key);
              changed = changed || childChanged;
              continue;
            }
          }

          const nodeChanged = applyNodeDiff(scopeState, key, node, prev, next, [
            ...relPath,
            key,
          ]);
          changed = changed || nodeChanged;
        }
        return changed;
      };

      const applyArrayDiff = (
        arrayState: TreeArrayState,
        prevArr: unknown[],
        nextArr: unknown[],
        relPath: PathSegment[],
      ): boolean => {
        if (prevArr.length !== nextArr.length) {
          arrayState.dirtyStructure = true;
          arrayState.dirtyIndices.clear();
          const arrayNode = getPathNode(ctx, arrayState.path);
          if (arrayNode) unregisterSubtree(ctx, arrayState.path, arrayNode);

          for (let i = 0; i < arrayState.children.length; i += 1) {
            const child = arrayState.children[i];
            detachChildFromArray(arrayState, child);
            unregisterSubtree(ctx, [...arrayState.path, i], child);
          }
          arrayState.children = nextArr.map((v, index) =>
            createTreeNode(ctx, [...arrayState.path, index], v),
          );
          for (const child of arrayState.children)
            attachChildToArray(arrayState, child);

          if (arrayNode) registerSubtree(ctx, arrayState.path, arrayNode);

          patches.push({
            op: 'splice',
            path: relPath,
            start: 0,
            deleteCount: prevArr.length,
            deleted: prevArr.map((v) => cloneValue(v)),
            items: nextArr.map((v) => cloneValue(v)),
          });
          return true;
        }

        let changed = false;
        for (let i = 0; i < prevArr.length; i += 1) {
          const node = arrayState.children[i];
          const prev = prevArr[i];
          const next = nextArr[i];

          if (isPlainObject(prev) && isPlainObject(next)) {
            const internal = getInternal(node);
            if (internal?.kind === 'scope') {
              const childState = internal.getState();
              childState.isCommitting = true;
              const childChanged = applyScopeDiff(childState, prev, next, [
                ...relPath,
                i,
              ]);
              childState.isCommitting = false;
              if (childChanged) emitScopeValue(childState);
              if (childChanged) markDirty(arrayState, i);
              changed = changed || childChanged;
              continue;
            }
          }

          if (Array.isArray(prev) && Array.isArray(next)) {
            const internal = getInternal(node);
            if (internal?.kind === 'array') {
              const childState = internal.getState();
              childState.isCommitting = true;
              const childChanged = applyArrayDiff(childState, prev, next, [
                ...relPath,
                i,
              ]);
              childState.isCommitting = false;
              if (childChanged) emitArrayValue(childState);
              if (childChanged) markDirty(arrayState, i);
              changed = changed || childChanged;
              continue;
            }
          }

          const nodeChanged = applyNodeDiff(arrayState, i, node, prev, next, [
            ...relPath,
            i,
          ]);
          changed = changed || nodeChanged;
        }
        return changed;
      };

      const applyNodeDiff = (
        parentState: TreeScopeState | TreeArrayState,
        segment: PathSegment,
        node: TreeNode,
        prev: unknown,
        next: unknown,
        relPath: PathSegment[],
      ): boolean => {
        if (isPlainObject(prev) && isPlainObject(next)) {
          const internal = getInternal(node);
          if (internal?.kind === 'scope') {
            const childState = internal.getState();
            childState.isCommitting = true;
            const changed = applyScopeDiff(childState, prev, next, relPath);
            childState.isCommitting = false;
            if (changed) emitScopeValue(childState);
            if (changed) markDirty(parentState, segment);
            return changed;
          }
        }

        if (Array.isArray(prev) && Array.isArray(next)) {
          const internal = getInternal(node);
          if (internal?.kind === 'array') {
            const childState = internal.getState();
            childState.isCommitting = true;
            const changed = applyArrayDiff(childState, prev, next, relPath);
            childState.isCommitting = false;
            if (changed) emitArrayValue(childState);
            if (changed) markDirty(parentState, segment);
            return changed;
          }
        }

        if (Object.is(prev, next)) return false;

        if (isUnit(node)) {
          const internal = requireInternalOfKind(
            node,
            'unit',
            'oinTree commit: invalid unit internal',
          ) as unknown as UnitInternal;
          internal.setValue(next, { emitUpdate: false, emitValue: true });
          patches.push({
            op: 'set',
            path: relPath,
            prev,
            next,
          });
          markDirty(parentState, segment);
          return true;
        }

        if (typeof segment === 'string') {
          detachChildFromScope(parentState as TreeScopeState, segment);
          unregisterSubtree(ctx, [...parentState.path, segment], node);
          const replaced = createTreeNode(
            ctx,
            [...parentState.path, segment],
            next,
          );
          (parentState as TreeScopeState).children.set(segment, replaced);
          attachChildToScope(parentState as TreeScopeState, segment, replaced);
          patches.push({
            op: 'set',
            path: relPath,
            prev,
            next,
          });
          markDirty(parentState, segment);
          return true;
        }

        if (typeof segment !== 'number')
          throw new Error('oinTree array: invalid segment');
        const index = segment as number;
        detachChildFromArray(parentState as TreeArrayState, node);
        unregisterSubtree(ctx, [...parentState.path, segment], node);
        const replaced = createTreeNode(
          ctx,
          [...parentState.path, segment],
          next,
        );
        (parentState as TreeArrayState).children[index] = replaced;
        attachChildToArray(parentState as TreeArrayState, replaced);
        patches.push({
          op: 'set',
          path: relPath,
          prev,
          next,
        });
        markDirty(parentState, segment);
        return true;
      };

      state.isCommitting = true;
      const changed = applyArrayDiff(state, before, draft as unknown[], []);
      state.isCommitting = false;

      if (!changed) return;
      state.revision += 1;
      emitArrayUpdate(
        state,
        createUpdate(baseRevision, state.revision, patches),
      );
      state.valueEpoch += 1;
      emitArrayValue(state);
    } catch (error) {
      state.isCommitting = false;
      emitError(array, error, path, 'commit');
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
    [INTERNAL]: {
      value: {
        kind: 'array',
        getChild: (index: number) => state.children[index],
        setIndex,
        applySplice,
        applySortOrder,
        getState: () => state,
      },
    },
  });

  for (let i = 0; i < initial.length; i += 1) {
    const value = i in initial ? initial[i] : undefined;
    const child = createTreeNode(ctx, [...path, i], value);
    state.children[i] = child;
    attachChildToArray(state, child);
  }

  return proxy;
}

export function oinTree<T>(
  initial: T,
  options?: { silent?: boolean; devtools?: boolean },
): OinTreeNode<T> {
  const devtools = resolveDevtoolsEnabled(options);
  const ctx: TreeContext = {
    root: createTrieNode(),
    errorListeners: new Set(),
    devtools,
    silent: options?.silent === true,
    seen: new WeakMap(),
  };
  return createTreeNode(ctx, [], initial) as unknown as OinTreeNode<T>;
}

function resolveDevtoolsEnabled(options?: { devtools?: boolean }): boolean {
  if (options?.devtools === true) return true;
  if (options?.devtools === false) return false;
  const flag = (globalThis as Record<PropertyKey, unknown>).__OIN_DEVTOOLS__;
  if (flag === false) return false;
  return isDevEnv();
}

function isDevEnv(): boolean {
  if (typeof process !== 'undefined') {
    const env = (
      process as unknown as { env?: Record<string, string | undefined> }
    ).env;
    if (env?.NODE_ENV) return env.NODE_ENV !== 'production';
  }
  return true;
}
