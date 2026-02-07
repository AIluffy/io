import { describe, expect, it } from 'vitest';
import { io } from 'io-store';
import { toReadable, toWritable } from './index.js';

describe('@org/io-svelte', () => {
  it('creates readable and writable stores', async () => {
    const unit = io(1);
    const writable = toWritable(unit);
    const seen: number[] = [];
    const unsub = writable.subscribe((v) => seen.push(v));
    writable.set(2);
    writable.update((v) => v + 1);
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    unsub();
    expect(seen).toEqual([1, 2, 3]);

    const readable = toReadable(
      { snapshot: () => 1, subscribe: (fn) => unit.subscribe(fn) },
    );
    expect(typeof readable.subscribe).toBe('function');
  });

  it('supports sync schedule for readable stores', () => {
    const unit = io(0);
    const readable = toReadable(unit, { schedule: 'sync' });
    const seen: number[] = [];
    const unsub = readable.subscribe((v) => seen.push(v));
    unit.set(2);
    unsub();
    expect(seen).toEqual([0, 2]);
  });

  it('supports microtask schedule for writable stores', async () => {
    const unit = io(0);
    const writable = toWritable(unit, { schedule: 'microtask' });
    const seen: number[] = [];
    const unsub = writable.subscribe((v) => seen.push(v));
    writable.set(1);
    expect(seen).toEqual([0]);
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    unsub();
    expect(seen).toEqual([0, 1]);
  });
});
