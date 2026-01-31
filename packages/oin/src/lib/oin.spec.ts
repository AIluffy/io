import { describe, expect, expectTypeOf, it } from 'vitest';
import { batch } from './batch.js';
import { onError, onMutation } from './debug.js';
import { derive } from './derive.js';
import { formula } from './formula.js';
import { oin } from './oin.js';
import { oinDeep } from './oin-deep.js';
import { oinTree } from './oin-tree.js';
import { Signal, computed, effect } from './signals.js';
import { applyUpdate, invertUpdate, mergeUpdates, replay } from './updates.js';
import type {
  OinArrayUnit,
  OinPath,
  OinScope,
  OinTreeNode,
  OinUnit,
  OinUpdate,
} from './types.js';

describe('oin: unit', () => {
  it('supports get/set/functional set/reset', () => {
    const count = oin(1);
    expect(count()).toBe(1);
    count(2);
    expect(count()).toBe(2);
    count((v) => v + 1);
    expect(count()).toBe(3);
    count.reset();
    expect(count()).toBe(1);
  });

  it('emits subscribe and subscribeUpdate', () => {
    const count = oin(1);
    const values: number[] = [];
    const updates: OinUpdate[] = [];

    const unsubValue = count.subscribe((v) => values.push(v));
    const unsubUpdate = count.subscribeUpdate((u) => updates.push(u));

    count(2);
    count(3);

    unsubValue();
    unsubUpdate();

    count(4);

    expect(values).toEqual([2, 3]);
    expect(updates).toHaveLength(2);
    expect(updates[0].patches[0]).toMatchObject({ op: 'set', path: [] });
  });

  it('returns frozen snapshots for scopes', () => {
    const scope = oin({ a: 1 });
    const snap = scope.snapshot();
    expect(Object.isFrozen(snap)).toBe(true);
    expect(() => {
      (snap as unknown as Record<string, unknown>).a = 2;
    }).toThrow();
    expect(scope.a()).toBe(1);
  });
});

describe('oin: array', () => {
  it('supports snapshot get and index units', () => {
    const arr = oin([1, 2, 3]);
    expect(arr()).toEqual([1, 2, 3]);
    expect(Object.isFrozen(arr())).toBe(true);
    expect(arr[0]()).toBe(1);
  });

  it('bubbles element changes to array subscribe and derived', () => {
    const arr = oin([1, 2, 3]);
    const values: number[][] = [];
    const unsub = arr.subscribe((v) => values.push(v));

    const sum = formula([arr], (a) =>
      a.reduce((p: number, n: OinUnit<number>) => p + n(), 0)
    );
    expect(sum()).toBe(6);

    arr[0](10);
    expect(arr()).toEqual([10, 2, 3]);
    expect(sum()).toBe(15);

    unsub();
    expect(values[values.length - 1]).toEqual([10, 2, 3]);
  });

  it('supports push/pop/splice/sort', () => {
    const arr = oin([3, 1, 2]);
    arr.push(4);
    expect(arr()).toEqual([3, 1, 2, 4]);
    expect(arr.pop()).toBe(4);
    expect(arr()).toEqual([3, 1, 2]);
    arr.splice(1, 1, 9);
    expect(arr()).toEqual([3, 9, 2]);
    arr.sort((a, b) => a - b);
    expect(arr()).toEqual([2, 3, 9]);
  });
});

describe('oin: scope', () => {
  it('supports commit with start-of-commit reads', () => {
    const counter = oin({ count: 0, step: 1 });
    let inside = -1;
    counter.commit((draft) => {
      inside = counter.count();
      draft.count += 1;
      draft.step = 2;
    });
    expect(inside).toBe(0);
    expect(counter.count()).toBe(1);
    expect(counter.step()).toBe(2);
  });

  it('emits a single scope update for commit', () => {
    const counter = oin({ count: 0, step: 1 });
    const updates: OinUpdate[] = [];
    counter.subscribeUpdate((u) => updates.push(u));
    counter.commit((draft) => {
      draft.count = 10;
      draft.step = 2;
    });
    expect(updates).toHaveLength(1);
    const paths: OinPath[] = updates[0].patches.map((p) => p.path);
    expect(paths).toEqual([['count'], ['step']]);
  });
});

