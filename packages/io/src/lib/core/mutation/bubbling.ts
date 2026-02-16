import { prependUpdatePath } from '../../utils/patches/patch-path.js';
import type { IoUnsubscribe, IoUpdate } from '../../utils/types/types.js';

const noopUnsubscribe: IoUnsubscribe = () => {
  return undefined;
};

type MaybeSubscribable = Partial<{
  subscribe: (fn: (v: unknown) => void) => IoUnsubscribe;
  subscribeUpdate: (fn: (u: IoUpdate) => void) => IoUnsubscribe;
}>;

export function subscribeKeyedChild(
  child: unknown,
  key: PropertyKey,
  handlers: {
    onValue?: () => void;
    onUpdate?: (u: IoUpdate) => void;
  },
): { valueUnsub: IoUnsubscribe; updateUnsub: IoUnsubscribe } {
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
  resolveIndices: (child: unknown) => number[],
  handlers: {
    onValue?: (indices: number[]) => void;
    onUpdate?: (u: IoUpdate, indices: number[]) => void;
  },
): { valueUnsub: IoUnsubscribe; updateUnsub: IoUnsubscribe } {
  const maybe = child as MaybeSubscribable;

  const valueUnsub =
    typeof maybe.subscribe === 'function' && handlers.onValue
      ? maybe.subscribe(() => handlers.onValue?.(resolveIndices(child)))
      : noopUnsubscribe;

  const updateUnsub =
    typeof maybe.subscribeUpdate === 'function' && handlers.onUpdate
      ? maybe.subscribeUpdate((u) => {
          const indices = resolveIndices(child).filter((i) => i >= 0);
          if (indices.length === 0) return;
          handlers.onUpdate?.(u, indices);
        })
      : noopUnsubscribe;

  return { valueUnsub, updateUnsub };
}
