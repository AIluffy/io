import { describe, expect, it } from 'vitest';
import {
  clearDirtyIndices,
  createDirtyIndexState,
  markDirtyIndex,
} from '../core/mutation/dirty-indices.js';

describe('mutation: dirty-indices', () => {
  it('marks indices with default length and ignores duplicates', () => {
    const state = createDirtyIndexState(3);
    markDirtyIndex(state, 1);
    markDirtyIndex(state, 1);

    expect(state.items).toEqual([1]);
  });

  it('ignores out-of-range indices', () => {
    const state = createDirtyIndexState(2);
    markDirtyIndex(state, -1, 2);
    markDirtyIndex(state, 2, 2);

    expect(state.items).toEqual([]);
  });

  it('resets mark buffer when version reaches max threshold', () => {
    const state = createDirtyIndexState(2);
    markDirtyIndex(state, 0, 2);
    state.version = 0x7fffffff;

    clearDirtyIndices(state);

    expect(state.version).toBe(1);
    expect(Array.from(state.marks)).toEqual([0, 0]);
    expect(state.items).toEqual([]);
  });
});
