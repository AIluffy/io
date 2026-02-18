import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  IoArrayUnit,
  IoPath,
  IoScope,
  IoTreeNode,
  IoUnit,
  IoUpdate,
} from '../utils/types/types.js';
import { batch } from '../utils/reactive/batch.js';
import { onError, onMutation } from '../utils/debug/debug.js';
import { derived } from '../core/api/derived.js';
import { io } from '../core/api/io.js';
import { ioTree } from '../core/api/io-tree.js';
import { INTERNAL } from '../utils/internal/internal-access.js';
import { link } from '../utils/internal/link.js';
import { Signal, computed, effect } from '../utils/reactive/signals.js';
import { createHistory } from '../utils/patches/history.js';
import {
  applyUpdate,
  undoUpdate,
  mergeUpdates,
  replay,
} from '../utils/patches/updates.js';

describe('io: unit', () => {
  it('supports get/set/reset', () => {
    const count = io(1);
    expect(count.get()).toBe(1);
    count.set(2);
    expect(count.get()).toBe(2);
    count.set((v) => v + 1);
    expect(count.get()).toBe(3);
    count.reset();
    expect(count.get()).toBe(1);
  });

  it('emits subscribe and subscribeUpdate', () => {
    const count = io(1);
    const values: number[] = [];
    const updates: IoUpdate[] = [];

    const unsubValue = count.subscribe((v) => values.push(v));
    const unsubUpdate = count.subscribeUpdate((u) => updates.push(u));

    count.set(2);
    count.set(3);

    unsubValue();
    unsubUpdate();

    count.set(4);

    expect(values).toEqual([2, 3]);
    expect(updates).toHaveLength(2);
    expect(updates[0].patches[0]).toMatchObject({ op: 'set', path: [] });
  });

  it('returns frozen snapshots for scopes', () => {
    const scope = io({ a: 1 });
    const snap = scope.snapshot();
    expect(Object.isFrozen(snap)).toBe(true);
    expect(() => {
      (snap as Record<string, unknown>).a = 2;
    }).toThrow();
    expect(scope.a.get()).toBe(1);
  });
});

describe('io: array', () => {
  it('supports snapshot get and index units', () => {
    const arr = io([1, 2, 3]);
    expect(arr.get()).toEqual([1, 2, 3]);
    expect(Object.isFrozen(arr.get())).toBe(true);
    expect(arr[0].get()).toBe(1);
  });

  it('bubbles element changes to array subscribe and derived', () => {
    const arr = io([1, 2, 3]);
    const values: number[][] = [];
    const unsub = arr.subscribe((v) => values.push(v));

    const sum = derived([arr], (a) =>
      a.reduce((p: number, n: IoUnit<number>) => p + n.get(), 0),
    );
    expect(sum.get()).toBe(6);

    arr[0].set(10);
    expect(arr.get()).toEqual([10, 2, 3]);
    expect(sum.get()).toBe(15);

    unsub();
    expect(values[values.length - 1]).toEqual([10, 2, 3]);
  });

  it('supports non-index property assignment on array proxy', () => {
    const arr = io([1, 2, 3]) as unknown as Record<string, unknown>;
    arr.meta = 'ok';

    expect(arr.meta).toBe('ok');
    expect((arr[0] as { get: () => number }).get()).toBe(1);
  });

  it('supports push/pop/splice/sort', () => {
    const arr = io([3, 1, 2]);
    arr.push(4);
    expect(arr.get()).toEqual([3, 1, 2, 4]);
    expect(arr.pop()).toBe(4);
    expect(arr.get()).toEqual([3, 1, 2]);
    arr.splice(1, 1, 9);
    expect(arr.get()).toEqual([3, 9, 2]);
    arr.sort((a, b) => a - b);
    expect(arr.get()).toEqual([2, 3, 9]);
  });

  it('recomputes only dirty indices on incremental array rebuild', () => {
    const arr = io([1, 2, 3]);
    const s1 = arr.snapshot() as number[];

    arr[1].set(20);
    const s2 = arr.snapshot() as number[];
    const d0 = Object.getOwnPropertyDescriptor(s2, '0');
    const d1 = Object.getOwnPropertyDescriptor(s2, '1');
    const d2 = Object.getOwnPropertyDescriptor(s2, '2');

    expect(d0?.get).toBeUndefined();
    expect(d1?.get).toBeUndefined();
    expect(d2?.get).toBeUndefined();
    expect(s2[0]).toBe(s1[0]);
    expect(s2[2]).toBe(s1[2]);
    expect(s2[1]).toBe(20);
  });
});

