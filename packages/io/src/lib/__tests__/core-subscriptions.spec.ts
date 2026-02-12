import { describe, expect, it, vi } from 'vitest';
import { createDirtyIndexState } from '../core/dirty-indices.js';
import { createSubscriptions } from '../core/subscriptions.js';

type FakeChild = {
  subscribe?: (fn: (value: unknown) => void) => () => void;
  subscribeUpdate?: (
    fn: (update: { patches: unknown[] }) => void,
  ) => () => void;
};

function createArrayState() {
  return {
    children: [{} as FakeChild, {} as FakeChild],
    revision: 0,
    isCommitting: false,
    valueEpoch: 0,
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
    revision: 0,
    isCommitting: false,
    valueEpoch: 0,
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
});