describe('updates: merge/apply/invert/replay', () => {
  it('replays unit updates and supports invert', () => {
    const u1 = oin(1);
    const seen: OinUpdate[] = [];
    u1.subscribeUpdate((u) => seen.push(u));
    u1(2);
    u1(3);

    const merged = mergeUpdates(seen);
    const u2 = oin(1);
    applyUpdate(u2, merged);
    expect(u2()).toBe(3);

    applyUpdate(u2, invertUpdate(merged));
    expect(u2()).toBe(1);
  });

  it('replays array structural updates', () => {
    const a1 = oin([1, 2, 3]);
    const updates: OinUpdate[] = [];
    a1.subscribeUpdate((u) => updates.push(u));
    a1.push(4);
    a1.splice(1, 2, 9);
    a1.sort((x, y) => y - x);

    const a2 = oin([1, 2, 3]);
    replay(a2, updates);
    expect(a2()).toEqual(a1());
  });
});

describe('oinTree: deep path replay', () => {
  it('bubbles nested updates with deep paths and can replay on root', () => {
    const s1 = oinTree({
      items: [{ count: 1 }, { count: 2 }],
      meta: { tag: 'a' },
    });
    const updates: OinUpdate[] = [];
    s1.subscribeUpdate((u: OinUpdate) => updates.push(u));

    s1.items[0].count(10);
    s1.items.push({ count: 3 });
    s1.items[1].count(20);
    s1.meta.tag('b');

    const paths: OinPath[] = updates.flatMap((u) =>
      u.patches.map((p) => p.path)
    );
    expect(paths).toContainEqual(['items', 0, 'count']);
    expect(paths).toContainEqual(['items']);
    expect(paths).toContainEqual(['items', 1, 'count']);
    expect(paths).toContainEqual(['meta', 'tag']);

    const s2 = oinTree({
      items: [{ count: 1 }, { count: 2 }],
      meta: { tag: 'a' },
    });
    replay(s2, updates);
    expect(s2.snapshot()).toEqual(s1.snapshot());
  });
});