describe('io: scope', () => {
  it('supports commit with start-of-commit reads', () => {
    const counter = io({ count: 0, step: 1 });
    let inside = -1;
    counter.commit((draft) => {
      inside = counter.count.get();
      draft.count += 1;
      draft.step = 2;
    });
    expect(inside).toBe(0);
    expect(counter.count.get()).toBe(1);
    expect(counter.step.get()).toBe(2);
  });

  it('builds first rebuilt scope snapshot with eager values', () => {
    const store = io({ a: { n: 1 }, b: { n: 2 } });
    const snap = store.snapshot() as Record<string, unknown>;
    const aDesc = Object.getOwnPropertyDescriptor(snap, 'a');
    const bDesc = Object.getOwnPropertyDescriptor(snap, 'b');

    expect(aDesc?.get).toBeUndefined();
    expect(bDesc?.get).toBeUndefined();
    expect(snap).toMatchObject({ a: { n: 1 }, b: { n: 2 } });
  });

  it('recomputes only dirty keys on incremental scope rebuild', () => {
    const store = io({ a: { n: 1 }, b: { n: 2 } });
    const s1 = store.snapshot() as { a: { n: number }; b: { n: number } };

    store.a.n.set(3);
    const s2 = store.snapshot() as { a: { n: number }; b: { n: number } };
    const aDesc = Object.getOwnPropertyDescriptor(s2, 'a');
    const bDesc = Object.getOwnPropertyDescriptor(s2, 'b');

    expect(aDesc?.get).toBeUndefined();
    expect(bDesc?.get).toBeUndefined();
    expect(s2.b).toBe(s1.b);
    expect(s2.a).not.toBe(s1.a);
    expect(s2.a.n).toBe(3);
  });

  it('emits a single scope update for commit', () => {
    const counter = io({ count: 0, step: 1 });
    const updates: IoUpdate[] = [];
    counter.subscribeUpdate((u) => updates.push(u));
    counter.commit((draft) => {
      draft.count = 10;
      draft.step = 2;
    });
    expect(updates).toHaveLength(1);
    const paths: IoPath[] = updates[0].patches.map((p) => p.path);
    expect(paths).toEqual([['count'], ['step']]);
  });
});

describe('updates: merge/apply/invert/replay', () => {
  it('replays unit updates and supports invert', () => {
    const u1 = io(1);
    const seen: IoUpdate[] = [];
    u1.subscribeUpdate((u) => seen.push(u));
    u1.set(2);
    u1.set(3);

    const merged = mergeUpdates(seen);
    const u2 = io(1);
    applyUpdate(u2, merged);
    expect(u2.get()).toBe(3);

    applyUpdate(u2, undoUpdate(merged));
    expect(u2.get()).toBe(1);
  });

  it('supports mergeUpdates variadic calls', () => {
    const u1 = io(1);
    const seen: IoUpdate[] = [];
    u1.subscribeUpdate((u) => seen.push(u));
    u1.set(2);
    u1.set(3);

    const mergedList = mergeUpdates(seen);
    const mergedVariadic = mergeUpdates(...seen);
    expect(mergedVariadic).toMatchObject({
      baseRevision: mergedList.baseRevision,
      revision: mergedList.revision,
      patches: mergedList.patches,
    });
  });

  it('replays array structural updates', () => {
    const a1 = io([1, 2, 3]);
    const updates: IoUpdate[] = [];
    a1.subscribeUpdate((u) => updates.push(u));
    a1.push(4);
    a1.splice(1, 2, 9);
    a1.sort((x, y) => y - x);

    const a2 = io([1, 2, 3]);
    replay(a2, updates);
    expect(a2.get()).toEqual(a1.get());
  });

  it('applyUpdate supports array input', () => {
    const a1 = io([1, 2, 3]);
    const updates: IoUpdate[] = [];
    a1.subscribeUpdate((u) => updates.push(u));
    a1.push(4);
    a1.splice(1, 1, 9);

    const a2 = io([1, 2, 3]);
    applyUpdate(a2, updates);
    expect(a2.get()).toEqual(a1.get());

    const a3 = io([1, 2, 3]);
    replay(a3, updates);
    expect(a3.get()).toEqual(a1.get());
  });
});

