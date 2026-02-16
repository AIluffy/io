import { describe, expect, it, vi } from 'vitest';
import { createDirtyIndexState } from '../core/mutation/dirty-indices.js';
import { createSubscriptions } from '../core/mutation/subscriptions.js';
import { initialEpoch, initialRevision } from '../utils/types/branded.js';

type FakeChild = {
  subscribe?: (fn: (value: unknown) => void) => () => void;
  subscribeUpdate?: (
    fn: (update: { patches: unknown[] }) => void,
  ) => () => void;
};

function createArrayState() {
  return {
    children: [{} as FakeChild, {} as FakeChild],
    revision: initialRevision(),
    isCommitting: false,
    valueEpoch: initialEpoch(),
    dirtyIndices: createDirtyIndexState(2),
    valueListeners: new Set<(value: unknown[]) => void>(),
    updateListeners: new Set<(update: { patches: unknown[] }) => void>(),
    childValueUnsubs: new Map<
      FakeChild,
      { unsub: () => void; count: number }
    >(),
    childUpdateUnsubs: new Map<
      FakeChild,
      { unsub: () => void; count: number }
    >(),
  };
}

function createScopeState() {
  return {
    children: new Map<PropertyKey, FakeChild>(),
    revision: initialRevision(),
    isCommitting: false,
    valueEpoch: initialEpoch(),
    dirtyKeys: new Set<PropertyKey>(),
    valueListeners: new Set<(value: Record<string, unknown>) => void>(),
    updateListeners: new Set<(update: { patches: unknown[] }) => void>(),
    childValueUnsubs: new Map<PropertyKey, () => void>(),
    childUpdateUnsubs: new Map<PropertyKey, () => void>(),
  };
}

