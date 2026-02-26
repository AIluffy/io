import { describe, expect, it, vi } from 'vitest';
import { createDirtyIndexState, markDirtyIndex } from '../core/mutation/dirty-indices.js';
import { createArrayExecutor, createScopeExecutor } from '../core/commands/executor.js';
import { initialEpoch, initialRevision } from '../utils/types/branded.js';

function createDeps() {
  return {
    createUpdate: vi.fn((baseRevision, revision, patches) => ({
      id: `u-${revision}`,
      baseRevision,
      revision,
      patches,
    })),
    emitArrayValue: vi.fn(),
    emitArrayUpdate: vi.fn(),
    emitScopeValue: vi.fn(),
    emitScopeUpdate: vi.fn(),
    emitError: vi.fn(),
  };
}

describe('core/commands: executor', () => {
  it('array executor can skip structural/update/value emission', () => {
    const deps = createDeps();
    const state = {
      children: [{}, {}],
      revision: initialRevision(),
      valueEpoch: initialEpoch(),
      dirtyStructure: false,
      dirtyIndices: createDirtyIndexState(2),
    };
    markDirtyIndex(state.dirtyIndices, 1, 2);

    const { runCommand } = createArrayExecutor(
      deps as never,
      state as never,
      () => ['list'],
      () => ({ kind: 'array-node' } as never),
    );
    const update = runCommand(
      {
        op: 'set',
        execute: () => [{ op: 'set', path: [], prev: 0, next: 1 }],
      },
      { structural: false, emitUpdate: false, emitValue: false },
    );

    expect(update?.patches).toHaveLength(1);
    expect(state.dirtyStructure).toBe(false);
    expect(state.dirtyIndices.items).toEqual([1]);
    expect(deps.emitArrayUpdate).not.toHaveBeenCalled();
    expect(deps.emitArrayValue).not.toHaveBeenCalled();
  });

  it('array executor marks structure and resets dirty indices by default', () => {
    const deps = createDeps();
    const state = {
      children: [{}, {}],
      revision: initialRevision(),
      valueEpoch: initialEpoch(),
      dirtyStructure: false,
      dirtyIndices: createDirtyIndexState(2),
    };
    markDirtyIndex(state.dirtyIndices, 0, 2);

    const { runCommand } = createArrayExecutor(
      deps as never,
      state as never,
      () => ['list'],
      () => ({ kind: 'array-node' } as never),
    );
    runCommand({
      op: 'splice',
      execute: () => [],
    });

    expect(state.dirtyStructure).toBe(true);
    expect(state.dirtyIndices.items).toEqual([]);
    expect(deps.emitArrayUpdate).toHaveBeenCalledTimes(1);
    expect(deps.emitArrayValue).toHaveBeenCalledTimes(1);
  });

  it('scope executor toggles committing state even on early return', () => {
    const deps = createDeps();
    const state = {
      revision: initialRevision(),
      valueEpoch: initialEpoch(),
      dirtyStructure: false,
      isCommitting: false,
    };
    const { runCommand } = createScopeExecutor(
      deps as never,
      state as never,
      () => ['root'],
      () => ({ kind: 'scope-node' } as never),
    );

    const result = runCommand({
      op: 'set',
      validate: () => false,
      execute: () => [],
    });

    expect(result).toBeUndefined();
    expect(state.isCommitting).toBe(false);
  });

  it('scope executor emits errors and resets committing state on throw', () => {
    const deps = createDeps();
    const state = {
      revision: initialRevision(),
      valueEpoch: initialEpoch(),
      dirtyStructure: false,
      isCommitting: false,
    };
    const node = { kind: 'scope-node' };
    let path: PropertyKey[] = ['root', 'a'];
    const { runCommand } = createScopeExecutor(
      deps as never,
      state as never,
      () => path,
      () => node as never,
    );
    path = ['root', 'b'];

    expect(() =>
      runCommand({
        op: 'set',
        execute: () => {
          throw new Error('boom');
        },
      }),
    ).toThrow('boom');

    expect(state.isCommitting).toBe(false);
    expect(deps.emitError).toHaveBeenCalledWith(
      node,
      expect.any(Error),
      ['root', 'b'],
      'set',
    );
  });
});
