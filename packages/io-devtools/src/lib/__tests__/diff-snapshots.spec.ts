import { describe, expect, it } from 'vitest';
import { diffSnapshots } from '../diff-snapshots.js';

describe('@iostore/devtools: diffSnapshots', () => {
  it('respects maxDepth by collapsing deeper diffs', () => {
    const prev = { a: { b: { c: 1 } } };
    const next = { a: { b: { c: 2 } } };
    const diffs = diffSnapshots(prev, next, { maxDepth: 1 });
    expect(diffs).toHaveLength(1);
    expect(diffs[0].path).toEqual(['a']);
  });

  it('caps array traversal and records coarse diff', () => {
    const prev = [1, 2, 3, 4];
    const next = [1, 9, 3, 5];
    const diffs = diffSnapshots(prev, next, { maxArrayLength: 2 });
    const hasRootDiff = diffs.some((d) => d.path.length === 0);
    expect(hasRootDiff).toBe(true);
  });

  it('stops after maxChanges', () => {
    const prev = { a: 1, b: 2, c: 3 };
    const next = { a: 4, b: 5, c: 6 };
    const diffs = diffSnapshots(prev, next, { maxChanges: 1 });
    expect(diffs).toHaveLength(1);
  });
});
