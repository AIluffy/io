import { describe, expect, it, vi } from 'vitest';
import { computed, effect, state, trackRead } from '../utils/reactive/signals.js';

describe('signals/runtime branches', () => {
  it('trackRead is a no-op without active tracking context', () => {
    const dep = {
      subscribe: () => () => undefined,
    };
    expect(() => trackRead(dep)).not.toThrow();
  });

  it('does not run scheduled effect after dispose before microtask flush', async () => {
    const s = state(0);
    let runs = 0;
    const stop = effect(() => {
      runs += 1;
      s.get();
    });

    s.set(1);
    stop();
    await Promise.resolve();

    expect(runs).toBe(1);
  });

  it('allows disposer to be called repeatedly', () => {
    const stop = effect(() => undefined);
    expect(() => stop()).not.toThrow();
    expect(() => stop()).not.toThrow();
  });

  it('queues only one microtask flush for multiple effects', async () => {
    const s = state(0);
    const a = vi.fn(() => {
      s.get();
    });
    const b = vi.fn(() => {
      s.get();
    });
    const stopA = effect(a);
    const stopB = effect(b);

    s.set(1);
    await Promise.resolve();
    stopA();
    stopB();

    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it('notifies computed listeners only once while already dirty', () => {
    const s = state(1);
    const c = computed(() => s.get() * 2);
    const listener = vi.fn();
    c.subscribe(listener);
    c.get();

    s.set(2);
    s.set(3);

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
