import { describe, expect, it } from 'vitest';
import { cloneValue, deepFreeze } from '../utils/snapshot.js';

describe('snapshot: deepFreeze', () => {
  it('freezes symbol and non-enumerable branches', () => {
    const sym = Symbol('k');
    const hidden = { inner: { n: 1 } };
    const symValue = { inner: { n: 2 } };
    const obj: Record<PropertyKey, unknown> = {};

    Object.defineProperty(obj, 'hidden', {
      value: hidden,
      enumerable: false,
      configurable: true,
    });
    obj[sym] = symValue;

    const frozen = deepFreeze(obj);

    const hiddenValue = Object.getOwnPropertyDescriptor(frozen, 'hidden')
      ?.value as { inner: { n: number } } | undefined;
    expect(hiddenValue).toBeDefined();
    expect(Object.isFrozen(hiddenValue)).toBe(true);
    expect(Object.isFrozen(hiddenValue?.inner)).toBe(true);

    const symVal = (frozen as Record<PropertyKey, unknown>)[sym] as
      | { inner: { n: number } }
      | undefined;
    expect(symVal).toBeDefined();
    expect(Object.isFrozen(symVal)).toBe(true);
    expect(Object.isFrozen(symVal?.inner)).toBe(true);
  });
});

describe('snapshot: cloneValue', () => {
  it('throws when structuredClone is unavailable', () => {
    const originalDesc = Object.getOwnPropertyDescriptor(
      globalThis,
      'structuredClone',
    );
    const canOverride =
      !originalDesc || originalDesc.configurable || originalDesc.writable;

    if (!canOverride) {
      expect(true).toBe(true);
      return;
    }

    const original = (globalThis as Record<string, unknown>).structuredClone;
    try {
      if (originalDesc?.writable || !originalDesc) {
        (globalThis as Record<string, unknown>).structuredClone = undefined;
      } else {
        Object.defineProperty(globalThis, 'structuredClone', {
          value: undefined,
          configurable: true,
          writable: true,
        });
      }

      expect(() => cloneValue({ a: 1 })).toThrow(/structuredClone/);
    } finally {
      if (!originalDesc || originalDesc.writable) {
        (globalThis as Record<string, unknown>).structuredClone = original;
      } else {
        Object.defineProperty(globalThis, 'structuredClone', originalDesc);
      }
    }
  });
});
