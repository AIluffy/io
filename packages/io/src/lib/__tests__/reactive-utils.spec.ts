import { describe, expect, it, vi } from 'vitest';
import { createSubscriptionManager } from '../utils/core/subscription-manager.js';
import { scheduleTask } from '../utils/reactive/schedule.js';
import { SwapBuffer } from '../utils/reactive/swap-buffer.js';

describe('reactive utils', () => {
  it('createSubscriptionManager triggers activate/deactivate hooks', () => {
    const onActivate = vi.fn();
    const onDeactivate = vi.fn();
    const manager = createSubscriptionManager<number>({ onActivate, onDeactivate });
    const listener = vi.fn();

    const unsub = manager.subscribe(listener);
    manager.emit(1);
    unsub();

    expect(listener).toHaveBeenCalledWith(1);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onDeactivate).toHaveBeenCalledTimes(1);
  });

  it('createSubscriptionManager works without hooks', () => {
    const manager = createSubscriptionManager<number>();
    const listener = vi.fn();
    const unsub = manager.subscribe(listener);

    manager.emit(2);
    unsub();

    expect(listener).toHaveBeenCalledWith(2);
  });

  it('createSubscriptionManager only toggles hooks on first/last subscriber', () => {
    const onActivate = vi.fn();
    const onDeactivate = vi.fn();
    const manager = createSubscriptionManager<number>({ onActivate, onDeactivate });
    const first = vi.fn();
    const second = vi.fn();

    const unsubFirst = manager.subscribe(first);
    const unsubSecond = manager.subscribe(second);
    manager.emit(3);
    unsubFirst();
    unsubSecond();

    expect(first).toHaveBeenCalledWith(3);
    expect(second).toHaveBeenCalledWith(3);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onDeactivate).toHaveBeenCalledTimes(1);
  });

  it('scheduleTask supports sync/microtask/animationFrame branches', async () => {
    const called: string[] = [];

    scheduleTask('sync', () => {
      called.push('sync');
    });
    expect(called).toEqual(['sync']);

    scheduleTask('microtask', () => {
      called.push('microtask');
    });
    await Promise.resolve();
    expect(called).toEqual(['sync', 'microtask']);

    const globalObj = globalThis as Record<string, unknown>;
    const originalRaf = globalObj.requestAnimationFrame as
      | ((cb: () => void) => number)
      | undefined;
    const raf = vi.fn<(cb: () => void) => number>((cb) => {
      cb();
      return 1;
    });
    Object.assign(globalThis as { requestAnimationFrame?: typeof raf }, {
      requestAnimationFrame: raf,
    });
    try {
      scheduleTask('animationFrame', () => {
        called.push('raf');
      });
    } finally {
      Object.assign(globalThis as { requestAnimationFrame?: typeof originalRaf }, {
        requestAnimationFrame: originalRaf,
      });
    }

    expect(raf).toHaveBeenCalledTimes(1);
    expect(called).toEqual(['sync', 'microtask', 'raf']);
  });

  it('SwapBuffer drains pending items and no-ops on empty queue', () => {
    const buffer = new SwapBuffer<string, number>();
    const executed: Array<[string, number]> = [];
    const run = vi.fn((items: Map<string, number>) => {
      executed.push(...Array.from(items.entries()));
    });

    buffer.drain(run);
    expect(run).not.toHaveBeenCalled();

    buffer.set('a', 1);
    buffer.set('b', 2);
    expect(buffer.size).toBe(2);
    expect(buffer.get('a')).toBe(1);

    buffer.drain(run);
    expect(run).toHaveBeenCalledTimes(1);
    expect(executed).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
    expect(buffer.size).toBe(0);
    expect(buffer.get('a')).toBeUndefined();
  });
});
