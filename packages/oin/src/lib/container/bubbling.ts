import type { OinUnsubscribe, OinUpdate } from '../utils/types.js';

import { prependUpdatePath } from '../utils/patch-path.js';

const noopUnsubscribe: OinUnsubscribe = () => {
  return undefined;
};

type MaybeSubscribable = Partial<{
  subscribe: (fn: (v: unknown) => void) => OinUnsubscribe;
  subscribeUpdate: (fn: (u: OinUpdate) => void) => OinUnsubscribe;
}>;

export function subscribeKeyedChild(
  child: unknown,
  key: PropertyKey,
  handlers: {
    onValue?: () => void;
    onUpdate?: (u: OinUpdate) => void;
  },
): { valueUnsub: OinUnsubscribe; updateUnsub: OinUnsubscribe } {
  const maybe = child as MaybeSubscribable;

  const valueUnsub =
    typeof maybe.subscribe === 'function' && handlers.onValue
      ? maybe.subscribe(() => handlers.onValue?.())
      : noopUnsubscribe;

  const updateUnsub =
    typeof maybe.subscribeUpdate === 'function' && handlers.onUpdate
      ? maybe.subscribeUpdate((u) => handlers.onUpdate?.(prependUpdatePath(key, u)))
      : noopUnsubscribe;

  return { valueUnsub, updateUnsub };
}

export function subscribeIndexedChild(
  child: unknown,
  resolveIndex: (child: unknown) => number,
  handlers: {
    onValue?: () => void;
    onUpdate?: (u: OinUpdate, index: number) => void;
  },
): { valueUnsub: OinUnsubscribe; updateUnsub: OinUnsubscribe } {
  const maybe = child as MaybeSubscribable;

  const valueUnsub =
    typeof maybe.subscribe === 'function' && handlers.onValue
      ? maybe.subscribe(() => handlers.onValue?.())
      : noopUnsubscribe;

  const updateUnsub =
    typeof maybe.subscribeUpdate === 'function' && handlers.onUpdate
      ? maybe.subscribeUpdate((u) => {
          const index = resolveIndex(child);
          if (index < 0) return;
          handlers.onUpdate?.(prependUpdatePath(index, u), index);
        })
      : noopUnsubscribe;

  return { valueUnsub, updateUnsub };
}