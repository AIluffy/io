import { cloneValue, snapshotValue } from './snapshot.js';
import { createUpdate } from './updates.js';
import type {
  OinTreeArrayUnit,
  OinTreeNode,
  OinPatch,
  OinTreeScope,
  OinUnit,
  OinUnsubscribe,
  OinUpdate,
} from './types.js';
import { createUnit, isUnit } from './unit.js';

const INTERNAL = Symbol.for('@org/oin/internal');

type PathSegment = string | number;
type NodePath = readonly PathSegment[];

type TreeScopeNode = OinTreeScope<Record<string, unknown>>;
type TreeArrayNode = OinTreeArrayUnit<unknown>;
type TreeNode = OinUnit<unknown> | TreeScopeNode | TreeArrayNode;

type TreeContext = {
  pathToNode: Map<string, TreeNode>;
};

function pathKey(path: NodePath): string {
  return JSON.stringify(path);
}

const noopUnsubscribe: OinUnsubscribe = () => {
  return undefined;
};

type UnitInternal = {
  kind: 'unit';
  getValue: () => unknown;
  setValue: (
    next: unknown,
    options?: { emitUpdate?: boolean; emitValue?: boolean }
  ) => void;
  getState: () => unknown;
};

type TreeScopeInternal = {
  kind: 'scope';
  getChild: (key: string) => TreeNode | undefined;
  applySet: (
    key: string,
    next: unknown,
    options?: { emitUpdate?: boolean; emitValue?: boolean }
  ) => void;
  getState: () => TreeScopeState;
};

type TreeArrayInternal = {
  kind: 'array';
  getChild: (index: number) => TreeNode | undefined;
  setIndex: (
    index: number,
    next: unknown,
    options?: { emitUpdate?: boolean; emitValue?: boolean }
  ) => void;
  applySplice: (
    start: number,
    deleteCount: number,
    items: unknown[],
    options?: { emitValue?: boolean }
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
  children: Map<string, TreeNode>;
  revision: number;
  isCommitting: boolean;
  valueListeners: Set<(value: Record<string, unknown>) => void>;
  updateListeners: Set<(update: OinUpdate) => void>;
  childValueUnsubs: Map<string, OinUnsubscribe>;
  childUpdateUnsubs: Map<string, OinUnsubscribe>;
  ctx: TreeContext;
  path: NodePath;
};

type TreeArrayState = {
  children: TreeNode[];
  revision: number;
  isCommitting: boolean;
  valueListeners: Set<(value: unknown[]) => void>;
  updateListeners: Set<(update: OinUpdate) => void>;
  childValueUnsubs: Map<TreeNode, OinUnsubscribe>;
  childUpdateUnsubs: Map<TreeNode, OinUnsubscribe>;
  ctx: TreeContext;
  path: NodePath;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || value === undefined) return false;
  if (typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function getInternal(value: unknown): TreeInternal | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'function' && typeof value !== 'object')
    return undefined;
  const internal = (value as unknown as Record<PropertyKey, unknown>)[INTERNAL];
  if (typeof internal !== 'object' || internal === null) return undefined;
  const kind = (internal as { kind?: unknown }).kind;
  if (
    kind === 'unit' ||
    kind === 'scope' ||
    kind === 'array' ||
    kind === 'derived'
  )
    return internal as TreeInternal;
  return undefined;
}

function registerSubtree(
  ctx: TreeContext,
  path: NodePath,
  node: TreeNode
): void {
  ctx.pathToNode.set(pathKey(path), node);

  const internal = getInternal(node);
  if (!internal) return;

  if (internal.kind === 'scope') {
    const state = internal.getState();
    for (const [key, child] of state.children.entries()) {
      registerSubtree(ctx, [...path, key], child);
    }
    return;
  }

  if (internal.kind === 'array') {
    const state = internal.getState();
    for (let i = 0; i < state.children.length; i += 1) {
      registerSubtree(ctx, [...path, i], state.children[i]);
    }
  }
}

function unregisterSubtree(
  ctx: TreeContext,
  path: NodePath,
  node: TreeNode
): void {
  ctx.pathToNode.delete(pathKey(path));

  const internal = getInternal(node);
  if (!internal) return;

  if (internal.kind === 'scope') {
    const state = internal.getState();
    for (const [key, child] of state.children.entries()) {
      unregisterSubtree(ctx, [...path, key], child);
    }
    return;
  }

  if (internal.kind === 'array') {
    const state = internal.getState();
    for (let i = 0; i < state.children.length; i += 1) {
      unregisterSubtree(ctx, [...path, i], state.children[i]);
    }
  }
}

