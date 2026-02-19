import { describe, expect, it } from 'vitest';
import { applyUpdate, undoUpdate } from '../utils/patches/updates.js';
import { deepFreeze } from '../utils/immutable/immutable.js';
import { relocate } from '../extensions/relocate.js';
import { io } from '../core/api/io.js';
import { ioTree } from '../core/api/io-tree.js';
import { derived } from '../core/api/derived.js';
import { batch } from '../utils/reactive/batch.js';
import { link } from '../utils/internal/link.js';
import type { IoUpdate } from '../utils/types/types.js';

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

describe('edge cases: ioTree node factory', () => {
  it('rejects shared object references under arrays', () => {
    const shared = { n: 1 };
    expect(() => ioTree({ items: [shared, shared] })).toThrow(
      /shared object references are not allowed/,
    );
  });

  it('rejects non-plain objects in deep mode', () => {
    expect(() => ioTree({ at: new Date() })).toThrow(
      /deep mode only supports plain objects and arrays/,
    );
  });

  it('rejects forged link wrappers that do not target io nodes', () => {
    const fakeLink: Record<PropertyKey, unknown> = {};
    Object.defineProperty(fakeLink, Symbol.for('@org/io/link'), {
      value: {},
      enumerable: false,
    });

    expect(() => ioTree({ bad: fakeLink })).toThrow(
      /link target is not an IO node/,
    );
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
        action: 'counter/manual',
        meta: { source: 'spec' },
        patches: [{ op: 'set', path: [], prev: 1, next: 2 }],
      },
      { emitUpdate: true },
    );

    expect(store.get()).toBe(2);
    expect(updates).toHaveLength(1);
    expect(updates[0].patches[0]).toMatchObject({ op: 'set', path: [] });
    expect(updates[0].action).toBe('counter/manual');
    expect(updates[0].meta).toEqual({ source: 'spec' });
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

  it('accepts updates with non-contiguous revision metadata', () => {
    const store = io(1);
    applyUpdate(store, {
      id: 'u5',
      baseRevision: 2,
      revision: 3,
      patches: [{ op: 'set', path: [], prev: 1, next: 2 }],
    });
    expect(store.get()).toBe(2);
  });

  it('rejects malformed sort permutations during replay', () => {
    const arr = io([3, 1, 2]);

    expect(() =>
      applyUpdate(arr, {
        id: 'u6',
        baseRevision: 0,
        revision: 1,
        patches: [{ op: 'sort', path: [], order: [0, 0, 2] }],
      }),
    ).toThrow(/invalid sort order permutation/);

    expect(arr.get()).toEqual([3, 1, 2]);
  });

  it('rejects sort permutations with invalid length during replay', () => {
    const arr = io([3, 1, 2]);

    expect(() =>
      applyUpdate(arr, {
        id: 'u6b',
        baseRevision: 0,
        revision: 1,
        patches: [{ op: 'sort', path: [], order: [0, 2] }],
      }),
    ).toThrow(/invalid sort order length/);
  });

  it('rejects sort permutations with non-integer indices during replay', () => {
    const arr = io([3, 1, 2]);

    expect(() =>
      applyUpdate(arr, {
        id: 'u6c',
        baseRevision: 0,
        revision: 1,
        patches: [{ op: 'sort', path: [], order: [0, 1.5, 2] }],
      }),
    ).toThrow(/invalid sort order index/);
  });

  it('rejects sort permutations with out-of-range indices during replay', () => {
    const arr = io([3, 1, 2]);

    expect(() =>
      applyUpdate(arr, {
        id: 'u6d',
        baseRevision: 0,
        revision: 1,
        patches: [{ op: 'sort', path: [], order: [0, 1, 3] }],
      }),
    ).toThrow(/invalid sort order index/);
  });

  it('rejects set patches when parent is not a container', () => {
    const store = io({ a: 1 });

    expect(() =>
      applyUpdate(store, {
        id: 'u7',
        baseRevision: 0,
        revision: 1,
        patches: [{ op: 'set', path: ['a', 'b'], prev: 1, next: 2 }],
      }),
    ).toThrow(/set target is not a container/);
  });

  it('rejects splice and sort patches for non-array targets', () => {
    const store = io({ a: 1 });

    expect(() =>
      applyUpdate(store, {
        id: 'u8',
        baseRevision: 0,
        revision: 1,
        patches: [
          {
            op: 'splice',
            path: ['a'],
            start: 0,
            deleteCount: 0,
            deleted: [],
            items: [2],
          },
        ],
      }),
    ).toThrow(/splice target is not array/);

    expect(() =>
      applyUpdate(store, {
        id: 'u9',
        baseRevision: 0,
        revision: 1,
        patches: [{ op: 'sort', path: ['a'], order: [0] }],
      }),
    ).toThrow(/sort target is not array/);
  });

  it('inverts splice updates with preserved start index', () => {
    const inverted = undoUpdate({
      id: 'u10',
      baseRevision: 0,
      revision: 1,
      action: 'items/replace',
      patches: [
        {
          op: 'splice',
          path: ['items'],
          start: 2,
          deleteCount: 1,
          deleted: [3],
          items: [4, 5],
        },
      ],
    });

    expect(inverted.patches).toEqual([
      {
        op: 'splice',
        path: ['items'],
        start: 2,
        deleteCount: 2,
        deleted: [4, 5],
        items: [3],
      },
    ]);
    expect(inverted.action).toBe('undo');
    expect(inverted.meta).toMatchObject({
      sourceUpdateId: 'u10',
      sourceAction: 'items/replace',
    });
  });

  it('rejects invalid scope/array path segments while resolving parent nodes', () => {
    const scopeStore = io({ a: 1 });
    const arrayStore = io([1, 2, 3]);

    expect(() =>
      applyUpdate(scopeStore, {
        id: 'u11',
        baseRevision: 0,
        revision: 1,
        patches: [{ op: 'set', path: [0, 'a'], prev: 1, next: 2 }],
      }),
    ).toThrow(/invalid scope path segment/);

    expect(() =>
      applyUpdate(arrayStore, {
        id: 'u12',
        baseRevision: 0,
        revision: 1,
        patches: [{ op: 'set', path: [Symbol('k'), 0], prev: 1, next: 2 }],
      }),
    ).toThrow(/invalid array path segment/);
  });

  it('rejects updates when traversal enters non-node or leaf parent paths', () => {
    const scopeStore = io({ a: 1 });

    expect(() =>
      applyUpdate(scopeStore, {
        id: 'u13',
        baseRevision: 0,
        revision: 1,
        patches: [{ op: 'set', path: ['missing', 'x', 'y'], prev: 0, next: 1 }],
      }),
    ).toThrow(/path traversed into non-node/);

    expect(() =>
      applyUpdate(scopeStore, {
        id: 'u14',
        baseRevision: 0,
        revision: 1,
        patches: [{ op: 'set', path: ['a', 'x', 'y'], prev: 1, next: 2 }],
      }),
    ).toThrow(/path traversed into leaf node/);
  });

  it('rejects invalid scope and array keys on parent containers', () => {
    const scopeStore = io({ a: 1 });
    const arrayStore = io([1, 2, 3]);

    expect(() =>
      applyUpdate(scopeStore, {
        id: 'u15',
        baseRevision: 0,
        revision: 1,
        patches: [{ op: 'set', path: [0], prev: 1, next: 2 }],
      }),
    ).toThrow(/invalid scope key/);

    expect(() =>
      applyUpdate(arrayStore, {
        id: 'u16',
        baseRevision: 0,
        revision: 1,
        patches: [{ op: 'set', path: ['x'], prev: 1, next: 2 }],
      }),
    ).toThrow(/invalid array index/);
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
    const obj: { n: number; self?: unknown } = { n: 1 };
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

  it('supports deep nested scope commit recursion', () => {
    const store = io({
      level1: { level2: { level3: { value: 0, extra: 0 } } },
      list: [
        { id: '0', meta: { n: 0 } },
        { id: '1', meta: { n: 1 } },
      ],
    });

    expect(() => {
      store.commit((draft) => {
        draft.level1.level2.level3.value = 7;
        draft.level1.level2.level3.extra = 9;
        draft.list[1].meta.n = 42;
      });
    }).not.toThrow();

    expect(store.snapshot()).toMatchObject({
      level1: { level2: { level3: { value: 7, extra: 9 } } },
      list: [
        { id: '0', meta: { n: 0 } },
        { id: '1', meta: { n: 42 } },
      ],
    });
  });

  it('supports deep nested array commit recursion', () => {
    const store = io([{ item: { count: 0 } }, { item: { count: 1 } }]);

    expect(() => {
      store.commit((draft) => {
        draft[0].item.count = 10;
        draft[1].item.count = 11;
      });
    }).not.toThrow();

    expect(store.snapshot()).toEqual([
      { item: { count: 10 } },
      { item: { count: 11 } },
    ]);
  });

  it('supports repeated deep scope commits with array splice mutation', () => {
    const store = io({
      level1: {
        level2: {
          level3: {
            level4: {
              level5: { value: 0 },
              extra: 0,
            },
          },
        },
      },
      list: Array.from({ length: 20 }, (_, i) => ({
        id: String(i),
        meta: { n: i },
      })),
    });

    for (let i = 0; i < 50; i += 1) {
      store.commit((draft) => {
        draft.level1.level2.level3.level4.level5.value = i;
        draft.level1.level2.level3.level4.extra = i;
        const idx = i % draft.list.length;
        draft.list.splice(idx, 1, { id: String(i), meta: { n: i } });
      });
    }

    const snapshot = store.snapshot();
    expect(snapshot.level1.level2.level3.level4.level5.value).toBe(49);
    expect(snapshot.level1.level2.level3.level4.extra).toBe(49);
    expect(snapshot.list).toHaveLength(20);
  });

  it('supports repeated deep scope commits on depth boundary structures', () => {
    type Node = { value: number; child?: Node };

    const root: Node = { value: 0 };
    let current = root;
    for (let i = 1; i < 80; i += 1) {
      current.child = { value: i };
      current = current.child;
    }

    const store = io(root);

    for (let i = 0; i < 200; i += 1) {
      store.commit((draft) => {
        let node = draft;
        while (node.child) node = node.child;
        node.value = i;
      });
    }

    let leaf = store.snapshot();
    while (leaf.child) leaf = leaf.child;
    expect(leaf.value).toBe(199);
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

  it('rejects unknown keys in deep scope commits', () => {
    const store = io({ a: 1 });
    expect(() =>
      store.commit((draft) => {
        (draft as Record<string, unknown>).b = 2;
      }),
    ).toThrow(/unknown key/);
  });
});

describe('edge cases: array proxy mutation behavior', () => {
  it('supports bracket index assignment and emits update path', () => {
    const arr = io([1, 2, 3]);
    const updates: IoUpdate[] = [];
    arr.subscribeUpdate((u) => updates.push(u));

    (arr as unknown as Record<number, number>)[1] = 20;

    expect(arr.get()).toEqual([1, 20, 3]);
    expect(updates).toHaveLength(1);
    expect(updates[0].patches[0]).toMatchObject({ op: 'set', path: [1] });
  });

  it('keeps length read-only on array proxy', () => {
    const arr = io([1, 2, 3]);
    expect(() => {
      (arr as unknown as { length: number }).length = 1;
    }).toThrow(/length is read-only/);
    expect(arr.get()).toEqual([1, 2, 3]);
  });
});

describe('edge cases: derived deps contract', () => {
  it('rejects deps without subscribe()', () => {
    const dep = { get: () => 1 };
    expect(
      () =>
        derived(
          [
            dep as unknown as {
              get: () => number;
              subscribe: (fn: (...args: unknown[]) => void) => () => void;
            },
          ],
          (v) => Number(v) + 1,
        ),
    ).toThrow(
      /must implement subscribe/,
    );
  });
});

describe('edge cases: deep nesting / large arrays / cyclic references', () => {
  it('handles commits deeper than 10 levels', () => {
    type DeepNode = { value: number; child?: DeepNode };
    const root: DeepNode = { value: 0 };
    let current = root;
    for (let i = 1; i < 14; i += 1) {
      current.child = { value: i };
      current = current.child;
    }

    const store = io(root);
    store.commit((draft) => {
      let leaf = draft;
      while (leaf.child) leaf = leaf.child;
      leaf.value = 999;
    });

    let leaf = store.snapshot();
    while (leaf.child) leaf = leaf.child;
    expect(leaf.value).toBe(999);
  });

  it('supports snapshots and sparse updates on arrays larger than 10k', () => {
    const list = io(Array.from({ length: 12_000 }, (_, i) => i));
    list[11_999].set(42);
    const snapshot = list.snapshot();
    expect(snapshot).toHaveLength(12_000);
    expect(snapshot[11_999]).toBe(42);
  });

  it('supports circular references in scope snapshots', () => {
    const cyclic: { label: string; self?: unknown; nested: { count: number } } =
      { label: 'root', nested: { count: 0 } };
    cyclic.self = cyclic;

    const store = io(cyclic);
    store.nested.count.set(7);
    const snapshot = store.snapshot() as {
      label: string;
      self: unknown;
      nested: { count: number };
    };

    expect(snapshot.label).toBe('root');
    expect(snapshot.nested.count).toBe(7);
    expect(snapshot.self).toBe(snapshot);
  });
});

describe('edge cases: interleaved commits in one batch', () => {
  it('merges interleaved commit updates per node inside a single batch', () => {
    const left = io({ count: 0 });
    const right = io({ count: 0 });
    const leftUpdates: IoUpdate[] = [];
    const rightUpdates: IoUpdate[] = [];
    left.subscribeUpdate((u) => leftUpdates.push(u));
    right.subscribeUpdate((u) => rightUpdates.push(u));

    batch(() => {
      left.commit((draft) => {
        draft.count = 1;
      });
      right.commit((draft) => {
        draft.count = 10;
      });
      left.commit((draft) => {
        draft.count = 2;
      });
      right.commit((draft) => {
        draft.count = 11;
      });
    });

    expect(left.get().count).toBe(2);
    expect(right.get().count).toBe(11);
    expect(leftUpdates).toHaveLength(1);
    expect(rightUpdates).toHaveLength(1);
    expect(leftUpdates[0].patches[leftUpdates[0].patches.length - 1]).toMatchObject({
      op: 'set',
      path: ['count'],
      next: 2,
    });
    expect(
      rightUpdates[0].patches[rightUpdates[0].patches.length - 1],
    ).toMatchObject({
      op: 'set',
      path: ['count'],
      next: 11,
    });
  });
});
