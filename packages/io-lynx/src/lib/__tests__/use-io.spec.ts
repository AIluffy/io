import { describe, expect, it, vi } from 'vitest';
import { io } from '@iostore/store';

const capture = {
  onStoreChangeCalls: 0,
  unsubscribe: null as (() => void) | null,
  lastSnapshot: undefined as unknown,
};

vi.mock('@lynx-js/react', () => ({
  useRef: <T,>(initialValue: T) => ({ current: initialValue }),
  useSyncExternalStore: (
    subscribe: (onStoreChange: () => void) => () => void,
    getSnapshot: () => unknown,
  ) => {
    capture.lastSnapshot = getSnapshot();
    capture.unsubscribe = subscribe(() => {
      const nextSnapshot = getSnapshot();
      if (!Object.is(capture.lastSnapshot, nextSnapshot)) {
        capture.onStoreChangeCalls += 1;
        capture.lastSnapshot = nextSnapshot;
      }
    });
    return capture.lastSnapshot;
  },
}));

import { useIO, useIOSelector } from '../use-io.js';

function resetCapture() {
  capture.onStoreChangeCalls = 0;
  capture.unsubscribe = null;
  capture.lastSnapshot = undefined;
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

  it('skips notifications when selector result is unchanged', () => {
    resetCapture();
    const store = io({ count: 0, other: 0 });

    const value = useIOSelector(store, (state) => state.count, {
      schedule: 'sync',
    });
    expect(value).toBe(0);

    store.other.set(1);
    expect(capture.onStoreChangeCalls).toBe(0);

    store.count.set(1);
    expect(capture.onStoreChangeCalls).toBe(1);
    capture.unsubscribe?.();
  });

  it('supports custom selector equality', () => {
    resetCapture();
    const store = io({ count: 0 });

    const value = useIOSelector(
      store,
      (state) => ({ parity: state.count % 2 }),
      {
        schedule: 'sync',
        isEqual: (prev, next) => prev.parity === next.parity,
      },
    );
    expect(value.parity).toBe(0);

    store.count.set(2);
    expect(capture.onStoreChangeCalls).toBe(0);

    store.count.set(3);
    expect(capture.onStoreChangeCalls).toBe(1);
    capture.unsubscribe?.();
  });
});
