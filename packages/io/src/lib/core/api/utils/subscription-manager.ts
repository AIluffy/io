import type { IoUnsubscribe } from '../../../utils/types/types.js';

export function createSubscriptionManager<T>(options?: {
  onActivate?: () => void;
  onDeactivate?: () => void;
}): {
  subscribe: (fn: (value: T) => void) => IoUnsubscribe;
  emit: (value: T) => void;
} {
  const listeners = new Set<(value: T) => void>();

  const subscribe = (fn: (value: T) => void): IoUnsubscribe => {
    listeners.add(fn);
    if (listeners.size === 1) options?.onActivate?.();
    return () => {
      listeners.delete(fn);
      if (listeners.size === 0) options?.onDeactivate?.();
    };
  };

  const emit = (value: T): void => {
    for (const listener of listeners) listener(value);
  };

  return { subscribe, emit };
}
