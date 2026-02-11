import { describe, expect, it } from 'vitest';
import { applyUpdate } from '../utils/updates.js';
import { deepFreeze } from '../utils/snapshot.js';
import { relocate } from '../extensions/relocate.js';
import { io } from '../core/io.js';
import { link } from '../utils/link.js';
import type { IoUpdate } from '../utils/types.js';

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

  it('emits updates when emitUpdate is enabled', () => {
    const store = io(1);
    const updates: IoUpdate[] = [];
    store.subscribeUpdate((u) => updates.push(u));

    applyUpdate(
      store,
      {
        id: 'u3',
        baseRevision: 0,
        revision: 1,
        patches: [{ op: 'set', path: [], prev: 1, next: 2 }],
      },
      { emitUpdate: true },
    );

    expect(store.get()).toBe(2);
    expect(updates).toHaveLength(1);
    expect(updates[0].patches[0]).toMatchObject({ op: 'set', path: [] });
  });

  it('rejects root set patches for non-unit targets', () => {
    const store = io({ n: 1 });
    expect(() =>
      applyUpdate(store, {
        id: 'u4',
        baseRevision: 0,
        revision: 1,
        patches: [{ op: 'set', path: [], prev: { n: 1 }, next: { n: 2 } }],
      }),
    ).toThrow(/unsupported root set/);
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

describe('edge cases: unit Object.is semantics', () => {
  it('does not emit updates for NaN -> NaN', () => {
    const unit = io(Number.NaN);
    const seen: IoUpdate[] = [];
    unit.subscribeUpdate((u) => seen.push(u));

    unit.set(Number.NaN);
    expect(seen).toHaveLength(0);
  });

  it('treats +0 and -0 as different values', () => {
    const unit = io(0);
    const seen: number[] = [];
    unit.subscribe((v) => seen.push(v));

    unit.set(-0);
    expect(Object.is(unit.get(), -0)).toBe(true);
    expect(seen).toHaveLength(1);
  });
});

describe('edge cases: commit and linked-array subscriptions', () => {
  it('does not emit scope update when commit has no effective changes', () => {
    const store = io({ count: 1 });
    const updates: IoUpdate[] = [];
    store.subscribeUpdate((u) => updates.push(u));

    store.commit((draft) => {
      draft.count = 1;
    });

    expect(updates).toHaveLength(0);
  });

  it('keeps repeated-link subscriptions in sync after removing one index', () => {
    const count = io(0);
    const store = io({ items: [link(count), link(count)] });
    const updates: IoUpdate[] = [];
    const unsub = store.subscribeUpdate((u) => updates.push(u));

    store.items.splice(0, 1);
    updates.length = 0;
    count.set(1);
    unsub();

    expect(updates).toHaveLength(1);
    expect(updates[0].patches).toHaveLength(1);
    expect(updates[0].patches[0]).toMatchObject({ path: ['items', 0] });
  });
});
