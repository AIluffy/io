import { describe, expect, it } from 'vitest';
import { io } from '../core/api/io.js';
import { withBehaviors } from '../extensions/with-behaviors.js';
import { schedule } from '../extensions/behaviors/schedule.js';
import { throttle } from '../extensions/behaviors/throttle.js';
import { debounce } from '../extensions/behaviors/debounce.js';
import { effect as effectBehavior } from '../extensions/behaviors/effect.js';
import { persist } from '../extensions/behaviors/persist.js';
import { devtools } from '../extensions/behaviors/devtools.js';
import { derived } from '../core/api/derived.js';

type MockWritableNode<T> = {
  get: () => T;
  set: (next: T | ((prev: T) => T)) => void;
  subscribe: (fn: (value: T) => void) => () => void;
  snapshot: () => T;
};

function createMockWritableNode<T>(initial: T): MockWritableNode<T> {
  let current = initial;
  const listeners = new Set<(value: T) => void>();

  return {
    get: () => current,
    set: (next) => {
      current = typeof next === 'function' ? (next as (prev: T) => T)(current) : next;
      for (const listener of listeners) listener(current);
    },
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    snapshot: () => current,
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

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

  it('throttles subscription updates with trailing flush', () => {
    vi.useFakeTimers();
    try {
      const unit = io(0);
      const view = withBehaviors(unit, [throttle(50)]);
      const seen: number[] = [];
      const unsub = view.subscribe((value) => seen.push(value));

      view.set?.(1);
      view.set?.(2);
      view.set?.(3);

      expect(seen).toEqual([1]);

      vi.advanceTimersByTime(49);
      expect(seen).toEqual([1]);
      vi.advanceTimersByTime(1);
      expect(seen).toEqual([1, 3]);

      view.set?.(4);
      expect(seen).toEqual([1, 3]);
      vi.advanceTimersByTime(50);
      expect(seen).toEqual([1, 3, 4]);
      unsub();
    } finally {
      vi.useRealTimers();
    }
  });

  it('debounces subscription updates', () => {
    vi.useFakeTimers();
    try {
      const unit = io(0);
      const view = withBehaviors(unit, [debounce(30)]);
      const seen: number[] = [];
      const unsub = view.subscribe((value) => seen.push(value));

      view.set?.(1);
      view.set?.(2);
      view.set?.(3);

      expect(seen).toEqual([]);
      vi.advanceTimersByTime(29);
      expect(seen).toEqual([]);
      vi.advanceTimersByTime(1);
      expect(seen).toEqual([3]);

      unsub();
    } finally {
      vi.useRealTimers();
    }
  });

  it('runs effect behavior and cleans up on rerun/destroy', () => {
    const unit = io(0);
    const calls: Array<number | undefined> = [];
    const cleaned: number[] = [];
    const view = withBehaviors(unit, [
      effectBehavior((value, previous) => {
        calls.push(previous);
        return () => {
          cleaned.push(value);
        };
      }),
    ]);

    expect(calls).toEqual([undefined]);
    view.set?.(1);
    view.set?.(2);

    expect(calls).toEqual([undefined, 0, 1]);
    expect(cleaned).toEqual([0, 1]);

    view.destroy?.();
    expect(cleaned).toEqual([0, 1, 2]);
  });

  it('composes throttle with effect behavior', () => {
    vi.useFakeTimers();
    try {
      const unit = io(0);
      const seen: number[] = [];
      withBehaviors(unit, [
        throttle(40),
        effectBehavior((value) => {
          seen.push(value);
        }, { immediate: false }),
      ]);

      unit.set(1);
      unit.set(2);
      unit.set(3);

      expect(seen).toEqual([1]);
      vi.advanceTimersByTime(40);
      expect(seen).toEqual([1, 3]);
    } finally {
      vi.useRealTimers();
    }
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

  it('hydrates from async storage and persists async writes', async () => {
    const unit = io(0);
    let stored = '';
    const storage = {
      getItem: async () => '2',
      setItem: async (_key: string, value: string) => {
        stored = value;
      },
    };
    const view = withBehaviors(unit, [persist({ key: 'count', storage })]);

    expect(unit.get()).toBe(0);
    await flushPromises();
    expect(unit.get()).toBe(2);

    view.set?.(3);
    await flushPromises();
    expect(stored).toBe('3');
  });

  it('does not let async hydration override local writes', async () => {
    const unit = io(0);
    let resolveHydrate: (value: string | null) => void = () => undefined;
    const storage = {
      getItem: () =>
        new Promise<string | null>((resolve) => {
          resolveHydrate = resolve;
        }),
      setItem: () => undefined,
    };
    const view = withBehaviors(unit, [persist({ key: 'count', storage })]);

    view.set?.(1);
    resolveHydrate('5');
    await flushPromises();

    expect(unit.get()).toBe(1);
  });

  it('keeps current state on version mismatch and rewrites storage', () => {
    const unit = io(0);
    let persistedRaw = '';
    const storage = {
      getItem: () =>
        JSON.stringify({
          __iostore_persist_v1__: true,
          version: 1,
          state: 10,
        }),
      setItem: (_key: string, value: string) => {
        persistedRaw = value;
      },
    };
    const view = withBehaviors(
      unit,
      [persist({ key: 'count', storage, version: 2 })],
    );

    expect(unit.get()).toBe(0);

    const hydratedPayload = JSON.parse(persistedRaw) as {
      __iostore_persist_v1__: boolean;
      version: number;
      state: number;
    };
    expect(hydratedPayload.__iostore_persist_v1__).toBe(true);
    expect(hydratedPayload.version).toBe(2);
    expect(hydratedPayload.state).toBe(0);

    view.set?.(7);
    const updatedPayload = JSON.parse(persistedRaw) as {
      __iostore_persist_v1__: boolean;
      version: number;
      state: number;
    };
    expect(updatedPayload.__iostore_persist_v1__).toBe(true);
    expect(updatedPayload.version).toBe(2);
    expect(updatedPayload.state).toBe(7);
  });

  it('supports partialize and merge for writable nodes', () => {
    const node = createMockWritableNode({ count: 0, temp: 'keep' });
    let persistedRaw = '';
    const storage = {
      getItem: () => JSON.stringify({ count: 4 }),
      setItem: (_key: string, value: string) => {
        persistedRaw = value;
      },
    };
    const view = withBehaviors(
      node,
      [
        persist({
          key: 'state',
          storage,
          partialize: (value) => ({ count: (value as { count: number }).count }),
          merge: (persisted, current) => ({
            ...(current as Record<string, unknown>),
            ...(persisted as Record<string, unknown>),
          }),
        }),
      ],
    );

    expect(view.get()).toEqual({ count: 4, temp: 'keep' });

    view.set?.({ count: 5, temp: 'next' });
    expect(JSON.parse(persistedRaw)).toEqual({ count: 5 });
  });

  it('throttles persistence writes', () => {
    vi.useFakeTimers();
    try {
      const unit = io(0);
      const setItem = vi.fn();
      const storage = {
        getItem: () => null,
        setItem,
      };
      const view = withBehaviors(
        unit,
        [persist({ key: 'count', storage, throttleMs: 50 })],
      );

      view.set?.(1);
      view.set?.(2);
      view.set?.(3);

      expect(setItem).not.toHaveBeenCalled();
      vi.advanceTimersByTime(49);
      expect(setItem).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(setItem).toHaveBeenCalledTimes(1);
      expect(setItem).toHaveBeenCalledWith('count', '3');
    } finally {
      vi.useRealTimers();
    }
  });

  it('subscribes to external sync events and cleans up on destroy', () => {
    const node = createMockWritableNode(0);
    let onChange: ((raw: string | null) => void) | undefined;
    const unsubscribe = vi.fn();
    const storage = {
      getItem: () => null,
      setItem: () => undefined,
      subscribe: (_key: string, cb: (raw: string | null) => void) => {
        onChange = cb;
        return unsubscribe;
      },
    };

    const view = withBehaviors(
      node,
      [persist({ key: 'count', storage, syncTabs: true })],
    );

    onChange?.('5');
    expect(view.get()).toBe(5);

    view.destroy?.();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
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
