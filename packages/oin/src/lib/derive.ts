import type {
  OinDerived,
  OinNode,
  OinTreeNode,
  OinUnsubscribe,
  UnwrapOin,
} from './types.js';
import { computed, effect } from './signals.js';
import { snapshotValue } from './snapshot.js';

const INTERNAL = Symbol.for('@org/oin/internal');

type Internal = { kind: 'array' | 'unit' | 'scope' | 'derived' };

function getInternal(value: unknown): Internal | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'function' && typeof value !== 'object')
    return undefined;
  const internal = (value as unknown as Record<PropertyKey, unknown>)[INTERNAL];
  if (typeof internal !== 'object' || internal === null) return undefined;
  const kind = (internal as { kind?: unknown }).kind;
  if (
    kind === 'array' ||
    kind === 'unit' ||
    kind === 'scope' ||
    kind === 'derived'
  )
    return { kind };
  return undefined;
}

const proxyCache = new WeakMap<object, unknown>();

function asObjectKey(prop: PropertyKey): prop is string | symbol {
  return typeof prop === 'string' || typeof prop === 'symbol';
}

function isIndexKey(prop: PropertyKey): prop is string {
  return typeof prop === 'string' && /^[0-9]+$/.test(prop);
}

function getValueView<T>(node: unknown): T {
  if (node === null || node === undefined) return node as T;
  const t = typeof node;
  if (t !== 'object' && t !== 'function') return node as T;

  const internal = getInternal(node);
  if (internal?.kind === 'unit' || internal?.kind === 'derived') {
    return (node as unknown as { (): unknown })() as T;
  }

  const obj = node as unknown as object;
  const cached = proxyCache.get(obj);
  if (cached) return cached as T;

  const proxy = new Proxy(obj as object, {
    get(target, prop, receiver) {
      if (!asObjectKey(prop)) return Reflect.get(target, prop, receiver);
      if (prop === INTERNAL) return undefined;

      if (isIndexKey(prop)) {
        const child = Reflect.get(target, prop, receiver);
        return getValueView(child);
      }

      if (
        typeof prop === 'string' &&
        prop === 'length' &&
        internal?.kind === 'array'
      ) {
        const arr = (target as unknown as { (): unknown[] })();
        return arr.length;
      }

      const child = Reflect.get(target, prop, receiver);
      const childInternal = getInternal(child);
      if (childInternal?.kind === 'unit' || childInternal?.kind === 'derived') {
        return (child as unknown as { (): unknown })();
      }
      if (childInternal?.kind === 'scope' || childInternal?.kind === 'array') {
        return getValueView(child);
      }
      return child;
    },
  });

  proxyCache.set(obj, proxy);
  return proxy as T;
}

export function derive<T, R>(
  node: OinNode<T> | OinTreeNode<T>,
  selector: (state: UnwrapOin<T>) => R
): OinDerived<R> {
  const c = computed(() => selector(getValueView<UnwrapOin<T>>(node)));
  const listeners = new Set<(value: R) => void>();
  let stop: OinUnsubscribe | undefined;
  let current = c.get();

  const derived = function () {
    return c.get();
  } as OinDerived<R>;

  const snapshot = (): R => snapshotValue(c.get());

  const subscribe = (fn: (v: R) => void): OinUnsubscribe => {
    listeners.add(fn);
    if (listeners.size === 1) {
      stop = effect(() => {
        const next = c.get();
        if (Object.is(current, next)) return;
        current = next;
        for (const l of listeners) l(next);
      });
    }
    return () => {
      listeners.delete(fn);
      if (listeners.size === 0) {
        stop?.();
        stop = undefined;
      }
    };
  };

  Object.defineProperties(derived, {
    snapshot: { value: snapshot },
    subscribe: { value: subscribe },
    [INTERNAL]: { value: { kind: 'derived' } },
  });

  return derived;
}
