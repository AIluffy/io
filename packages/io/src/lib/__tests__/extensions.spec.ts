import { describe, expect, it } from 'vitest';
import { io } from '../core/api/io.js';
import { withBehaviors } from '../extensions/with-behaviors.js';
import { schedule } from '../extensions/behaviors/schedule.js';
import { persist } from '../extensions/behaviors/persist.js';
import { devtools } from '../extensions/behaviors/devtools.js';
import { derived } from '../core/api/derived.js';

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

  it('reports hydrate failures from corrupt storage data', () => {
    const unit = io(0);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const onError = vi.fn();
    const storage = {
      getItem: () => '{broken json',
      setItem: () => undefined,
    };

    withBehaviors(unit, [persist({ key: 'count', storage, onError })]);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][1]).toBe('hydrate');
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('reports persist failures from storage write errors', () => {
    const unit = io(0);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const onError = vi.fn();
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    };
    const view = withBehaviors(unit, [
      persist({ key: 'count', storage, onError }),
    ]);

    view.set?.(1);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][1]).toBe('persist');
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('uses global localStorage when custom storage is omitted', () => {
    const unit = io(0);
    let stored = '';
    const globalObj = globalThis as Record<string, unknown>;
    const previous = globalObj.localStorage;
    globalObj.localStorage = {
      getItem: () => null,
      setItem: (_key: string, value: string) => {
        stored = value;
      },
    };

    try {
      const view = withBehaviors(unit, [persist({ key: 'count' })]);
      view.set?.(4);
      expect(stored).toBe('4');
    } finally {
      globalObj.localStorage = previous;
    }
  });

  it('skips persistence when storage is unavailable', () => {
    const unit = io(1);
    const globalObj = globalThis as Record<string, unknown>;
    const previous = globalObj.localStorage;
    delete globalObj.localStorage;

    try {
      const view = withBehaviors(unit, [persist({ key: 'count' })]);
      view.set?.(2);
      expect(unit.get()).toBe(2);
    } finally {
      globalObj.localStorage = previous;
    }
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

  it('adapts plain writable nodes and preserves node properties on proxy', () => {
    let value = 1;
    const node = {
      label: 'counter',
      get: () => value,
      set: (next: number | ((prev: number) => number)) => {
        value = typeof next === 'function' ? next(value) : next;
      },
      subscribe: () => () => undefined,
      snapshot: () => value,
    };

    const view = withBehaviors(node, []);
    view.set?.((prev) => prev + 1);

    expect(view.get()).toBe(2);
    expect(view.snapshot?.()).toBe(2);
    expect(view.label).toBe('counter');
    expect(Reflect.ownKeys(view)).toContain('label');
    expect(Object.getOwnPropertyDescriptor(view, 'get')?.writable).toBe(false);
  });

  it('reads from snapshot when adapting snapshot-only nodes', () => {
    const node = {
      value: 5,
      snapshot() {
        return this.value;
      },
      subscribe: () => () => undefined,
    };

    const view = withBehaviors(node, []);
    expect(view.get()).toBe(5);
    expect(view.snapshot?.()).toBe(5);
  });

  it('throws when adapting a node that is not readable', () => {
    const view = withBehaviors(
      {
        subscribe: () => () => undefined,
      } as never,
      [],
    );

    expect(() => view.get()).toThrow('withBehaviors: node is not readable');
  });

  it('throws when adapting a node that is not subscribable', () => {
    const view = withBehaviors(
      {
        get: () => 1,
      } as never,
      [],
    );

    expect(() => view.subscribe(() => undefined)).toThrow();
  });

  it('uses captured setter when writable node changes after adaptation', () => {
    let calls = 0;
    const node: {
      snapshot(): number;
      subscribe(fn: (value: number) => void): () => void;
      set?: (next: number | ((prev: number) => number)) => void;
    } = {
      snapshot: () => 1,
      subscribe: () => () => undefined,
      set: () => {
        calls += 1;
      },
    };

    const view = withBehaviors(node, []);
    delete node.set;

    view.set?.(2);
    expect(calls).toBe(1);
  });

  it('falls back to behavior-added target properties in proxy traps', () => {
    const node = {
      get: () => 1,
      subscribe: () => () => undefined,
      extraFromNode: 'node',
    };
    const view = withBehaviors(node, [
      (input) => {
        const enhanced = Object.create(input) as typeof input & {
          fromBehavior?: string;
          locked?: string;
        };
        Object.defineProperty(enhanced, 'fromBehavior', {
          value: 'behavior',
          configurable: true,
          enumerable: true,
          writable: false,
        });
        Object.defineProperty(enhanced, 'locked', {
          value: 'sealed',
          configurable: false,
          enumerable: true,
          writable: false,
        });
        return enhanced;
      },
    ]);

    expect((view as { fromBehavior?: string }).fromBehavior).toBe('behavior');
    expect('fromBehavior' in view).toBe(true);
    expect('missing' in view).toBe(false);
    expect(Object.getOwnPropertyDescriptor(view, 'locked')?.configurable).toBe(
      false,
    );
    expect(
      Object.getOwnPropertyDescriptor(view, 'fromBehavior')?.value,
    ).toBe('behavior');
  });
});
