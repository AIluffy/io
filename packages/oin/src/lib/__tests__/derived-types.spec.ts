import { describe, expectTypeOf, it } from 'vitest';

import { derived } from '../core/derived.js';
import { oin } from '../core/oin.js';
import { computed, state } from '../../experimental.js';
import type { OinDerived } from '../utils/types.js';

describe('derived: type overloads', () => {
  it('infers deps-based derived types', () => {
    const count = oin(1);
    const d = derived([count], (n) => n + 1);
    expectTypeOf(d).toEqualTypeOf<OinDerived<number>>();
    expectTypeOf(d()).toEqualTypeOf<number>();
  });

  it('infers selector-based derived types', () => {
    const scope = oin({ user: { age: 1 } });
    const d = derived(scope, (s) => s.user.age + 1);
    expectTypeOf(d()).toEqualTypeOf<number>();
  });

  it('infers computed-based derived types', () => {
    const d = derived(() => 'ok');
    expectTypeOf(d()).toEqualTypeOf<string>();
  });
});

describe('experimental signals: types', () => {
  it('infers state/computed output types', () => {
    const s = state(1);
    const c = computed(() => s.get() + 1);
    expectTypeOf(s.get()).toEqualTypeOf<number>();
    expectTypeOf(c.get()).toEqualTypeOf<number>();
  });
});
