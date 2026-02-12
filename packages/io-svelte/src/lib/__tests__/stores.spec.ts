import { describe, expect, it } from 'vitest';
import { io } from 'io-store';
import { fromStore } from 'svelte/store';
import { toReadable, toWritable } from '../stores.js';

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

  it('drops queued microtask updates after unsubscribe', async () => {
    const unit = io(0);
    const writable = toWritable(unit, { schedule: 'microtask' });
    const seen: number[] = [];
    const unsub = writable.subscribe((v) => seen.push(v));
    writable.set(1);
    unsub();

    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(seen).toEqual([0]);
  });

  it('works in SSR-like environment without window/document', () => {
    const ioGlobal = globalThis as unknown as {
      window?: unknown;
      document?: unknown;
    };
    const previousWindow = ioGlobal.window;
    const previousDocument = ioGlobal.document;
    delete ioGlobal.window;
    delete ioGlobal.document;

    const unit = io(0);
    const readable = toReadable(unit, { schedule: 'sync' });
    const seen: number[] = [];
    const unsub = readable.subscribe((v) => seen.push(v));
    unit.set(1);
    unsub();

    expect(seen).toEqual([0, 1]);
    ioGlobal.window = previousWindow;
    ioGlobal.document = previousDocument;
  });

  it('is compatible with Svelte 5 runes fromStore', () => {
    const unit = io(1);
    const writable = toWritable(unit, { schedule: 'sync' });
    const runeView = fromStore(writable);

    expect(runeView.current).toBe(1);
    writable.set(2);
    expect(runeView.current).toBe(2);
    unit.set(3);
    expect(runeView.current).toBe(3);
  });
});
