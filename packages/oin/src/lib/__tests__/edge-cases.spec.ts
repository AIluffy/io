import { describe, expect, it } from 'vitest';
import { applyUpdate } from '../utils/updates.js';
import { deepFreeze } from '../utils/snapshot.js';
import { lens } from '../extensions/lens.js';
import { oin } from '../core/oin.js';

function nextTick(): Promise<void> {
  return new Promise((resolve) => queueMicrotask(resolve));
}

describe('edge cases: lens', () => {
  it('throws on invalid array path segments', () => {
    const store = oin({ list: [1, 2, 3] });
    expect(() => lens<number>(store, ['list', 'oops'])).toThrow(
      /invalid array index/,
    );
  });

  it('throws when traversing past a leaf', () => {
    const store = oin({ a: 1 });
    expect(() => lens<number>(store, ['a', 'b'])).toThrow(/leaf/);
  });

  it('returns a read-only view for scope/array nodes', () => {
    const store = oin({ list: [{ n: 1 }] });
    const view = lens<unknown[]>(store, ['list']);
    expect(view.get()).toEqual([{ n: 1 }]);
    expect(view.set).toBeUndefined();
  });
});

describe('edge cases: applyUpdate', () => {
  it('supports symbol keys on shallow scopes', () => {
    const key = Symbol('k');
    const store = oin({ [key]: 1 } as Record<PropertyKey, unknown>, {
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

    expect((store[key] as () => number)()).toBe(2);
  });

  it('rejects non-node targets', () => {
    expect(() => applyUpdate({ not: 'oin' }, {
      id: 'u2',
      baseRevision: 0,
      revision: 1,
      patches: [],
    })).toThrow(/not an OIN node/);
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
