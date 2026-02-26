import { describe, expect, it, vi } from 'vitest';

import {
  createAbortError,
  defaultRetryDelay,
  hashKey,
  keyMatches,
  shouldRetry,
  sleep,
} from '../utils.js';

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
