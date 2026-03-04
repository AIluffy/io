import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type EventListener = () => void;

type EventTargetMock = {
  addEventListener: (type: string, listener: EventListener) => void;
  removeEventListener: (type: string, listener: EventListener) => void;
  dispatch: (type: string) => void;
  removeCounts: Map<string, number>;
};

function createEventTargetMock(): EventTargetMock {
  const listeners = new Map<string, Set<EventListener>>();
  const removeCounts = new Map<string, number>();

  return {
    addEventListener: (type, listener) => {
      const current = listeners.get(type) ?? new Set<EventListener>();
      current.add(listener);
      listeners.set(type, current);
    },
    removeEventListener: (type, listener) => {
      const current = listeners.get(type);
      if (!current) {
        return;
      }
      current.delete(listener);
      removeCounts.set(type, (removeCounts.get(type) ?? 0) + 1);
    },
    dispatch: (type) => {
      const current = listeners.get(type);
      if (!current) {
        return;
      }
      for (const listener of current) {
        listener();
      }
    },
    removeCounts,
  };
}

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

beforeEach(() => {
  vi.resetModules();
});

afterEach(async () => {
  const focus = await import('../focus-manager.js');
  const online = await import('../online-manager.js');
  focus.resetFocusManager();
  online.resetOnlineManager();
  vi.resetModules();

  if (originalWindow) {
    Object.defineProperty(globalThis, 'window', originalWindow);
  } else {
    Reflect.deleteProperty(globalThis, 'window');
  }

  if (originalDocument) {
    Object.defineProperty(globalThis, 'document', originalDocument);
  } else {
    Reflect.deleteProperty(globalThis, 'document');
  }

  if (originalNavigator) {
    Object.defineProperty(globalThis, 'navigator', originalNavigator);
  } else {
    Reflect.deleteProperty(globalThis, 'navigator');
  }
});

describe('query manager reset', () => {
  it('creates a fresh FocusManager and detaches old event listeners after reset', async () => {
    const runtimeWindow = createEventTargetMock();
    const runtimeDocument = {
      visibilityState: 'visible',
      ...createEventTargetMock(),
    };

    Object.defineProperty(globalThis, 'window', { value: runtimeWindow, configurable: true });
    Object.defineProperty(globalThis, 'document', { value: runtimeDocument, configurable: true });

    const { getFocusManager, resetFocusManager } = await import('../focus-manager.js');
    const first = getFocusManager();

    const listener = vi.fn();
    first.subscribe(listener);
    runtimeWindow.dispatch('blur');
    expect(listener).toHaveBeenCalledTimes(1);

    resetFocusManager();
    runtimeWindow.dispatch('focus');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(runtimeWindow.removeCounts.get('focus')).toBe(1);
    expect(runtimeWindow.removeCounts.get('blur')).toBe(1);
    expect(runtimeDocument.removeCounts.get('visibilitychange')).toBe(1);

    const second = getFocusManager();
    expect(second).not.toBe(first);
  });

  it('creates a fresh OnlineManager and detaches old event listeners after reset', async () => {
    const runtimeWindow = createEventTargetMock();
    Object.defineProperty(globalThis, 'window', { value: runtimeWindow, configurable: true });
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });

    const { getOnlineManager, resetOnlineManager } = await import('../online-manager.js');
    const first = getOnlineManager();

    const listener = vi.fn();
    first.subscribe(listener);
    runtimeWindow.dispatch('offline');
    expect(listener).toHaveBeenCalledTimes(1);

    resetOnlineManager();
    runtimeWindow.dispatch('online');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(runtimeWindow.removeCounts.get('online')).toBe(1);
    expect(runtimeWindow.removeCounts.get('offline')).toBe(1);

    const second = getOnlineManager();
    expect(second).not.toBe(first);
  });

  it('supports idempotent reset for both managers', async () => {
    const { getFocusManager, resetFocusManager } = await import('../focus-manager.js');
    const { getOnlineManager, resetOnlineManager } = await import('../online-manager.js');

    getFocusManager();
    getOnlineManager();

    expect(() => {
      resetFocusManager();
      resetFocusManager();
      resetOnlineManager();
      resetOnlineManager();
    }).not.toThrow();
  });
});
