import { describe, expect, it } from 'vitest';
import { io } from '@iostore/store';
import { createRoot } from 'solid-js';

import { useIO, useIOSelector } from '../adapters.js';

describe('@iostore/solid', () => {
  it('exports adapters', () => {
    expect(typeof useIO).toBe('function');
    expect(typeof useIOSelector).toBe('function');
  });

  it('supports updates', async () => {
    let dispose: () => void = () => undefined;
    let state: (() => number) | undefined;

    createRoot((rootDispose) => {
      dispose = rootDispose;
      const count = io(0);
      state = useIO(count);
      expect(state()).toBe(0);
      count.set(2);
    });

    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(state?.()).toBe(2);
    dispose();
  });

  it('supports sync schedule', () => {
    createRoot((dispose) => {
      const count = io(0);
      const state = useIO(count, { schedule: 'sync' });
      count.set(5);
      expect(state()).toBe(5);
      dispose();
    });
  });

  it('drops queued microtask updates after root dispose', async () => {
    let state: (() => number) | undefined;
    let countRef: { get(): number } | undefined;

    createRoot((dispose) => {
      const count = io(0);
      countRef = count;
      state = useIO(count, { schedule: 'microtask' });
      count.set(1);
      expect(state()).toBe(0);
      dispose();
    });

    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(countRef?.get()).toBe(1);
    expect(state?.()).toBe(0);
  });

  it('skips selector updates when selected value is unchanged', () => {
    createRoot((dispose) => {
      const store = io({ count: 0, label: 'a' });
      const selected = useIOSelector(store, (state) => state.count, {
        schedule: 'sync',
      });
      expect(selected()).toBe(0);
      store.label.set('b');
      expect(selected()).toBe(0);
      store.count.set(1);
      expect(selected()).toBe(1);
      dispose();
    });
  });

  it('supports custom selector equality', () => {
    createRoot((dispose) => {
      const store = io({ values: [1, 2] });
      const selected = useIOSelector(
        store,
        (state) => [...state.values],
        {
          schedule: 'sync',
          isEqual: (prev, next) =>
            prev.length === next.length &&
            prev.every((value, index) => value === next[index]),
        },
      );

      const first = selected();
      store.values.set([1, 2]);
      expect(selected()).toBe(first);
      store.values.set([1, 2, 3]);
      expect(selected()).not.toBe(first);
      dispose();
    });
  });
});
