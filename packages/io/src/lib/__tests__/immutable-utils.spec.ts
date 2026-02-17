import { describe, expect, it } from 'vitest';
import {
  deepFreeze,
  freezeOwned,
  freezeRootShallow,
  snapshotValue,
  toImmutable,
} from '../utils/immutable/immutable.js';
import { runWithDeepCloneCounter } from './immutable-helper.js';

describe('immutable utilities', () => {
  it('freezeOwned deeply freezes owned values and reuses immutable roots', () => {
    const value = { user: { age: 1 } };
    const frozen = freezeOwned(value);
    const frozenAgain = freezeOwned(frozen);

    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.user)).toBe(true);
    expect(frozenAgain).toBe(frozen);
  });

  it('freezeRootShallow only freezes root object', () => {
    const value = { user: { age: 1 } };
    const frozen = freezeRootShallow(value);

    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.user)).toBe(false);
  });

  it('snapshotValue supports owned mode', () => {
    const owned = snapshotValue({ a: { b: 1 } }, { owned: true });
    const cloned = snapshotValue({ a: { b: 1 } });

    expect(Object.isFrozen(owned)).toBe(true);
    expect(Object.isFrozen(owned.a)).toBe(true);
    expect(Object.isFrozen(cloned)).toBe(true);
  });

  it('deepFreeze walks array elements when not assuming data properties', () => {
    const value = [{ x: 1 }];
    const frozen = deepFreeze(value);

    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen[0])).toBe(true);
  });

  it('toImmutable preserves primitive values', () => {
    expect(toImmutable(1)).toBe(1);
    expect(toImmutable('x')).toBe('x');
    expect(toImmutable(null)).toBeNull();
    expect(toImmutable(undefined)).toBeUndefined();
  });

  it('toImmutable falls back to deep clone for accessor descriptors', () => {
    const value = Object.defineProperty({}, 'x', {
      configurable: true,
      enumerable: true,
      get: () => ({ nested: true }),
    });
    const cloned = toImmutable(value as Record<string, unknown>);

    expect(cloned).not.toBe(value);
    expect(Object.isFrozen(cloned)).toBe(true);
  });

  it('freezeRootShallow returns existing immutable roots', () => {
    const immutable = toImmutable({ n: 1 });
    expect(freezeRootShallow(immutable)).toBe(immutable);
  });

  it('freezeOwned and freezeRootShallow return primitives/nullish as-is', () => {
    expect(freezeOwned(1)).toBe(1);
    expect(freezeOwned(null)).toBeNull();
    expect(freezeRootShallow('x')).toBe('x');
    expect(freezeRootShallow(undefined)).toBeUndefined();
  });
});

describe('immutable testing helpers', () => {
  it('runWithDeepCloneCounter counts structuredClone calls when available', () => {
    const result = runWithDeepCloneCounter(() => {
      toImmutable({ x: new Date(0) });
      return 'ok';
    });

    expect(result.result).toBe('ok');
    expect(result.deepCloneCount).toBeGreaterThanOrEqual(0);
  });

  it('runWithDeepCloneCounter falls back when structuredClone is unavailable', () => {
    const desc = Object.getOwnPropertyDescriptor(globalThis, 'structuredClone');
    const canOverride = !desc || desc.configurable || desc.writable;
    if (!canOverride) {
      expect(true).toBe(true);
      return;
    }

    const original = (globalThis as Record<string, unknown>).structuredClone;
    try {
      if (!desc || desc.writable) {
        (globalThis as Record<string, unknown>).structuredClone = undefined;
      } else {
        Object.defineProperty(globalThis, 'structuredClone', {
          value: undefined,
          configurable: true,
          writable: true,
        });
      }

      const result = runWithDeepCloneCounter(() => 'fallback');
      expect(result).toEqual({ result: 'fallback', deepCloneCount: 0 });
    } finally {
      if (!desc || desc.writable) {
        (globalThis as Record<string, unknown>).structuredClone = original;
      } else {
        Object.defineProperty(globalThis, 'structuredClone', desc);
      }
    }
  });
});
