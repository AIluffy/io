import { describe, expect, it } from 'vitest';
import { io } from '../core/io.js';
import { withBehaviors } from '../extensions/with-behaviors.js';
import { schedule } from '../extensions/behaviors/schedule.js';
import { persist } from '../extensions/behaviors/persist.js';
import { devtools } from '../extensions/behaviors/devtools.js';
import { derived } from '../core/derived.js';

describe('extensions: behaviors', () => {
  it('schedules subscriber updates', () => {
    const unit = io(0);
    const view = withBehaviors(unit, [schedule('sync')]);
    const seen: number[] = [];
    const unsub = view.subscribe((v) => seen.push(v));
    view.set?.(1);
    view.set?.(2);
    unsub();
    expect(seen).toEqual([1, 2]);
  });

  it('drops queued microtask callbacks after unsubscribe', async () => {
    const unit = io(0);
    const view = withBehaviors(unit, [schedule('microtask')]);
    const seen: number[] = [];
    const unsub = view.subscribe((v) => seen.push(v));

    view.set?.(1);
    unsub();
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(seen).toEqual([]);
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
    view.set?.(3);
    expect(stored).toBe('3');
  });

  it('reads via view getter', () => {
    const unit = io(1);
    const view = withBehaviors(unit, [schedule('sync')]);
    expect(view.get()).toBe(1);
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
    view.user.age.set(2);
    expect(view.user.age.get()).toBe(2);
  });

  it('reflects view methods without exposing read-only setters', () => {
    const unit = io(1);
    const view = withBehaviors(unit, [schedule('sync')]);
    expect('get' in view).toBe(true);
    expect('set' in view).toBe(true);
    expect(Reflect.ownKeys(view)).toContain('get');

    const readOnly = derived(() => unit.get());
    const roView = withBehaviors(readOnly, [schedule('sync')]);
    expect('set' in roView).toBe(false);
  });
});
