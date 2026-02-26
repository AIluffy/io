import { describe, expectTypeOf, it } from 'vitest';

import { derived } from '../core/api/derived.js';
import { io } from '../core/api/io.js';
import { computed, state } from '../utils/reactive/signals.js';
import type { IoDerived, IoPathOf, IoPathValue, Path } from '../utils/types/types.js';

describe('derived: type overloads', () => {
  it('infers deps-based derived types', () => {
    const count = io(1);
    const d = derived([count], (n) => n + 1);
    expectTypeOf(d).toEqualTypeOf<IoDerived<number>>();
    expectTypeOf(d.get()).toEqualTypeOf<number>();
  });

  it('infers selector-based derived types', () => {
    const scope = io({ user: { age: 1 } });
    const d = derived(scope, (s) => s.user.age + 1);
    expectTypeOf(d.get()).toEqualTypeOf<number>();
  });

  it('infers computed-based derived types', () => {
    const d = derived(() => 'ok');
    expectTypeOf(d.get()).toEqualTypeOf<string>();
  });
});

describe('signals: types', () => {
  it('infers state/computed output types', () => {
    const s = state(1);
    const c = computed(() => s.get() + 1);
    expectTypeOf(s.get()).toEqualTypeOf<number>();
    expectTypeOf(c.get()).toEqualTypeOf<number>();
  });
});

describe('paths: depth-limited inference', () => {
  it('limits path and value depth', () => {
    type Obj = { a: { b: { c: number } } };
    type P1 = IoPathOf<Obj, 1>;
    type P2 = Path<Obj, 2>;
    type V1 = IoPathValue<Obj, ['a', 'b'], 2>;
    type V2 = IoPathValue<Obj, ['a', 'b', 'c'], 2>;

    expectTypeOf<P1>().toEqualTypeOf<[] | ['a']>();
    expectTypeOf<P2>().toEqualTypeOf<[] | ['a'] | ['a', 'b']>();
    expectTypeOf<V1>().toEqualTypeOf<{ c: number }>();
    expectTypeOf<V2>().toEqualTypeOf<unknown>();
  });
});