describe('oinTree: nested split', () => {
  it('splits nested objects into leaf nodes', () => {
    const user = oinTree({ profile: { name: 'a', age: 1 } });
    expect(user.profile.age()).toBe(1);
    user.profile.age((v) => v + 1);
    expect(user.profile.age()).toBe(2);
  });

  it('supports deep path mapping via internal ctx', () => {
    const user = oinTree({ profile: { name: 'a', age: 1 } });
    const INTERNAL = Symbol.for('@org/oin/internal');
    const rootInternal = (user as unknown as Record<PropertyKey, unknown>)[
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
    const ctxRoot = rootInternal.getState().ctx.root as unknown as {
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
    const s = oinTree({ user: { name: 'a', age: 1 } });
    const seen: string[] = [];
    const stop = effect(() => {
      seen.push(s.user.name());
    });
    await Promise.resolve();
    expect(seen).toEqual(['a']);

    s.user.age(2);
    await Promise.resolve();
    expect(seen).toEqual(['a']);

    s.user.name('b');
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
});

describe('batch', () => {
  it('coalesces shared listeners across multiple units', () => {
    const u1 = oin(0);
    const u2 = oin(0);
    const u3 = oin(0);
    let calls = 0;
    const cb = () => {
      calls += 1;
    };
    u1.subscribe(cb);
    u2.subscribe(cb);
    u3.subscribe(cb);

    batch(() => {
      u1(1);
      u2(2);
      u3(3);
    });
    expect(calls).toBe(1);
  });

  it('stabilizes snapshot references within the same revision', () => {
    const s = oin({ a: 1 });
    const v1 = s.snapshot();
    const v2 = s.snapshot();
    expect(v1).toBe(v2);
    s.a(2);
    const v3 = s.snapshot();
    expect(v3).not.toBe(v2);
  });
});

describe('oinDeep', () => {
  it('creates deep nodes (types and runtime)', () => {
    const scope = oinDeep({ user: { name: 'a', age: 1 } });
    expectTypeOf(scope.user.name).toEqualTypeOf<OinUnit<string>>();
    expect(scope.user.name()).toBe('a');
    scope.user.name('b');
    expect(scope.user.name()).toBe('b');
  });
});

describe('derive', () => {
  it('supports type-safe selectors with property access', async () => {
    const scope = oinDeep({ user: { name: 'a', age: 1 } });
    const display = derive(scope, (s) => `${s.user.name} (${s.user.age})`);
    expect(display()).toBe('a (1)');
    const seen: string[] = [];
    const unsub = display.subscribe((v) => seen.push(v));

    scope.user.age(2);
    await Promise.resolve();
    scope.user.name('b');
    await Promise.resolve();

    unsub();
    expect(display()).toBe('b (2)');
    expect(seen).toEqual(['a (2)', 'b (2)']);
  });
});

describe('debug hooks', () => {
  it('onMutation emits per-patch callbacks', () => {
    const scope = oinDeep({ user: { name: 'a', age: 1 } });
    const seen: Array<{ path: OinPath; op: string }> = [];
    const unsub = onMutation(scope, (patch, path) => {
      seen.push({ path, op: patch.op });
    });
    scope.user.name('b');
    scope.user.age(2);
    unsub();
    expect(seen).toContainEqual({ path: ['user', 'name'], op: 'set' });
    expect(seen).toContainEqual({ path: ['user', 'age'], op: 'set' });
  });

  it('onError emits on failed mutations', () => {
    const scope = oinDeep({ user: { name: 'a', age: 1 } });
    const seen: Array<{ path: OinPath; op: string }> = [];
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
});

describe('types', () => {
  it('infers node types', () => {
    const unit = oin(1);
    expectTypeOf(unit).toEqualTypeOf<OinUnit<number>>();

    const array = oin([1, 2, 3]);
    expectTypeOf(array).toEqualTypeOf<OinArrayUnit<number>>();

    const scope = oin({ a: 1 });
    expectTypeOf(scope).toEqualTypeOf<OinScope<{ a: number }>>();

    const derived = formula([unit], (n) => n + 1);
    expectTypeOf(derived()).toEqualTypeOf<number>();
  });

  it('infers tree node types', () => {
    const tree = oinTree({ profile: { age: 1 }, items: [{ count: 1 }] });
    expectTypeOf(tree).toEqualTypeOf<
      OinTreeNode<{ profile: { age: number }; items: { count: number }[] }>
    >();
    expectTypeOf(tree.profile.age).toEqualTypeOf<OinUnit<number>>();
    expectTypeOf(tree.items[0].count).toEqualTypeOf<OinUnit<number>>();
  });
});

describe('formula: unit-level deps and release', () => {
  it('recomputes only when dependent unit changes', () => {
    const user = oinTree({ profile: { name: 'a', age: 1 } });
    let calls = 0;
    const derived = formula([user.profile.age], (a) => {
      calls += 1;
      return a * 2;
    });

    const unsub = derived.subscribe(() => {
      return undefined;
    });
    expect(derived()).toBe(2);
    const before = calls;

    user.profile.name('b');
    expect(calls).toBe(before);

    user.profile.age((v) => v + 1);
    expect(calls).toBeGreaterThan(before);
    expect(derived()).toBe(4);

    unsub();
  });

  it('subscribes and unsubscribes from deps without leaking', () => {
    const user = oinTree({ profile: { age: 1 } });
    const INTERNAL = Symbol.for('@org/oin/internal');
    const unitInternal = (
      user.profile.age as unknown as Record<PropertyKey, unknown>
    )[INTERNAL] as {
      getState: () => { valueListeners: Set<unknown> };
    };
    const base = unitInternal.getState().valueListeners.size;

    const derived = formula([user.profile.age], (a) => a + 1);
    const unsub = derived.subscribe(() => {
      return undefined;
    });
    expect(unitInternal.getState().valueListeners.size).toBe(base + 1);
    unsub();
    expect(unitInternal.getState().valueListeners.size).toBe(base);
  });
});