describe('core/subscriptions', () => {
  it('marks numeric-string segments as dirty array indices', () => {
    const state = createArrayState();
    const subscriptions = createSubscriptions({
      getScopeSnapshot: () => ({}),
      getArraySnapshot: () => [],
    });

    subscriptions.markDirty(state as never, '1');
    subscriptions.markDirty(state as never, 'x');

    expect(state.dirtyIndices.items).toEqual([1]);
  });

  it('detaches scope child subscriptions and removes map entries', () => {
    const valueUnsub = vi.fn();
    const updateUnsub = vi.fn();
    let onValue: (() => void) | undefined;
    let onUpdate: ((update: { patches: unknown[] }) => void) | undefined;
    const child: FakeChild = {
      subscribe: (fn) => {
        onValue = () => fn(undefined);
        return valueUnsub;
      },
      subscribeUpdate: (fn) => {
        onUpdate = fn;
        return updateUnsub;
      },
    };
    const state = createScopeState();
    const subscriptions = createSubscriptions({
      getScopeSnapshot: () => ({ ok: true }),
      getArraySnapshot: () => [],
    });

    subscriptions.attachChildToScope(state as never, 'a', child as never);
    onValue?.();
    onUpdate?.({ patches: [] });
    subscriptions.detachChildFromScope(state as never, 'a');

    expect(valueUnsub).toHaveBeenCalledTimes(1);
    expect(updateUnsub).toHaveBeenCalledTimes(1);
    expect(state.childValueUnsubs.has('a')).toBe(false);
    expect(state.childUpdateUnsubs.has('a')).toBe(false);
  });

  it('resolves array child indices without childIndices map and ref-counts unsubs', () => {
    const valueUnsub = vi.fn();
    const updateUnsub = vi.fn();
    let onValue: (() => void) | undefined;
    let onUpdate: ((update: { patches: unknown[] }) => void) | undefined;
    const child: FakeChild = {
      subscribe: (fn) => {
        onValue = () => fn(undefined);
        return valueUnsub;
      },
      subscribeUpdate: (fn) => {
        onUpdate = fn;
        return updateUnsub;
      },
    };
    const state = createArrayState();
    state.children = [child, {} as FakeChild, child];
    const values: unknown[][] = [];
    const updates: Array<{ patches: unknown[] }> = [];
    state.valueListeners.add((v) => values.push(v));
    state.updateListeners.add((u) => updates.push(u));
    const subscriptions = createSubscriptions({
      getScopeSnapshot: () => ({}),
      getArraySnapshot: () => ['snapshot'],
    });

    subscriptions.attachChildToArray(state as never, child as never);
    subscriptions.attachChildToArray(state as never, child as never);
    onValue?.();
    onUpdate?.({
      patches: [{ op: 'set', path: [], prev: 0, next: 1 }],
    });
    subscriptions.detachChildFromArray(state as never, child as never);
    expect(valueUnsub).toHaveBeenCalledTimes(0);
    expect(updateUnsub).toHaveBeenCalledTimes(0);
    subscriptions.detachChildFromArray(state as never, child as never);

    expect(values).toEqual([['snapshot']]);
    expect(state.dirtyIndices.items).toEqual([0, 2, 2]);
    expect(updates).toHaveLength(1);
    const paths = updates[0].patches.map((p) => (p as { path: unknown }).path);
    expect(paths).toContainEqual([0]);
    expect(paths).toContainEqual([2]);
    expect(valueUnsub).toHaveBeenCalledTimes(1);
    expect(updateUnsub).toHaveBeenCalledTimes(1);
  });

  it('skips scope/array value emission while committing', () => {
    let onScopeValue: (() => void) | undefined;
    let onArrayValue: (() => void) | undefined;
    const scopeState = createScopeState();
    scopeState.isCommitting = true;
    const arrayState = createArrayState();
    arrayState.children = [{} as FakeChild];
    arrayState.isCommitting = true;
    const child: FakeChild = {
      subscribe: (fn) => {
        onScopeValue = () => fn(undefined);
        onArrayValue = () => fn(undefined);
        return () => undefined;
      },
      subscribeUpdate: () => () => undefined,
    };
    const scopeValues: Array<Record<string, unknown>> = [];
    scopeState.valueListeners.add((v) => scopeValues.push(v));
    const arrayValues: unknown[][] = [];
    arrayState.valueListeners.add((v) => arrayValues.push(v));

    const subscriptions = createSubscriptions({
      getScopeSnapshot: () => ({ ok: true }),
      getArraySnapshot: () => ['ok'],
    });
    subscriptions.emitScopeValue(scopeState as never);
    subscriptions.emitArrayValue(arrayState as never);
    subscriptions.attachChildToScope(scopeState as never, 'k', child as never);
    subscriptions.attachChildToArray(arrayState as never, child as never);

    onScopeValue?.();
    onArrayValue?.();

    expect(scopeValues).toEqual([{ ok: true }]);
    expect(arrayValues).toEqual([['ok']]);
    expect(scopeState.dirtyKeys.size).toBe(0);
    expect(arrayState.dirtyIndices.items).toEqual([]);
  });

  it('rebuilds and reuses childIndices map when present', () => {
    let onUpdateA: ((update: { patches: unknown[] }) => void) | undefined;
    const a = {
      subscribe: () => () => undefined,
      subscribeUpdate: (fn: (update: { patches: unknown[] }) => void) => {
        onUpdateA = fn;
        return () => undefined;
      },
    } as FakeChild;
    const b = {} as FakeChild;
    const state = createArrayState();
    state.children = [a, b, a];
    const indexedState = state as typeof state & {
      childIndices: Map<FakeChild, Set<number>>;
      childIndicesDirty: boolean;
    };
    indexedState.childIndices = new Map();
    indexedState.childIndicesDirty = true;
    const child: FakeChild = {
      subscribe: () => () => undefined,
      subscribeUpdate: () => () => undefined,
    };
    const updates: Array<{ patches: unknown[] }> = [];
    state.updateListeners.add((u) => updates.push(u));
    const subscriptions = createSubscriptions({
      getScopeSnapshot: () => ({}),
      getArraySnapshot: () => [],
    });

    subscriptions.attachChildToArray(indexedState as never, child as never);
    subscriptions.attachChildToArray(indexedState as never, a as never);
    onUpdateA?.({
      patches: [{ op: 'set', path: [], prev: 1, next: 2 }],
    });

    expect(indexedState.childIndicesDirty).toBe(false);
    expect(indexedState.childIndices.get(a)).toEqual(new Set([0, 2]));
    expect(updates).toHaveLength(1);
    const paths = updates[0].patches.map((p) => (p as { path: unknown }).path);
    expect(paths).toContainEqual([0]);
    expect(paths).toContainEqual([2]);
  });

  it('ignores detach when array child entries are missing', () => {
    const state = createArrayState();
    const subscriptions = createSubscriptions({
      getScopeSnapshot: () => ({}),
      getArraySnapshot: () => [],
    });

    expect(() =>
      subscriptions.detachChildFromArray(state as never, {} as FakeChild),
    ).not.toThrow();
  });
});
