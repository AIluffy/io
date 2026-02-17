import { describe, expect, it } from 'vitest';
import { createUpdate, mergeUpdates } from '../utils/patches/update-merge.js';

describe('patches: update-merge', () => {
  it('generates process-local monotonic update ids by default', () => {
    const first = createUpdate(0, 1, []);
    const second = createUpdate(1, 2, []);
    const firstCounter = Number.parseInt(
      first.id.slice(first.id.lastIndexOf('-') + 1),
      36,
    );
    const secondCounter = Number.parseInt(
      second.id.slice(second.id.lastIndexOf('-') + 1),
      36,
    );
    expect(secondCounter).toBe(firstCounter + 1);
  });

  it('merges set patches with symbol paths using path-key fallback', () => {
    const key = Symbol('s');
    const firstPath: PropertyKey[] = [key];
    const secondPath: PropertyKey[] = [key];

    const merged = mergeUpdates([
      {
        id: 'a',
        baseRevision: 0,
        revision: 1,
        patches: [{ op: 'set', path: firstPath, prev: 1, next: 2 }],
      },
      {
        id: 'b',
        baseRevision: 1,
        revision: 2,
        patches: [{ op: 'set', path: secondPath, prev: 2, next: 3 }],
      },
    ]);

    expect(merged.patches).toEqual([
      { op: 'set', path: firstPath, prev: 1, next: 3 },
    ]);
  });

  it('returns empty merged update for falsy input', () => {
    const merged = mergeUpdates(undefined as unknown as never);
    expect(merged.patches).toEqual([]);
    expect(merged.baseRevision).toBe(0);
    expect(merged.revision).toBe(0);
  });
});
