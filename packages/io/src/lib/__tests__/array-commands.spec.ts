import { describe, expect, it, vi } from 'vitest';
import { createDirtyIndexState } from '../core/mutation/dirty-indices.js';
import { SetCommand, SortCommand } from '../core/commands/array-commands.js';

type FakeNode = { value: unknown };

function createState(values: unknown[]) {
  return {
    children: values.map((value) => ({ value })) as FakeNode[],
    dirtyStructure: false,
    childIndicesDirty: false,
    dirtyIndices: createDirtyIndexState(values.length),
  };
}

describe('core/commands: array-commands', () => {
  it('SortCommand sorts numbers and then strings via default comparator', () => {
    const rebuildMapping = vi.fn();
    const state = createState([3, 1, 2]);
    const command = new SortCommand(
      {
        getNodeValue: (node) => (node as unknown as FakeNode).value,
      },
      {
        rebuildMapping,
        validateSortPermutation: vi.fn(),
      },
    );

    const patches = command.execute(state as never);

    expect(patches).toEqual([{ op: 'sort', path: [], order: [1, 2, 0] }]);
    expect(state.children.map((node) => node.value)).toEqual([1, 2, 3]);
    expect(state.dirtyStructure).toBe(true);
    expect(state.childIndicesDirty).toBe(true);
    expect(rebuildMapping).toHaveBeenCalledTimes(1);
  });

  it('SortCommand handles equal stringified values', () => {
    const state = createState([1, '1', 2]);
    const command = new SortCommand(
      {
        getNodeValue: (node) => (node as unknown as FakeNode).value,
      },
      {
        rebuildMapping: vi.fn(),
        validateSortPermutation: vi.fn(),
      },
    );

    const patches = command.execute(state as never);
    expect(patches[0].op).toBe('sort');
    expect(state.children.map((node) => node.value)).toEqual([1, '1', 2]);
  });

  it('SetCommand rewrites array and emits set patch payloads', () => {
    const performSplice = vi.fn(() => ({
      normalizedStart: 0,
      dc: 2,
      removedValues: [1, 2],
    }));
    const rebuildMapping = vi.fn();
    const state = createState([1, 2]);
    const command = new SetCommand(
      {
        snapshot: () => [1, 2],
      },
      {
        cloneValue: (value) => value,
        resolvePatchValue: (value) =>
          typeof value === 'object' && value !== null
            ? (value as { value: unknown }).value
            : value,
      },
      {
        performSplice,
        rebuildMapping,
      },
      [{ value: 3 }, 4],
    );

    const patches = command.execute(state as never);

    expect(performSplice).toHaveBeenCalledWith(0, 2, [{ value: 3 }, 4]);
    expect(rebuildMapping).toHaveBeenCalledTimes(1);
    expect(state.dirtyStructure).toBe(true);
    expect(patches).toEqual([
      {
        op: 'set',
        path: [],
        prev: [1, 2],
        next: [3, 4],
      },
    ]);
  });
});
