import { getInternal, INTERNAL } from '../../../utils/internal/internal-access.js';
import { isIndexKey } from '../../../utils/internal/is-index-key.js';

type Getter = { get: () => unknown };
type ArrayGetter = { get: () => unknown[] };

const proxyCache = new WeakMap<object, unknown>();

function asObjectKey(prop: PropertyKey): prop is string | symbol {
  return typeof prop === 'string' || typeof prop === 'symbol';
}

function readFromGetter(value: unknown): unknown {
  return (value as Getter).get();
}

export function getValueView<T>(node: unknown): T {
  if (node === null || node === undefined) return node as T;
  const t = typeof node;
  if (t !== 'object' && t !== 'function') return node as T;

  const internal = getInternal(node);
  if (internal?.kind === 'unit' || internal?.kind === 'derived') {
    return readFromGetter(node) as T;
  }

  const obj = node as object;
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
        const arr = (target as ArrayGetter).get();
        return arr.length;
      }

      const child = Reflect.get(target, prop, receiver);
      const childInternal = getInternal(child);
      if (childInternal?.kind === 'unit' || childInternal?.kind === 'derived') {
        return readFromGetter(child);
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
