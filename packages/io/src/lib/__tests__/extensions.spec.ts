import { describe, expect, it, vi } from 'vitest';
import { derived } from '../core/derived.js';
import { io } from '../core/io.js';
import { withBehaviors } from '../extensions/with-behaviors.js';
import { schedule } from '../extensions/behaviors/schedule.js';
import { persist } from '../extensions/behaviors/persist.js';
import { devtools } from '../extensions/behaviors/devtools.js';

describe('extensions: behaviors', () => {
  it('schedules subscriber updates', () => {
    const unit = io(0);
    const view = withBehaviors(unit, [schedule('sync')]);
    const seen: number[] = [];
    const unsub = view.subscribe((v) => seen.push(v));
    view(1);
    view(2);
    unsub();
    expect(seen).toEqual([1, 2]);
  });

  it('persists values via storage adapter', () => {
    const unit = io(0);
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
    const unit = io(1);
    const view = withBehaviors(unit, [schedule('sync')]);
    expect(view()).toBe(1);
  });

  it('attaches devtools instance to view extensions', () => {
    const unit = io(0);
    const fake = {};
    const view = withBehaviors(unit, [
      devtools({ target: unit, create: () => fake }),
    ]);
    expect(view.extensions?.devtools).toBe(fake);
  });

  it('forwards destroy to devtools instance', () => {
    const unit = io(0);
    const destroy = vi.fn();
    const view = withBehaviors(unit, [
      devtools({ target: unit, create: () => ({ destroy }) }),
    ]);
    view.destroy?.();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('preserves deep access on tree nodes', () => {
    const state = io({ user: { age: 1 } });
    const view = withBehaviors(state, [schedule('sync')]);
    view.user.age(2);
    expect(view.user.age()).toBe(2);
  });

  it('reflects view methods without exposing read-only setters', () => {
    const unit = io(1);
    const view = withBehaviors(unit, [schedule('sync')]);
    expect('get' in view).toBe(true);
    expect('set' in view).toBe(true);
    expect(Reflect.ownKeys(view)).toContain('get');

    const readOnly = derived(() => unit());
    const roView = withBehaviors(readOnly, [schedule('sync')]);
    expect('set' in roView).toBe(false);
  });
});
