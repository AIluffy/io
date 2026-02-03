import { describe, expect, it } from 'vitest';
import { oin } from '@oin/store';
import { toReadable, toWritable } from './index.js';

describe('@org/oin-svelte', () => {
  it('creates readable and writable stores', () => {
    const unit = oin(1);
    const writable = toWritable(unit, { schedule: 'sync' });
    const seen: number[] = [];
    const unsub = writable.subscribe((v) => seen.push(v));
    writable.set(2);
    writable.update((v) => v + 1);
    unsub();
    expect(seen).toEqual([1, 2, 3]);

    const readable = toReadable(
      { snapshot: () => 1, subscribe: (fn) => unit.subscribe(fn) },
      { schedule: 'sync' }
    );
    expect(typeof readable.subscribe).toBe('function');
  });

  it('respects ssr option', () => {
    const unit = oin(0);
    const readable = toReadable(unit, { ssr: true });
    const seen: number[] = [];
    const unsub = readable.subscribe((v) => seen.push(v));
    unit(1);
    unsub();
    expect(seen).toEqual([0]);
  });
});