describe('history: createHistory', () => {
  it('supports undo/redo without re-recording', () => {
    const store = io({ count: 0 });
    const history = createHistory(store);

    store.count.set(1);
    store.count.set(2);

    expect(history.length).toBe(2);
    expect(history.cursor).toBe(1);
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);

    history.undo();
    expect(store.count.get()).toBe(1);
    expect(history.cursor).toBe(0);
    expect(history.length).toBe(2);

    history.redo();
    expect(store.count.get()).toBe(2);
    expect(history.cursor).toBe(1);
    expect(history.length).toBe(2);

    history.undo();
    history.undo();
    expect(store.count.get()).toBe(0);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(true);
  });

  it('trims redo stack and respects history limit', () => {
    const store = io({ count: 0 });
    const history = createHistory(store, { limit: 2 });

    store.count.set(1);
    store.count.set(2);
    store.count.set(3);
    expect(history.length).toBe(2);
    expect(history.cursor).toBe(1);

    history.undo();
    expect(store.count.get()).toBe(2);
    expect(history.canRedo).toBe(true);

    store.count.set(4);
    expect(history.length).toBe(2);
    expect(history.cursor).toBe(1);
    expect(history.canRedo).toBe(false);
  });

  it('supports clear/destroy and ignores updates after destroy', () => {
    const store = io({ count: 0 });
    const history = createHistory(store);

    store.count.set(1);
    expect(history.length).toBe(1);

    history.clear();
    expect(history.length).toBe(0);
    expect(history.cursor).toBe(-1);

    history.destroy();
    history.destroy();
    store.count.set(2);
    expect(history.length).toBe(0);
    expect(history.canUndo).toBe(false);
  });

  it('is a no-op when undo/redo are called at bounds', () => {
    const store = io({ count: 0 });
    const history = createHistory(store, { limit: 0 });

    history.undo();
    history.redo();
    expect(store.count.get()).toBe(0);
    expect(history.length).toBe(0);
    expect(history.cursor).toBe(-1);
  });

  it('throws for non-io targets', () => {
    expect(() => createHistory({})).toThrow(
      'createHistory: target is not an IO node',
    );
  });
});

describe('ioTree: deep path replay', () => {
  it('bubbles nested updates with deep paths and can replay on root', () => {
    const s1 = ioTree({
      items: [{ count: 1 }, { count: 2 }],
      meta: { tag: 'a' },
    });
    const updates: IoUpdate[] = [];
    s1.subscribeUpdate((u: IoUpdate) => updates.push(u));

    s1.items[0].count.set(10);
    s1.items.push({ count: 3 });
    s1.items[1].count.set(20);
    s1.meta.tag.set('b');

    const paths: IoPath[] = updates.flatMap((u) =>
      u.patches.map((p) => p.path),
    );
    expect(paths).toContainEqual(['items', 0, 'count']);
    expect(paths).toContainEqual(['items']);
    expect(paths).toContainEqual(['items', 1, 'count']);
    expect(paths).toContainEqual(['meta', 'tag']);

    const s2 = ioTree({
      items: [{ count: 1 }, { count: 2 }],
      meta: { tag: 'a' },
    });
    replay(s2, updates);
    expect(s2.snapshot()).toEqual(s1.snapshot());
  });
});

