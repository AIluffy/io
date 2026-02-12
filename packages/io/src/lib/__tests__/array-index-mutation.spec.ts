import { describe, expect, it, vi } from 'vitest';
import { createDirtyIndexState } from '../core/dirty-indices.js';
import { createArrayIndexMutation } from '../core/node-factory/array/index-mutation.js';
import { io } from '../core/io.js';
import { getLinkTarget, link } from '../utils/link.js';

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
      getNodeValue: (node: UnitNode) => node.value,
      detachChildFromArray: vi.fn(),
      unregisterSubtree: vi.fn(),
      attachChildToArray: vi.fn(),
      createUpdate: (base: number, revision: number, patches: unknown[]) => ({
        id: 'u',
        baseRevision: base,
        revision,
        patches,
      }),
      cloneValue: (value: unknown) => value,
      emitArrayUpdate,
      emitArrayValue,
      isUnit: (node: UnitNode) => node.kind === 'unit',
      getInternal: (node: UnitNode) => ({
        kind: 'unit' as const,
        getValue: () => node.value,
        setValue: (next: unknown) => node.setValue(next),
      }),
      emitError: vi.fn(),
    };

    const { setIndex } = createArrayIndexMutation({
      deps: deps as never,
      ctx: {} as never,
      path: ['items'],
      state: state as never,
      createTreeNode: (_ctx, _path, initial) => {
        const target = getLinkTarget(initial as never) as { get: () => unknown };
        return createUnit(target.get()) as unknown as never;
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
      getNodeValue: (node: UnitNode) => node.value,
      detachChildFromArray: vi.fn(),
      unregisterSubtree: vi.fn(),
      attachChildToArray: vi.fn(),
      createUpdate: vi.fn(),
      cloneValue: (value: unknown) => value,
      emitArrayUpdate: vi.fn(),
      emitArrayValue: vi.fn(),
      isUnit: () => true,
      getInternal: () => ({ kind: 'scope' as const }),
      emitError,
    };

    const { setIndex } = createArrayIndexMutation({
      deps: deps as never,
      ctx: {} as never,
      path: ['items'],
      state: state as never,
      createTreeNode: (_ctx, _path, initial) =>
        createUnit(initial) as unknown as never,
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
});
