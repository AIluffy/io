import { describe, expect, it, vi } from 'vitest';
import { io } from '@iostore/store';

const capture = {
  onStoreChangeCalls: 0,
  unsubscribe: null as (() => void) | null,
};

vi.mock('@lynx-js/react', () => ({
  useSyncExternalStore: (
    subscribe: (onStoreChange: () => void) => () => void,
    getSnapshot: () => number,
  ) => {
    capture.unsubscribe = subscribe(() => {
      capture.onStoreChangeCalls += 1;
    });
    return getSnapshot();
  },
}));

import { useIO } from '../use-io.js';

function resetCapture() {
  capture.onStoreChangeCalls = 0;
  capture.unsubscribe = null;
}

describe('@iostore/lynx', () => {
  it('batches microtask updates and skips intermediate notifications', async () => {
    resetCapture();
    const count = io(0);

    const value = useIO(count, { schedule: 'microtask' });
    expect(value).toBe(0);

    count.set(1);
    count.set(2);

    expect(capture.onStoreChangeCalls).toBe(0);
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(capture.onStoreChangeCalls).toBe(1);
    capture.unsubscribe?.();
  });

  it('sync schedule emits each update', () => {
    resetCapture();
    const count = io(0);

    const value = useIO(count, { schedule: 'sync' });
    expect(value).toBe(0);

    count.set(1);
    count.set(2);

    expect(capture.onStoreChangeCalls).toBe(2);
    capture.unsubscribe?.();
  });

  it('does not flush stale microtask notifications after unsubscribe', async () => {
    resetCapture();
    const count = io(0);

    useIO(count, { schedule: 'microtask' });

    count.set(1);
    capture.unsubscribe?.();

    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(capture.onStoreChangeCalls).toBe(0);
  });
});
