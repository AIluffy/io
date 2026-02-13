import { describe, expect, it } from 'vitest';
import { io } from '@iostore/store';
import { createRoot } from 'solid-js';

import { useIO } from '../adapters.js';

describe('@iostore/solid', () => {
  it('exports adapters', () => {
    expect(typeof useIO).toBe('function');
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
});
