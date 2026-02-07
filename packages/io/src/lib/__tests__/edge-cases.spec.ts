import { describe, expect, it } from 'vitest';
import { applyUpdate } from '../utils/updates.js';
import { deepFreeze } from '../utils/snapshot.js';
import { relocate } from '../extensions/relocate.js';
import { io } from '../core/io.js';

function nextTick(): Promise<void> {
  return new Promise((resolve) => queueMicrotask(resolve));
}

describe('edge cases: relocate', () => {
  it('throws on invalid array path segments', () => {
    const store = io({ list: [1, 2, 3] });
    expect(() => relocate<number>(store, ['list', 'oops'])).toThrow(
      /invalid array index/,
    );
  });

  it('throws when traversing past a leaf', () => {
    const store = io({ a: 1 });
    expect(() => relocate<number>(store, ['a', 'b'])).toThrow(/leaf/);
  });

  it('returns a read-only view for scope/array nodes', () => {
    const store = io({ list: [{ n: 1 }] });
    const view = relocate<unknown[]>(store, ['list']);
    expect(view.get()).toEqual([{ n: 1 }]);
    expect(view.set).toBeUndefined();
  });
});

describe('edge cases: applyUpdate', () => {
  it('supports symbol keys on shallow scopes', () => {
    const key = Symbol('k');
    const store = io({ [key]: 1 } as Record<PropertyKey, unknown>, {
      shallow: true,
    }) as Record<PropertyKey, unknown>;

    applyUpdate(store, {
      id: 'u1',
      baseRevision: 0,
      revision: 1,
      patches: [
        {
          op: 'set',
          path: [key],
          prev: 1,
          next: 2,
        },
      ],
    });

    expect((store[key] as { get: () => number }).get()).toBe(2);
  });

  it('rejects non-node targets', () => {
    expect(() =>
      applyUpdate(
        { not: 'io' },
        {
          id: 'u2',
          baseRevision: 0,
          revision: 1,
          patches: [],
        },
      ),
    ).toThrow(/not an IO node/);
  });
});

describe('edge cases: deepFreeze', () => {
  it('does not invoke accessors while freezing', () => {
    let getterCalls = 0;
    const obj = Object.defineProperty({}, 'value', {
      enumerable: true,
      configurable: true,
      get() {
        getterCalls += 1;
        return { n: 1 };
      },
    });

    deepFreeze(obj);
    expect(getterCalls).toBe(0);
  });

  it('handles repeated freezes on circular graphs', async () => {
    const obj: any = { n: 1 };
    obj.self = obj;
    deepFreeze(obj);
    await nextTick();
    deepFreeze(obj);
    expect(Object.isFrozen(obj)).toBe(true);
  });
});
