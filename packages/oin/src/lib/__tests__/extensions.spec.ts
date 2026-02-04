import { describe, expect, it } from 'vitest';
import { oin } from '../core/oin.js';
import { withBehaviors } from '../extensions/with-behaviors.js';
import { schedule } from '../extensions/behaviors/schedule.js';
import { persist } from '../extensions/behaviors/persist.js';
import { devtools } from '../extensions/behaviors/devtools.js';

describe('extensions: behaviors', () => {
  it('schedules subscriber updates', () => {
    const unit = oin(0);
    const view = withBehaviors(unit, [schedule('sync')]);
    const seen: number[] = [];
    const unsub = view.subscribe((v) => seen.push(v));
    view(1);
    view(2);
    unsub();
    expect(seen).toEqual([1, 2]);
  });

  it('persists values via storage adapter', () => {
    const unit = oin(0);
    let stored = '';
    const storage = {
      getItem: () => null,
      setItem: (_key: string, value: string) => {
        stored = value;
      },
    };
    const view = withBehaviors(unit, [persist({ key: 'count', storage })]);
    view(3);
    expect(stored).toBe('3');
  });

  it('reads via callable view', () => {
    const unit = oin(1);
    const view = withBehaviors(unit, [schedule('sync')]);
    expect(view()).toBe(1);
  });

  it('attaches devtools instance to view extensions', () => {
    const unit = oin(0);
    const fake = {};
    const view = withBehaviors(unit, [
      devtools({ target: unit, create: () => fake }),
    ]);
    expect(view.extensions?.devtools).toBe(fake);
  });

  it('preserves deep access on tree nodes', () => {
    const state = oin({ user: { age: 1 } });
    const view = withBehaviors(state, [schedule('sync')]);
    view.user.age(2);
    expect(view.user.age()).toBe(2);
  });
});
