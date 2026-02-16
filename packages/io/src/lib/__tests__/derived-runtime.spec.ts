import { describe, expect, it } from 'vitest';
import { derived } from '../core/api/derived.js';
import { io } from '../core/api/io.js';
import { registerInternal } from '../utils/internal/internal-access.js';

describe('derived: runtime branches', () => {
  it('throws when deps overload has no compute function', () => {
    expect(() => derived([], undefined as never)).toThrow(
      'derived: compute function is required for deps',
    );
  });

  it('throws when node overload has no selector function', () => {
    expect(() => derived(io(1), undefined as never)).toThrow(
      'derived: selector function is required for node',
    );
  });

  it('throws when deps implement subscribe but not get', () => {
    const dep = {
      subscribe: () => () => undefined,
    };

    expect(() => derived([dep] as never, (value) => value)).toThrow(
      'derived: deps[0] must implement get()',
    );
  });

  it('accepts deps whose subscribe does not return an unsubscribe', () => {
    let value = 1;
    const dep = {
      get: () => value,
      subscribe: () => undefined as unknown as () => void,
    };

    const d = derived([dep], (n) => n + 1);
    const unsub = d.subscribe(() => undefined);
    value = 2;
    unsub();
    expect(d.get()).toBe(3);
  });

  it('treats array deps as node arguments and supports snapshot', () => {
    const arr = io([1, 2, 3]);
    const d = derived([arr], (list) => ({ size: list.get().length }));

    const snap = d.snapshot();
    expect(snap).toEqual({ size: 3 });
    expect(Object.isFrozen(snap)).toBe(true);
  });

  it('passes through array-like deps detected by internal kind', () => {
    const dep = {
      marker: true,
      get: () => ({ marker: true }),
      subscribe: () => () => undefined,
    };
    registerInternal(dep, { kind: 'array' } as never);

    const d = derived([dep], (arg) => arg.marker);
    expect(d.get()).toBe(true);
  });

  it('does not emit on first activation and emits only after changes', async () => {
    const count = io(1);
    const d = derived(() => count.get() * 2);
    const seen: number[] = [];
    const unsub = d.subscribe((value) => seen.push(value));

    expect(seen).toEqual([]);
    count.set(2);
    await Promise.resolve();
    expect(seen).toEqual([4]);

    unsub();
  });

  it('does not emit when dependency updates keep computed value unchanged', async () => {
    const count = io(1);
    const d = derived([count], (value) => value % 2);
    const seen: number[] = [];
    const unsub = d.subscribe((value) => seen.push(value));

    count.set(3);
    await Promise.resolve();

    expect(seen).toEqual([]);
    unsub();
  });
});