function rebuildSubtreeMapping(
  state: { ctx: TreeContext; path: NodePath },
  node: TreeNode
): void {
  unregisterSubtree(state.ctx, state.path, node);
  registerSubtree(state.ctx, state.path, node);
}

function hasSnapshot(value: unknown): value is { snapshot(): unknown } {
  if (typeof value !== 'object' || value === null) return false;
  return typeof (value as { snapshot?: unknown }).snapshot === 'function';
}

function getNodeValue(node: TreeNode): unknown {
  if (typeof node === 'function') return node();
  if (hasSnapshot(node)) return node.snapshot();
  return snapshotValue(node);
}

function emitScopeValue(state: TreeScopeState): void {
  const plain: Record<string, unknown> = {};
  for (const [key, node] of state.children.entries())
    plain[key] = getNodeValue(node);
  const value = snapshotValue(plain);
  for (const listener of state.valueListeners) listener(value);
}

function emitScopeUpdate(state: TreeScopeState, update: OinUpdate): void {
  for (const listener of state.updateListeners) listener(update);
}

function emitArrayValue(state: TreeArrayState): void {
  const values = snapshotValue(state.children.map((c) => getNodeValue(c)));
  for (const listener of state.valueListeners) listener(values);
}

function emitArrayUpdate(state: TreeArrayState, update: OinUpdate): void {
  for (const listener of state.updateListeners) listener(update);
}

function attachChildToScope(
  state: TreeScopeState,
  key: string,
  child: TreeNode
): void {
  const maybeValueSub = child as unknown as Partial<{
    subscribe: (fn: (v: unknown) => void) => OinUnsubscribe;
  }>;
  const valueUnsub =
    typeof maybeValueSub.subscribe === 'function'
      ? maybeValueSub.subscribe(() => {
          if (state.isCommitting) return;
          emitScopeValue(state);
        })
      : noopUnsubscribe;

  const maybeUpdateSub = child as unknown as Partial<{
    subscribeUpdate: (fn: (u: OinUpdate) => void) => OinUnsubscribe;
  }>;
  const updateUnsub =
    typeof maybeUpdateSub.subscribeUpdate === 'function'
      ? maybeUpdateSub.subscribeUpdate((u: OinUpdate) => {
          const patches: OinPatch[] = u.patches.map((p) => ({
            ...p,
            path: [key, ...p.path],
          }));
          const baseRevision = state.revision;
          state.revision += 1;
          emitScopeUpdate(
            state,
            createUpdate(baseRevision, state.revision, patches)
          );
        })
      : noopUnsubscribe;

  state.childValueUnsubs.set(key, valueUnsub);
  state.childUpdateUnsubs.set(key, updateUnsub);
}

function detachChildFromScope(state: TreeScopeState, key: string): void {
  state.childValueUnsubs.get(key)?.();
  state.childUpdateUnsubs.get(key)?.();
  state.childValueUnsubs.delete(key);
  state.childUpdateUnsubs.delete(key);
}

function attachChildToArray(state: TreeArrayState, child: TreeNode): void {
  const maybeValueSub = child as unknown as Partial<{
    subscribe: (fn: (v: unknown) => void) => OinUnsubscribe;
  }>;
  const valueUnsub =
    typeof maybeValueSub.subscribe === 'function'
      ? maybeValueSub.subscribe(() => {
          if (state.isCommitting) return;
          emitArrayValue(state);
        })
      : noopUnsubscribe;

  const maybeUpdateSub = child as unknown as Partial<{
    subscribeUpdate: (fn: (u: OinUpdate) => void) => OinUnsubscribe;
  }>;
  const updateUnsub =
    typeof maybeUpdateSub.subscribeUpdate === 'function'
      ? maybeUpdateSub.subscribeUpdate((u: OinUpdate) => {
          const index = state.children.indexOf(child);
          if (index < 0) return;
          const patches: OinPatch[] = u.patches.map((p) => ({
            ...p,
            path: [index, ...p.path],
          }));
          const baseRevision = state.revision;
          state.revision += 1;
          emitArrayUpdate(
            state,
            createUpdate(baseRevision, state.revision, patches)
          );
        })
      : noopUnsubscribe;

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
  initial: unknown
): TreeNode {
  if (Array.isArray(initial)) return createTreeArray(ctx, path, initial);
  if (isPlainObject(initial)) return createTreeScope(ctx, path, initial);
  const unit = createUnit(cloneValue(initial)) as unknown as TreeNode;
  registerSubtree(ctx, path, unit);
  return unit;
}

