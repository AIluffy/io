import { describe, expect, it, vi } from 'vitest';
import { createDirtyIndexState } from '../core/mutation/dirty-indices.js';
import { createArrayIndexMutation } from '../core/node-factory/array/index-mutation.js';
import { io } from '../core/api/io.js';
import { getLinkTarget, link } from '../utils/internal/link.js';

type UnitNode = {
  kind: 'unit';
  value: unknown;
  setValue: (next: unknown) => void;
};

function createUnit(value: unknown): UnitNode {
  return {
    kind: 'unit',
    value,
    setValue(next: unknown) {
      this.value = next;
    },
  };
}

describe('core/node-factory/array/index-mutation', () => {
  it('replaces linked values and emits array set patch', () => {
    const state = {
      children: [createUnit(1)],
      revision: 0,
      valueEpoch: 0,
      dirtyIndices: createDirtyIndexState(1),
    };
    const emitArrayUpdate = vi.fn();
    const emitArrayValue = vi.fn();

    const deps = {
      snapshots: {
        getNodeValue: (node: UnitNode) => node.value,
      },
      lifecycle: {
        detachChildFromArray: vi.fn(),
        attachChildToArray: vi.fn(),
      },
      registry: {
        unregisterSubtree: vi.fn(),
      },
      utils: {
        createUpdate: (base: number, revision: number, patches: unknown[]) => ({
          id: 'u',
          baseRevision: base,
          revision,
          patches,
        }),
        cloneValue: (value: unknown) => value,
        isUnit: (node: UnitNode) => node.kind === 'unit',
        emitError: vi.fn(),
      },
      subscriptions: {
        emitArrayUpdate,
        emitArrayValue,
      },
      internals: {
        getInternal: (node: UnitNode) => ({
          kind: 'unit' as const,
          getValue: () => node.value,
          setValue: (next: unknown) => node.setValue(next),
        }),
      },
    };

    const { setIndex } = createArrayIndexMutation({
      deps: deps as never,
      ctx: {} as never,
      path: ['items'],
      state: state as never,
      createTreeNode: (_ctx, _path, initial) => {
        const target = getLinkTarget(initial as never) as {
          get: () => unknown;
        };
        return createUnit(target.get()) as never;
      },
      resolvePatchValue: (value) => value,
      snapshot: () => state.children.map((child) => child.value),
      rebuildMapping: () => {
        return undefined;
      },
      getNode: () => state as never,
    });

    setIndex(0, link(io(7)));

    expect(state.children[0].value).toBe(7);
    expect(state.revision).toBe(1);
    expect(state.valueEpoch).toBe(1);
    expect(emitArrayUpdate).toHaveBeenCalledTimes(1);
    expect(emitArrayUpdate.mock.calls[0][1].patches[0]).toEqual({
      op: 'set',
      path: [0],
      prev: 1,
      next: 7,
    });
    expect(emitArrayValue).toHaveBeenCalledTimes(1);
  });

  it('throws and reports error when unit internal is invalid', () => {
    const state = {
      children: [createUnit(1)],
      revision: 0,
      valueEpoch: 0,
      dirtyIndices: createDirtyIndexState(1),
    };
    const emitError = vi.fn();

    const deps = {
      snapshots: {
        getNodeValue: (node: UnitNode) => node.value,
      },
      lifecycle: {
        detachChildFromArray: vi.fn(),
        attachChildToArray: vi.fn(),
      },
      registry: {
        unregisterSubtree: vi.fn(),
      },
      utils: {
        createUpdate: vi.fn(),
        cloneValue: (value: unknown) => value,
        isUnit: () => true,
        emitError,
      },
      subscriptions: {
        emitArrayUpdate: vi.fn(),
        emitArrayValue: vi.fn(),
      },
      internals: {
        getInternal: () => ({ kind: 'scope' as const }),
      },
    };

    const { setIndex } = createArrayIndexMutation({
      deps: deps as never,
      ctx: {} as never,
      path: ['items'],
      state: state as never,
      createTreeNode: (_ctx, _path, initial) =>
        createUnit(initial) as never,
      resolvePatchValue: (value) => value,
      snapshot: () => [],
      rebuildMapping: () => {
        return undefined;
      },
      getNode: () => state as never,
    });

    expect(() => setIndex(0, 2)).toThrow(/invalid unit internal/);
    expect(emitError).toHaveBeenCalledTimes(1);
  });

  it('throws out-of-range via top-level emitError fallback', () => {
    const state = {
      children: [createUnit(1)],
      revision: 0,
      valueEpoch: 0,
      dirtyIndices: createDirtyIndexState(1),
    };
    const emitError = vi.fn();
    const deps = {
      emitError,
      snapshots: {
        getNodeValue: (node: UnitNode) => node.value,
      },
      lifecycle: {
        detachChildFromArray: vi.fn(),
        attachChildToArray: vi.fn(),
      },
      registry: {
        unregisterSubtree: vi.fn(),
      },
      subscriptions: {
        emitArrayUpdate: vi.fn(),
        emitArrayValue: vi.fn(),
      },
      internals: {
        getInternal: vi.fn(),
      },
    };
    const { setIndex } = createArrayIndexMutation({
      deps: deps as never,
      ctx: {} as never,
      path: ['items'],
      state: state as never,
      createTreeNode: (_ctx, _path, initial) =>
        createUnit(initial) as never,
      resolvePatchValue: (value) => value,
      snapshot: () => [],
      rebuildMapping: () => undefined,
      getNode: () => state as never,
    });

    expect(() => setIndex(3, 2)).toThrow(/index out of range/);
    expect(emitError).toHaveBeenCalledWith(
      state,
      expect.any(Error),
      ['items', 3],
      'set',
    );
  });

  it('replaces non-unit nodes and emits set patch using next value', () => {
    const existing = { kind: 'scope' };
    const state = {
      children: [existing],
      revision: 0,
      valueEpoch: 0,
      dirtyIndices: createDirtyIndexState(1),
    };
    const emitArrayUpdate = vi.fn();
    const emitArrayValue = vi.fn();
    const deps = {
      snapshots: {
        getNodeValue: () => ({ prev: true }),
      },
      lifecycle: {
        detachChildFromArray: vi.fn(),
        attachChildToArray: vi.fn(),
      },
      registry: {
        unregisterSubtree: vi.fn(),
      },
      subscriptions: {
        emitArrayUpdate,
        emitArrayValue,
      },
      internals: {
        getInternal: () => undefined,
      },
      utils: {
        emitError: vi.fn(),
      },
    };
    const { setIndex } = createArrayIndexMutation({
      deps: deps as never,
      ctx: {} as never,
      path: ['items'],
      state: state as never,
      createTreeNode: (_ctx, _path, initial) =>
        createUnit(initial) as never,
      resolvePatchValue: (value) => value,
      snapshot: () => [],
      rebuildMapping: () => undefined,
      getNode: () => state as never,
    });

    setIndex(0, { next: true });

    expect(state.children[0]).toMatchObject({ value: { next: true } });
    expect(emitArrayValue).toHaveBeenCalledTimes(1);
    expect(emitArrayUpdate.mock.calls[0][1].patches[0]).toEqual({
      op: 'set',
      path: [0],
      prev: { prev: true },
      next: { next: true },
    });
  });

  it('skips update emission when emitUpdate is disabled or listeners are empty', () => {
    const state = {
      children: [createUnit(1)],
      revision: 0,
      valueEpoch: 0,
      dirtyIndices: createDirtyIndexState(1),
      updateListeners: new Set<() => void>(),
    };
    const emitArrayUpdate = vi.fn();
    const emitArrayValue = vi.fn();
    const deps = {
      snapshots: {
        getNodeValue: (node: UnitNode) => node.value,
      },
      lifecycle: {
        detachChildFromArray: vi.fn(),
        attachChildToArray: vi.fn(),
      },
      registry: {
        unregisterSubtree: vi.fn(),
      },
      subscriptions: {
        emitArrayUpdate,
        emitArrayValue,
      },
      internals: {
        getInternal: (node: UnitNode) => ({
          kind: 'unit' as const,
          getValue: () => node.value,
          setValue: (next: unknown) => node.setValue(next),
        }),
      },
      utils: {
        emitError: vi.fn(),
      },
    };
    const { setIndex } = createArrayIndexMutation({
      deps: deps as never,
      ctx: {} as never,
      path: ['items'],
      state: state as never,
      createTreeNode: (_ctx, _path, initial) => createUnit(initial) as never,
      resolvePatchValue: (value) => value,
      snapshot: () => [],
      rebuildMapping: () => undefined,
      getNode: () => state as never,
    });

    setIndex(0, 2, { emitUpdate: false });
    setIndex(0, 3);

    expect(emitArrayUpdate).not.toHaveBeenCalled();
    expect(emitArrayValue).toHaveBeenCalledTimes(2);
  });

  it('returns early when unit setValue keeps the same value', () => {
    const unit = createUnit(1);
    const state = {
      children: [unit],
      revision: 0,
      valueEpoch: 0,
      dirtyIndices: createDirtyIndexState(1),
    };
    const emitArrayUpdate = vi.fn();
    const emitArrayValue = vi.fn();
    const deps = {
      snapshots: {
        getNodeValue: (node: UnitNode) => node.value,
      },
      lifecycle: {
        detachChildFromArray: vi.fn(),
        attachChildToArray: vi.fn(),
      },
      registry: {
        unregisterSubtree: vi.fn(),
      },
      subscriptions: {
        emitArrayUpdate,
        emitArrayValue,
      },
      internals: {
        getInternal: () => ({
          kind: 'unit' as const,
          getValue: () => 1,
          setValue: vi.fn(),
        }),
      },
      utils: {
        emitError: vi.fn(),
      },
    };
    const { setIndex } = createArrayIndexMutation({
      deps: deps as never,
      ctx: {} as never,
      path: ['items'],
      state: state as never,
      createTreeNode: (_ctx, _path, initial) => createUnit(initial) as never,
      resolvePatchValue: (value) => value,
      snapshot: () => [],
      rebuildMapping: () => undefined,
      getNode: () => state as never,
    });

    setIndex(0, 99);

    expect(state.revision).toBe(0);
    expect(state.valueEpoch).toBe(0);
    expect(emitArrayUpdate).not.toHaveBeenCalled();
    expect(emitArrayValue).not.toHaveBeenCalled();
  });

  it('handles non-object existing child and replaces without update emission', () => {
    const state = {
      children: [1],
      revision: 0,
      valueEpoch: 0,
      dirtyIndices: createDirtyIndexState(1),
      updateListeners: new Set<() => void>(),
    };
    const emitArrayUpdate = vi.fn();
    const emitArrayValue = vi.fn();
    const deps = {
      snapshots: {
        getNodeValue: (node: unknown) => node,
      },
      lifecycle: {
        detachChildFromArray: vi.fn(),
        attachChildToArray: vi.fn(),
      },
      registry: {
        unregisterSubtree: vi.fn(),
      },
      subscriptions: {
        emitArrayUpdate,
        emitArrayValue,
      },
      internals: {
        getInternal: () => undefined,
      },
      utils: {
        emitError: vi.fn(),
      },
    };
    const { setIndex } = createArrayIndexMutation({
      deps: deps as never,
      ctx: {} as never,
      path: ['items'],
      state: state as never,
      createTreeNode: (_ctx, _path, initial) => createUnit(initial) as never,
      resolvePatchValue: (value) => value,
      snapshot: () => [],
      rebuildMapping: () => undefined,
      getNode: () => state as never,
    });

    setIndex(0, 2, { emitValue: false });

    expect(emitArrayUpdate).not.toHaveBeenCalled();
    expect(emitArrayValue).not.toHaveBeenCalled();
  });

  it('replaces link without update patch when updates are disabled by listeners', () => {
    const state = {
      children: [createUnit(1)],
      revision: 0,
      valueEpoch: 0,
      dirtyIndices: createDirtyIndexState(1),
      updateListeners: new Set<() => void>(),
    };
    const emitArrayUpdate = vi.fn();
    const emitArrayValue = vi.fn();
    const deps = {
      snapshots: {
        getNodeValue: (node: UnitNode) => node.value,
      },
      lifecycle: {
        detachChildFromArray: vi.fn(),
        attachChildToArray: vi.fn(),
      },
      registry: {
        unregisterSubtree: vi.fn(),
      },
      subscriptions: {
        emitArrayUpdate,
        emitArrayValue,
      },
      internals: {
        getInternal: (node: UnitNode) => ({
          kind: 'unit' as const,
          getValue: () => node.value,
          setValue: (next: unknown) => node.setValue(next),
        }),
      },
      utils: {
        emitError: vi.fn(),
      },
    };
    const { setIndex } = createArrayIndexMutation({
      deps: deps as never,
      ctx: {} as never,
      path: ['items'],
      state: state as never,
      createTreeNode: (_ctx, _path, initial) => {
        const target = getLinkTarget(initial as never) as { get: () => unknown };
        return createUnit(target.get()) as never;
      },
      resolvePatchValue: (value) => value,
      snapshot: () => [],
      rebuildMapping: () => undefined,
      getNode: () => state as never,
    });

    setIndex(0, link(io(7)));

    expect(emitArrayUpdate).not.toHaveBeenCalled();
    expect(emitArrayValue).toHaveBeenCalledTimes(1);
  });
});
