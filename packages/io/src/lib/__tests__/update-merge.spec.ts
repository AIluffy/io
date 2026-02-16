import { describe, expect, it } from 'vitest';
import { createUpdate, mergeUpdates } from '../utils/patches/update-merge.js';

describe('patches: update-merge', () => {
  it('uses fallback id generation when crypto.randomUUID is unavailable', () => {
    const originalCrypto = (globalThis as Record<string, unknown>).crypto;
    const originalNow = Date.now;
    const originalRandom = Math.random;
    try {
      Object.defineProperty(globalThis, 'crypto', {
        value: {},
        configurable: true,
      });
      Date.now = () => 255;
      Math.random = () => 0.5;

      const update = createUpdate(0, 1, []);
      expect(update.id).toMatch(/^ff-/);
    } finally {
      Date.now = originalNow;
      Math.random = originalRandom;
      Object.defineProperty(globalThis, 'crypto', {
        value: originalCrypto,
        configurable: true,
      });
    }
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
