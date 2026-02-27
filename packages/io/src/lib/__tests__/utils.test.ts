import { describe, expect, it, vi } from 'vitest';

import {
  createAbortError,
  defaultRetryDelay,
  hashKey,
  keyMatches,
  shouldRetry,
  sleep,
} from '../query/utils.js';

describe('@iostore/query utils', () => {
  it('hashKey is stable for object key order', () => {
    const left = hashKey(['todos', { page: 1, size: 20 }]);
    const right = hashKey(['todos', { size: 20, page: 1 }]);

    expect(left).toBe(right);
  });

  it('hashKey rejects function and symbol values', () => {
    expect(() => hashKey(['todos', () => 1])).toThrow(
      /cannot contain values of type "function"/,
    );

    expect(() => hashKey(['todos', Symbol.for('x')])).toThrow(
      /cannot contain values of type "symbol"/,
    );
  });

  it('hashKey rejects symbol-keyed object properties', () => {
    const symbolKey = Symbol.for('x');
    expect(() =>
      hashKey(['todos', { [symbolKey]: 'value' } as Record<symbol, string>]),
    ).toThrow(/cannot contain values of type "symbol"/);
  });

  it('keyMatches supports prefix and exact matching', () => {
    expect(keyMatches(['todos', 1], ['todos'])).toBe(true);
    expect(keyMatches(['todos', 1], ['todos'], true)).toBe(false);
    expect(keyMatches(['todos', 1], ['todos', 1], true)).toBe(true);
  });

  it('keyMatches returns false when filter key is longer than query key', () => {
    expect(keyMatches(['todos'], ['todos', 1])).toBe(false);
  });

  it('hashKey is stable for Date/RegExp/Map/Set/TypedArray/BigInt', () => {
    const date = new Date('2024-01-01T00:00:00.000Z');
    const regexp = /users/gi;
    const left = hashKey([
      'complex',
      {
        date,
        regexp,
        map: new Map<string, number>([
          ['b', 2],
          ['a', 1],
        ]),
        set: new Set<number>([3, 1]),
        bytes: new Uint8Array([1, 2, 3]),
        big: 42n,
      },
    ]);

    const right = hashKey([
      'complex',
      {
        date: new Date('2024-01-01T00:00:00.000Z'),
        regexp: /users/gi,
        map: new Map<string, number>([
          ['a', 1],
          ['b', 2],
        ]),
        set: new Set<number>([1, 3]),
        bytes: new Uint8Array([1, 2, 3]),
        big: 42n,
      },
    ]);

    expect(left).toBe(right);
  });

  it('shouldRetry respects max retries and ignores AbortError', () => {
    expect(shouldRetry(1, 2, new Error('fail'))).toBe(true);
    expect(shouldRetry(3, 2, new Error('fail'))).toBe(false);
    expect(shouldRetry(1, 3, createAbortError())).toBe(false);
  });

  it('defaultRetryDelay is exponential and capped', () => {
    expect(defaultRetryDelay(0)).toBe(1_000);
    expect(defaultRetryDelay(1)).toBe(2_000);
    expect(defaultRetryDelay(10)).toBe(30_000);
  });

  it('sleep resolves after delay and supports abort', async () => {
    vi.useFakeTimers();

    const resolved = sleep(20);
    await vi.advanceTimersByTimeAsync(20);
    await expect(resolved).resolves.toBeUndefined();

    const controller = new AbortController();
    const aborted = sleep(20, controller.signal);
    controller.abort();
    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' });

    vi.useRealTimers();
  });
});
