import { describe, expect, it } from 'vitest';
import { oin } from '@org/oin';
import { toReadable, toWritable } from './index.js';

describe('@org/oin-svelte', () => {
  it('creates readable and writable stores', () => {
    const unit = oin(1);
    const writable = toWritable(unit);
    const seen: number[] = [];
    const unsub = writable.subscribe((v) => seen.push(v));
    writable.set(2);
    writable.update((v) => v + 1);
    unsub();
    expect(seen).toEqual([1, 2, 3]);

    const readable = toReadable({ snapshot: () => 1, subscribe: (fn) => unit.subscribe(fn) });
    expect(typeof readable.subscribe).toBe('function');
  });
});