describe('ioTree: nested split', () => {
  it('splits nested objects into leaf nodes', () => {
    const user = ioTree({ profile: { name: 'a', age: 1 } });
    expect(user.profile.age.get()).toBe(1);
    user.profile.age.set((v) => v + 1);
    expect(user.profile.age.get()).toBe(2);
  });

  it('supports deep path mapping via internal ctx', () => {
    const user = ioTree({ profile: { name: 'a', age: 1 } });
    const rootInternal = (user as Record<PropertyKey, unknown>)[
      INTERNAL
    ] as {
      getState: () => {
        ctx: {
          root: {
            node?: unknown;
            children: Map<string | number, unknown>;
          };
        };
      };
    };
    const ctxRoot = rootInternal.getState().ctx.root as {
      node?: unknown;
      children: Map<string | number, unknown>;
    };
    const profileTrie = ctxRoot.children.get('profile') as {
      node?: unknown;
      children: Map<string | number, unknown>;
    };
    const ageTrie = profileTrie.children.get('age') as { node?: unknown };
    expect(ageTrie.node).toBe(user.profile.age);
  });
});

describe('signals: computed/effect', () => {
  it('tracks leaf units and reruns only when dependencies change', async () => {
    const s = ioTree({ user: { name: 'a', age: 1 } });
    const seen: string[] = [];
    const stop = effect(() => {
      seen.push(s.user.name.get());
    });
    await Promise.resolve();
    expect(seen).toEqual(['a']);

    s.user.age.set(2);
    await Promise.resolve();
    expect(seen).toEqual(['a']);

    s.user.name.set('b');
    await Promise.resolve();
    expect(seen).toEqual(['a', 'b']);
    stop();
  });

  it('supports standalone Signal.State and Signal.Computed', () => {
    const count = new Signal.State(1);
    const double = computed(() => count.get() * 2);
    expect(double.get()).toBe(2);
    count.set(2);
    expect(double.get()).toBe(4);
  });

  it('runs cleanup on rerun and on dispose', async () => {
    const count = new Signal.State(0);
    const cleanup = vi.fn();
    const stop = effect(() => {
      count.get();
      return cleanup;
    });

    count.set(1);
    await Promise.resolve();
    expect(cleanup).toHaveBeenCalledTimes(1);

    stop();
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it('skips notifications when state value is unchanged', () => {
    const count = new Signal.State(1);
    const listener = vi.fn();
    count.subscribe(listener);

    count.set(1);
    count.set((prev) => prev);
    expect(listener).not.toHaveBeenCalled();
  });

  it('coalesces multiple synchronous writes into one effect rerun', async () => {
    const count = new Signal.State(0);
    const seen: number[] = [];
    const stop = effect(() => {
      seen.push(count.get());
    });

    count.set(1);
    count.set(2);
    await Promise.resolve();
    stop();

    expect(seen).toEqual([0, 2]);
  });

  it('switches tracked dependencies and unsubscribes stale ones', async () => {
    const useLeft = new Signal.State(true);
    const left = new Signal.State(1);
    const right = new Signal.State(10);
    const seen: number[] = [];

    const stop = effect(() => {
      seen.push(useLeft.get() ? left.get() : right.get());
    });

    left.set(2);
    await Promise.resolve();

    useLeft.set(false);
    await Promise.resolve();

    left.set(3);
    await Promise.resolve();

    right.set(11);
    await Promise.resolve();
    stop();

    expect(seen).toEqual([1, 2, 10, 11]);
  });
});

describe('batch', () => {
  it('coalesces shared listeners across multiple units', () => {
    const u1 = io(0);
    const u2 = io(0);
    const u3 = io(0);
    let calls = 0;
    const cb = () => {
      calls += 1;
    };
    u1.subscribe(cb);
    u2.subscribe(cb);
    u3.subscribe(cb);

    batch(() => {
      u1.set(1);
      u2.set(2);
      u3.set(3);
    });
    expect(calls).toBe(1);
  });

  it('stabilizes snapshot references within the same revision', () => {
    const s = io({ a: 1 });
    const v1 = s.snapshot();
    const v2 = s.snapshot();
    expect(v1).toBe(v2);
    s.a.set(2);
    const v3 = s.snapshot();
    expect(v3).not.toBe(v2);
  });
});

describe('derived', () => {
  it('supports type-safe selectors with property access', async () => {
    const scope = ioTree({ user: { name: 'a', age: 1 } });
    const display = derived(scope, (s) => `${s.user.name} (${s.user.age})`);
    expect(display.get()).toBe('a (1)');
    const seen: string[] = [];
    const unsub = display.subscribe((v) => seen.push(v));

    scope.user.age.set(2);
    await Promise.resolve();
    scope.user.name.set('b');
    await Promise.resolve();

    unsub();
    expect(display.get()).toBe('b (2)');
    expect(seen).toEqual(['a (2)', 'b (2)']);
  });
});

describe('debug hooks', () => {
  it('onMutation emits per-patch callbacks', () => {
    const scope = ioTree({ user: { name: 'a', age: 1 } });
    const seen: Array<{ path: IoPath; op: string }> = [];
    const unsub = onMutation(scope, (patch, path) => {
      seen.push({ path, op: patch.op });
    });
    scope.user.name.set('b');
    scope.user.age.set(2);
    unsub();
    expect(seen).toContainEqual({ path: ['user', 'name'], op: 'set' });
    expect(seen).toContainEqual({ path: ['user', 'age'], op: 'set' });
  });

  it('onError emits on failed mutations', () => {
    const scope = ioTree({ user: { name: 'a', age: 1 } });
    const seen: Array<{ path: IoPath; op: string }> = [];
    const unsub = onError(scope, (_error, path, op) => {
      seen.push({ path, op });
    });
    expect(() => {
      scope.commit(() => {
        throw new Error('boom');
      });
    }).toThrow();
    unsub();
    expect(seen[0]).toMatchObject({ path: [], op: 'commit' });
  });

  it('onError rejects non-io targets', () => {
    expect(() => onError({}, () => undefined)).toThrow(
      'onError: target is not an IO node',
    );
  });

  it('onMutation validates target capabilities', () => {
    expect(() =>
      onMutation(null, () => undefined),
    ).toThrow('onMutation: invalid target');

    expect(() =>
      onMutation({}, () => undefined),
    ).toThrow('onMutation: target does not support subscribeUpdate');
  });
});

describe('link', () => {
  it('preserves identity and snapshots', () => {
    const count = io(0);
    const store = io({ count: link(count) });

    expect(store.count).toBe(count);
    expect(store.snapshot()).toEqual({ count: 0 });

    count.set(2);
    expect(store.snapshot()).toEqual({ count: 2 });
  });

  it('bubbles updates with prefixed paths', () => {
    const count = io(0);
    const store = io({ count: link(count) });
    const updates: IoUpdate[] = [];
    const unsub = store.subscribeUpdate((u) => updates.push(u));

    count.set(1);
    unsub();

    expect(updates).toHaveLength(1);
    expect(updates[0].patches[0]).toMatchObject({ op: 'set', path: ['count'] });
  });

  it('supports commit against linked nodes', () => {
    const count = io(0);
    const store = io({ count: link(count) });

    store.commit((draft) => {
      draft.count = 5;
    });

    expect(count.get()).toBe(5);
  });

  it('rejects non-IO targets', () => {
    expect(() => link({ value: 1 } as unknown)).toThrow(
      'link: target is not an IO node',
    );
  });

  it('links scopes and bubbles nested updates', () => {
    const profile = io({ name: 'Ada' });
    const store = io({ profile: link(profile) });
    const updates: IoUpdate[] = [];
    const unsub = store.subscribeUpdate((u) => updates.push(u));

    profile.name.set('Grace');
    unsub();

    expect(store.profile).toBe(profile);
    expect(store.snapshot()).toEqual({ profile: { name: 'Grace' } });
    expect(updates[0].patches[0]).toMatchObject({
      op: 'set',
      path: ['profile', 'name'],
    });
  });

  it('links arrays and bubbles indexed updates', () => {
    const items = io([{ id: 'a' }]);
    const store = io({ items: link(items) });
    const updates: IoUpdate[] = [];
    const unsub = store.subscribeUpdate((u) => updates.push(u));

    items[0].id.set('b');
    unsub();

    expect(store.items).toBe(items);
    expect(store.snapshot()).toEqual({ items: [{ id: 'b' }] });
    expect(updates[0].patches[0]).toMatchObject({
      op: 'set',
      path: ['items', 0, 'id'],
    });
  });

  it('bubbles updates to all indices for repeated links in arrays', () => {
    const count = io(0);
    const store = io({ items: [link(count), link(count)] });
    const updates: IoUpdate[] = [];
    const unsub = store.subscribeUpdate((u) => updates.push(u));

    count.set(1);
    unsub();

    const paths = updates[0].patches.map((p) => p.path);
    expect(paths).toContainEqual(['items', 0]);
    expect(paths).toContainEqual(['items', 1]);
  });

  it('supports linking an existing sibling node in the same tree array', () => {
    const store = io({ items: [{ n: 1 }] });
    const updates: IoUpdate[] = [];
    const unsub = store.subscribeUpdate((u) => updates.push(u));

    store.items.push(link(store.items[0]) as never);
    store.items[0].n.set(2);
    unsub();

    expect(store.snapshot()).toEqual({ items: [{ n: 2 }, { n: 2 }] });
    expect(updates[0].patches[0]).toMatchObject({
      op: 'splice',
      path: ['items'],
      items: [{ n: 1 }],
    });
  });

  it('rejects link cycles', () => {
    const store = io({ items: [] as unknown[] });
    expect(() => {
      store.items.push(link(store));
    }).toThrow(/cycle/i);
  });
});

describe('array structural updates', () => {
  it('clamps splice start to array end when start is out of range', () => {
    const items = io([1, 2]);
    const updates: IoUpdate[] = [];
    const unsub = items.subscribeUpdate((u) => updates.push(u));

    items.splice(99, 1, 3);
    unsub();

    expect(items.get()).toEqual([1, 2, 3]);
    expect(updates[0].patches[0]).toMatchObject({
      op: 'splice',
      path: [],
      start: 2,
      deleteCount: 0,
      items: [3],
    });
  });

  it('supports replacing full array value with set()', () => {
    const items = io([1, 2, 3]);
    const updates: IoUpdate[] = [];
    const unsub = items.subscribeUpdate((u) => updates.push(u));

    items.set([3, 2, 1]);
    unsub();

    expect(items.get()).toEqual([3, 2, 1]);
    expect(updates[0].patches[0]).toMatchObject({
      op: 'set',
      path: [],
      next: [3, 2, 1],
    });
  });
});

describe('types', () => {
  it('infers node types', () => {
    const unit = io(1);
    expectTypeOf(unit).toEqualTypeOf<IoUnit<number>>();

    const array = io([1, 2, 3]);
    expectTypeOf(array).toEqualTypeOf<IoArrayUnit<number>>();

    const scope = io({ a: 1 });
    expectTypeOf(scope).toEqualTypeOf<IoScope<{ a: number }>>();

    const d = derived([unit], (n) => n + 1);
    expectTypeOf(d.get()).toEqualTypeOf<number>();
  });

  it('infers tree node types', () => {
    const tree = ioTree({ profile: { age: 1 }, items: [{ count: 1 }] });
    expectTypeOf(tree).toEqualTypeOf<
      IoTreeNode<{ profile: { age: number }; items: { count: number }[] }>
    >();
    expectTypeOf(tree.profile.age).toEqualTypeOf<IoUnit<number>>();
    expectTypeOf(tree.items[0].count).toEqualTypeOf<IoUnit<number>>();
  });

  it('infers linked node types', () => {
    const count = io(1);
    const store = io({ count: link(count) });
    expectTypeOf(store.count).toEqualTypeOf<IoUnit<number>>();
    expectTypeOf(store.get().count).toEqualTypeOf<number>();
  });
});

describe('derived: unit-level deps and release', () => {
  it('recomputes only when dependent unit changes', () => {
    const user = ioTree({ profile: { name: 'a', age: 1 } });
    let calls = 0;
    const d = derived([user.profile.age], (a) => {
      calls += 1;
      return a * 2;
    });

    const unsub = d.subscribe(() => {
      return undefined;
    });
    expect(d.get()).toBe(2);
    const before = calls;

    user.profile.name.set('b');
    expect(calls).toBe(before);

    user.profile.age.set((v) => v + 1);
    expect(calls).toBeGreaterThan(before);
    expect(d.get()).toBe(4);

    unsub();
  });

  it('subscribes and unsubscribes from deps without leaking', () => {
    const user = ioTree({ profile: { age: 1 } });
    const unitInternal = (
      user.profile.age as Record<PropertyKey, unknown>
    )[INTERNAL] as {
      getState: () => { valueListeners: Set<unknown> };
    };
    const base = unitInternal.getState().valueListeners.size;

    const d = derived([user.profile.age], (a) => a + 1);
    const unsub = d.subscribe(() => {
      return undefined;
    });
    expect(unitInternal.getState().valueListeners.size).toBe(base + 1);
    unsub();
    expect(unitInternal.getState().valueListeners.size).toBe(base);
  });
});

describe('updates: replay/invert consistency', () => {
  function createRng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0x1_0000_0000;
    };
  }

  function randInt(rng: () => number, maxExclusive: number): number {
    return Math.floor(rng() * maxExclusive);
  }

  it('replays and inverts unit updates across multiple seeds', () => {
    for (let seed = 1; seed <= 10; seed += 1) {
      const rng = createRng(seed);
      const u1 = io(0);
      const seen: IoUpdate[] = [];
      u1.subscribeUpdate((u) => seen.push(u));

      for (let i = 0; i < 80; i += 1) {
        if (rng() < 0.6) {
          const delta = randInt(rng, 11) - 5;
          u1.set((v) => v + delta);
        } else {
          u1.set(randInt(rng, 200) - 100);
        }
      }

      const u2 = io(0);
      replay(u2, seen);
      expect(u2.get()).toBe(u1.get());

      const merged = mergeUpdates(seen);
      const u3 = io(0);
      applyUpdate(u3, merged);
      expect(u3.get()).toBe(u1.get());
      applyUpdate(u3, undoUpdate(merged));
      expect(u3.get()).toBe(0);
    }
  });

  it('replays and inverts mixed scope updates', () => {
    for (let seed = 1; seed <= 10; seed += 1) {
      const rng = createRng(seed);
      const s1 = io({ a: 0, b: 0 });
      const seen: IoUpdate[] = [];
      s1.subscribeUpdate((u) => seen.push(u));

      for (let i = 0; i < 60; i += 1) {
        const op = randInt(rng, 3);
        if (op === 0) s1.a.set(randInt(rng, 100));
        else if (op === 1)
          s1.b.set((v) => v + (randInt(rng, 7) - 3));
        else {
          s1.commit((draft) => {
            draft.a = randInt(rng, 100);
            draft.b = randInt(rng, 100);
          });
        }
      }

      const s2 = io({ a: 0, b: 0 });
      replay(s2, seen);
      expect(s2.snapshot()).toEqual(s1.snapshot());

      const merged = mergeUpdates(seen);
      const s3 = io({ a: 0, b: 0 });
      applyUpdate(s3, merged);
      expect(s3.snapshot()).toEqual(s1.snapshot());
      applyUpdate(s3, undoUpdate(merged));
      expect(s3.snapshot()).toEqual({ a: 0, b: 0 });
    }
  });

  it('replays and inverts mixed array updates', () => {
    for (let seed = 1; seed <= 10; seed += 1) {
      const rng = createRng(seed);
      const a1 = io([0, 1, 2, 3]);
      const seen: IoUpdate[] = [];
      a1.subscribeUpdate((u) => seen.push(u));

      for (let i = 0; i < 80; i += 1) {
        const op = randInt(rng, 5);
        if (op === 0) a1.push(randInt(rng, 50));
        else if (op === 1) a1.pop();
        else if (op === 2) {
          const start =
            a1.get().length === 0 ? 0 : randInt(rng, a1.get().length);
          const del = a1.get().length === 0 ? 0 : randInt(rng, 3);
          a1.splice(start, del, randInt(rng, 50));
        } else if (op === 3) {
          const len = a1.get().length;
          if (len > 0) {
            const idx = randInt(rng, len);
            a1[idx].set(randInt(rng, 1000));
          }
        } else {
          a1.sort((x, y) => x - y);
        }
      }

      const a2 = io([0, 1, 2, 3]);
      replay(a2, seen);
      expect(a2.get()).toEqual(a1.get());

      const merged = mergeUpdates(seen);
      const a3 = io([0, 1, 2, 3]);
      applyUpdate(a3, merged);
      expect(a3.get()).toEqual(a1.get());
      applyUpdate(a3, undoUpdate(merged));
      expect(a3.get()).toEqual([0, 1, 2, 3]);
    }
  });

  it('replays deep path updates on ioTree roots', () => {
    for (let seed = 1; seed <= 10; seed += 1) {
      const rng = createRng(seed);
      const t1 = ioTree({
        user: { name: 'a', age: 1 },
        items: [{ count: 1 }, { count: 2 }],
      });
      const seen: IoUpdate[] = [];
      t1.subscribeUpdate((u) => seen.push(u));

      for (let i = 0; i < 60; i += 1) {
        const op = randInt(rng, 5);
        if (op === 0) {
          const name = String.fromCharCode(97 + randInt(rng, 3));
          t1.user.name.set(name);
        } else if (op === 1) {
          t1.user.age.set((v) => v + 1);
        } else if (op === 2) {
          const len = t1.items.get().length;
          if (len > 0) {
            const idx = randInt(rng, len);
            t1.items[idx].count.set(
              (v) => v + (randInt(rng, 5) - 2),
            );
          }
        } else if (op === 3) {
          t1.items.push({ count: randInt(rng, 10) });
        } else {
          const len = t1.items.get().length;
          if (len > 0) {
            const start = randInt(rng, len);
            const del = randInt(rng, Math.min(2, len - start) + 1);
            t1.items.splice(start, del);
          }
        }
      }

      const t2 = ioTree({
        user: { name: 'a', age: 1 },
        items: [{ count: 1 }, { count: 2 }],
      });
      replay(t2, seen);
      expect(t2.snapshot()).toEqual(t1.snapshot());
    }
  });
});

describe('snapshot reuse', () => {
  it('reuses unchanged branches on deep updates', () => {
    const store = io({
      user: { profile: { name: 'a', age: 1 } },
      items: [{ id: 1, count: 0 }, { id: 2, count: 0 }],
    });

    const s1 = store.snapshot();
    store.items[0].count.set((v) => v + 1);
    const s2 = store.snapshot();

    expect(s1).not.toBe(s2);
    expect(s1.items).not.toBe(s2.items);
    expect(s1.user).toBe(s2.user);
    expect(s1.user.profile).toBe(s2.user.profile);
  });
});