function createTreeScope(
  ctx: TreeContext,
  path: NodePath,
  initial: Record<string, unknown>
): OinTreeScope<Record<string, unknown>> {
  const state: TreeScopeState = {
    children: new Map(),
    revision: 0,
    isCommitting: false,
    valueListeners: new Set(),
    updateListeners: new Set(),
    childValueUnsubs: new Map(),
    childUpdateUnsubs: new Map(),
    ctx,
    path,
  };

  for (const key of Object.keys(initial)) {
    const child = createTreeNode(ctx, [...path, key], initial[key]);
    state.children.set(key, child);
  }

  for (const [key, child] of state.children.entries())
    attachChildToScope(state, key, child);

  const snapshot = (): Record<string, unknown> => {
    const plain: Record<string, unknown> = {};
    for (const [key, child] of state.children.entries())
      plain[key] = getNodeValue(child);
    return snapshotValue(plain);
  };

  const subscribe = (
    fn: (v: Record<string, unknown>) => void
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
    key: string,
    next: unknown,
    options?: { emitUpdate?: boolean; emitValue?: boolean }
  ): void => {
    const existing = state.children.get(key);
    if (!existing) throw new Error(`oinTree scope: missing key ${key}`);

    if (isUnit(existing)) {
      const internal = getInternal(existing);
      if (!internal || internal.kind !== 'unit')
        throw new Error('oinTree scope: invalid unit internal');
      const before = internal.getValue();
      internal.setValue(next, {
        emitUpdate: false,
        emitValue: options?.emitValue !== false,
      });
      const after = internal.getValue();
      if (!Object.is(before, after)) state.revision += 1;
      return;
    }

    detachChildFromScope(state, key);
    unregisterSubtree(ctx, [...path, key], existing);
    const replaced = createTreeNode(ctx, [...path, key], next);
    state.children.set(key, replaced);
    attachChildToScope(state, key, replaced);
    state.revision += 1;
    if (options?.emitValue !== false) emitScopeValue(state);
  };

  const commit = (fn: (draft: Record<string, unknown>) => void): void => {
    const before = snapshot();
    const draft = cloneValue(before);
    fn(draft);

    for (const key of Object.keys(draft)) {
      if (!(key in before))
        throw new Error(`oinTree scope: unknown key ${key}`);
    }

    const patches: OinPatch[] = [];
    const baseRevision = state.revision;

    const applyNodeDiff = (
      parentState: TreeScopeState | TreeArrayState,
      segment: string | number,
      node: TreeNode,
      prev: unknown,
      next: unknown,
      relPath: PathSegment[]
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
        const internal = getInternal(node);
        if (!internal || internal.kind !== 'unit')
          throw new Error('oinTree commit: invalid unit internal');
        internal.setValue(next, { emitUpdate: false, emitValue: true });
        patches.push({
          op: 'set',
          path: relPath,
          prev: cloneValue(prev),
          next: cloneValue(next),
        });
        return true;
      }

      if (typeof segment === 'string') {
        detachChildFromScope(parentState as TreeScopeState, segment);
        unregisterSubtree(ctx, [...parentState.path, segment], node);
        const replaced = createTreeNode(
          ctx,
          [...parentState.path, segment],
          next
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

      detachChildFromArray(parentState as TreeArrayState, node);
      unregisterSubtree(ctx, [...parentState.path, segment], node);
      const replaced = createTreeNode(
        ctx,
        [...parentState.path, segment],
        next
      );
      (parentState as TreeArrayState).children[segment] = replaced;
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
      prevObj: Record<string, unknown>,
      nextObj: Record<string, unknown>,
      relPath: PathSegment[]
    ): boolean => {
      let changed = false;
      for (const key of Object.keys(nextObj)) {
        if (!(key in prevObj))
          throw new Error(`oinTree scope: unknown key ${key}`);
      }
      for (const key of Object.keys(prevObj)) {
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
      relPath: PathSegment[]
    ): boolean => {
      if (prevArr.length !== nextArr.length) {
        const arrayNode = ctx.pathToNode.get(pathKey(arrayState.path));
        if (arrayNode) unregisterSubtree(ctx, arrayState.path, arrayNode);

        for (let i = 0; i < arrayState.children.length; i += 1) {
          const child = arrayState.children[i];
          detachChildFromArray(arrayState, child);
          unregisterSubtree(ctx, [...arrayState.path, i], child);
        }
        arrayState.children = nextArr.map((v, index) =>
          createTreeNode(ctx, [...arrayState.path, index], v)
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
    const changed = applyScopeDiff(state, before, draft, []);
    state.isCommitting = false;

    if (!changed) return;
    state.revision += 1;
    emitScopeUpdate(state, createUpdate(baseRevision, state.revision, patches));
    emitScopeValue(state);
  };

  const scope: Record<string, unknown> = {};
  for (const [key, child] of state.children.entries()) scope[key] = child;

  Object.defineProperties(scope, {
    commit: { value: commit },
    snapshot: { value: snapshot },
    subscribe: { value: subscribe },
    subscribeUpdate: { value: subscribeUpdate },
    [INTERNAL]: {
      value: {
        kind: 'scope',
        getChild: (key: string) => state.children.get(key),
        applySet,
        getState: () => state,
      },
    },
  });

  ctx.pathToNode.set(pathKey(path), scope as unknown as TreeNode);
  return scope as unknown as OinTreeScope<Record<string, unknown>>;
}

function createTreeArray(
  ctx: TreeContext,
  path: NodePath,
  initial: unknown[]
): OinTreeArrayUnit<unknown> {
  const state: TreeArrayState = {
    children: initial.map((v, index) =>
      createTreeNode(ctx, [...path, index], v)
    ),
    revision: 0,
    isCommitting: false,
    valueListeners: new Set(),
    updateListeners: new Set(),
    childValueUnsubs: new Map(),
    childUpdateUnsubs: new Map(),
    ctx,
    path,
  };

  for (const child of state.children) attachChildToArray(state, child);

  const snapshot = (): unknown[] =>
    snapshotValue(state.children.map((c) => getNodeValue(c)));

  const array = function (): unknown[] {
    return snapshot();
  } as unknown as OinTreeArrayUnit<unknown> & object;
  ctx.pathToNode.set(pathKey(path), array as unknown as TreeNode);

  const rebuildMapping = (): void => {
    rebuildSubtreeMapping(state, array as unknown as TreeNode);
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
    items: unknown[]
  ) => {
    const normalizedStart =
      start < 0 ? Math.max(0, state.children.length + start) : start;
    const dc = Math.max(
      0,
      Math.min(deleteCount, state.children.length - normalizedStart)
    );

    const removed = state.children.splice(normalizedStart, dc);
    const removedValues = removed.map((c) => getNodeValue(c));
    for (let i = 0; i < removed.length; i += 1) {
      const child = removed[i];
      detachChildFromArray(state, child);
      unregisterSubtree(ctx, [...path, normalizedStart + i], child);
    }

    const created = items.map((v, i) =>
      createTreeNode(ctx, [...path, normalizedStart + i], v)
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
    options?: { emitValue?: boolean }
  ) => {
    state.revision += 1;
    performSplice(start, deleteCount, items);
    if (options?.emitValue !== false) emitArrayValue(state);
  };

  const applySortOrder = (
    order: number[],
    options?: { emitValue?: boolean }
  ) => {
    if (order.length !== state.children.length)
      throw new Error('oinTree array: invalid sort order length');
    const old = state.children.slice();
    state.children = order.map((oldIndex) => old[oldIndex]);
    rebuildMapping();
    state.revision += 1;
    if (options?.emitValue !== false) emitArrayValue(state);
  };

  const setIndex = (
    index: number,
    next: unknown,
    options?: { emitUpdate?: boolean; emitValue?: boolean }
  ) => {
    const existing = state.children[index];
    if (!existing)
      throw new Error(`oinTree array: index out of range ${index}`);

    if (isUnit(existing)) {
      const internal = getInternal(existing);
      if (!internal || internal.kind !== 'unit')
        throw new Error('oinTree array: invalid unit internal');
      const before = internal.getValue();
      internal.setValue(next, {
        emitUpdate: false,
        emitValue: options?.emitValue !== false,
      });
      const after = internal.getValue();
      if (!Object.is(before, after)) state.revision += 1;
      return;
    }

    detachChildFromArray(state, existing);
    unregisterSubtree(ctx, [...path, index], existing);
    const replaced = createTreeNode(ctx, [...path, index], next);
    state.children[index] = replaced;
    attachChildToArray(state, replaced);
    state.revision += 1;
    if (options?.emitValue !== false) emitArrayValue(state);
  };

  const push = (...items: unknown[]): void => {
    if (items.length === 0) return;
    const baseRevision = state.revision;
    state.revision += 1;

    const start = state.children.length;
    const created = items.map((v, i) =>
      createTreeNode(ctx, [...path, start + i], v)
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
    emitArrayUpdate(state, createUpdate(baseRevision, state.revision, [patch]));
    emitArrayValue(state);
  };

  const pop = (): unknown => {
    if (state.children.length === 0) return undefined;
    const baseRevision = state.revision;
    state.revision += 1;

    const start = state.children.length - 1;
    const removed = state.children.pop();
    if (!removed) return undefined;
    const removedValue = getNodeValue(removed);
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
    emitArrayUpdate(state, createUpdate(baseRevision, state.revision, [patch]));
    emitArrayValue(state);
    return removedValue;
  };

  const splice = (
    start: number,
    deleteCount: number,
    ...items: unknown[]
  ): void => {
    const baseRevision = state.revision;
    state.revision += 1;

    const { normalizedStart, dc, removedValues } = performSplice(
      start,
      deleteCount,
      items
    );
    const patch: OinPatch = {
      op: 'splice',
      path: [],
      start: normalizedStart,
      deleteCount: dc,
      deleted: removedValues.map((v) => cloneValue(v)),
      items: items.map((v) => cloneValue(v)),
    };
    emitArrayUpdate(state, createUpdate(baseRevision, state.revision, [patch]));
    emitArrayValue(state);
    rebuildMapping();
  };

  const sort = (compareFn?: (a: unknown, b: unknown) => number): void => {
    if (state.children.length <= 1) return;
    const baseRevision = state.revision;
    state.revision += 1;

    const decorated = state.children.map((child, index) => ({
      child,
      index,
      value: getNodeValue(child),
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
      ])
    );
    emitArrayValue(state);
  };

  const commit = (fn: (draft: unknown[]) => void): void => {
    const before = snapshot();
    const draft = cloneValue(before);
    fn(draft);

    const baseRevision = state.revision;
    const patches: OinPatch[] = [];

    const applyScopeDiff = (
      scopeState: TreeScopeState,
      prevObj: Record<string, unknown>,
      nextObj: Record<string, unknown>,
      relPath: PathSegment[]
    ): boolean => {
      let changed = false;
      for (const key of Object.keys(nextObj)) {
        if (!(key in prevObj))
          throw new Error(`oinTree scope: unknown key ${key}`);
      }
      for (const key of Object.keys(prevObj)) {
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
      relPath: PathSegment[]
    ): boolean => {
      if (prevArr.length !== nextArr.length) {
        const arrayNode = ctx.pathToNode.get(pathKey(arrayState.path));
        if (arrayNode) unregisterSubtree(ctx, arrayState.path, arrayNode);

        for (let i = 0; i < arrayState.children.length; i += 1) {
          const child = arrayState.children[i];
          detachChildFromArray(arrayState, child);
          unregisterSubtree(ctx, [...arrayState.path, i], child);
        }
        arrayState.children = nextArr.map((v, index) =>
          createTreeNode(ctx, [...arrayState.path, index], v)
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
      segment: string | number,
      node: TreeNode,
      prev: unknown,
      next: unknown,
      relPath: PathSegment[]
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
        const internal = getInternal(node);
        if (!internal || internal.kind !== 'unit')
          throw new Error('oinTree commit: invalid unit internal');
        internal.setValue(next, { emitUpdate: false, emitValue: true });
        patches.push({
          op: 'set',
          path: relPath,
          prev: cloneValue(prev),
          next: cloneValue(next),
        });
        return true;
      }

      if (typeof segment === 'string') {
        detachChildFromScope(parentState as TreeScopeState, segment);
        unregisterSubtree(ctx, [...parentState.path, segment], node);
        const replaced = createTreeNode(
          ctx,
          [...parentState.path, segment],
          next
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

      detachChildFromArray(parentState as TreeArrayState, node);
      unregisterSubtree(ctx, [...parentState.path, segment], node);
      const replaced = createTreeNode(
        ctx,
        [...parentState.path, segment],
        next
      );
      (parentState as TreeArrayState).children[segment] = replaced;
      attachChildToArray(parentState as TreeArrayState, replaced);
      patches.push({
        op: 'set',
        path: relPath,
        prev: cloneValue(prev),
        next: cloneValue(next),
      });
      return true;
    };

    state.isCommitting = true;
    const changed = applyArrayDiff(state, before, draft as unknown[], []);
    state.isCommitting = false;

    if (!changed) return;
    state.revision += 1;
    emitArrayUpdate(state, createUpdate(baseRevision, state.revision, patches));
    emitArrayValue(state);
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

  return new Proxy(array as OinTreeArrayUnit<unknown> & object, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && /^[0-9]+$/.test(prop)) {
        return state.children[Number(prop)];
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as OinTreeArrayUnit<unknown>;
}

export function oinTree<T>(initial: T): OinTreeNode<T> {
  const ctx: TreeContext = { pathToNode: new Map() };
  return createTreeNode(ctx, [], initial) as unknown as OinTreeNode<T>;
}
