import type { IoDerived, IoUnit } from '../utils/types/types.js';
import type { IoBehavior, IoView } from './types.js';

type WithBehaviorsNode<T> = object & {
  subscribe(fn: (v: T) => void): () => void;
} & ({ get(): T } | { snapshot(): T }) & {
    set?(next: T | ((prev: T) => T)): void;
  };

type IoLike<T> = IoUnit<T> | IoDerived<T> | WithBehaviorsNode<T>;

type ValueOfNode<N> = N extends { snapshot(): infer T }
  ? T
  : N extends { get(): infer T }
    ? T
    : never;

function isView<T>(value: unknown): value is IoView<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as IoView<T>).get === 'function' &&
    typeof (value as IoView<T>).subscribe === 'function'
  );
}

function isWritable<T>(node: IoLike<T>): node is IoUnit<T> {
  return typeof (node as { set?: unknown }).set === 'function';
}

function adaptIo<T>(node: IoLike<T>): IoView<T> {
  const hasGet = typeof (node as { get?: unknown }).get === 'function';
  const hasSnapshot =
    typeof (node as { snapshot?: unknown }).snapshot === 'function';
  const subscribeImpl = (node as { subscribe: (fn: (v: T) => void) => () => void })
    .subscribe;
  const setImpl = isWritable(node)
    ? (
        node as { set: (value: T | ((prev: T) => T)) => void }
      ).set
    : undefined;
  const get = () => {
    if (hasGet) return (node as { get: () => T }).get();
    if (hasSnapshot) return (node as { snapshot: () => T }).snapshot();
    throw new Error('withBehaviors: node is not readable');
  };
  const subscribe = (fn: (v: T) => void) => subscribeImpl(fn);
  const set = (next: T | ((prev: T) => T)) => {
    if (!setImpl) throw new Error('withBehaviors: node is read-only');
    setImpl(next);
  };
  return {
    get,
    set: setImpl ? set : undefined,
    subscribe,
    snapshot: hasSnapshot
      ? () => (node as { snapshot: () => T }).snapshot()
      : undefined,
  };
}

function createViewProxy<T, N extends object>(
  view: IoView<T>,
  node: N,
): N & IoView<T> {
  const overrides = new Map<string | symbol, unknown>([
    ['get', view.get],
    ['subscribe', view.subscribe],
  ]);
  if (view.set !== undefined) overrides.set('set', view.set);
  if (view.snapshot !== undefined) overrides.set('snapshot', view.snapshot);
  if (view.extensions !== undefined) overrides.set('extensions', view.extensions);
  if (view.destroy !== undefined) overrides.set('destroy', view.destroy);

  return new Proxy(view as IoView<T> & object, {
    get(target, prop, receiver) {
      if (overrides.has(prop)) return overrides.get(prop);
      if (Reflect.has(node as object, prop))
        return Reflect.get(node as object, prop, receiver);
      return Reflect.get(target, prop, receiver);
    },
    has(target, prop) {
      if (overrides.has(prop)) return overrides.get(prop) !== undefined;
      return Reflect.has(node as object, prop) || Reflect.has(target, prop);
    },
    ownKeys(target) {
      const keys = new Set<string | symbol>([
        ...Reflect.ownKeys(target),
        ...Reflect.ownKeys(node as object),
      ]);
      for (const key of overrides.keys()) keys.add(key);
      return Array.from(keys);
    },
    getOwnPropertyDescriptor(target, prop) {
      if (overrides.has(prop)) {
        return {
          configurable: true,
          enumerable: false,
          writable: false,
          value: overrides.get(prop),
        };
      }
      return (
        Object.getOwnPropertyDescriptor(node as object, prop) ??
        Object.getOwnPropertyDescriptor(target, prop)
      );
    },
  }) as N & IoView<T>;
}

function normalizeView<T>(baseView: IoView<T>, enhanced: IoView<T>): IoView<T> {
  const normalized = Object.create(
    Object.getPrototypeOf(enhanced),
  ) as IoView<T>;
  Object.defineProperties(
    normalized,
    Object.getOwnPropertyDescriptors(enhanced),
  );

  const getImpl =
    typeof enhanced.get === 'function' ? enhanced.get.bind(enhanced) : baseView.get;
  Object.defineProperty(normalized, 'get', {
    configurable: true,
    enumerable: false,
    writable: false,
    value: getImpl,
  });

  const subscribeImpl =
    typeof enhanced.subscribe === 'function'
      ? enhanced.subscribe.bind(enhanced)
      : baseView.subscribe.bind(baseView);
  Object.defineProperty(normalized, 'subscribe', {
    configurable: true,
    enumerable: false,
    writable: false,
    value: subscribeImpl,
  });

  const setImpl =
    typeof enhanced.set === 'function'
      ? enhanced.set.bind(enhanced)
      : typeof baseView.set === 'function'
        ? baseView.set.bind(baseView)
        : undefined;
  if (setImpl) {
    Object.defineProperty(normalized, 'set', {
      configurable: true,
      enumerable: false,
      writable: false,
      value: setImpl,
    });
  }

  const snapshotImpl =
    typeof enhanced.snapshot === 'function'
      ? enhanced.snapshot.bind(enhanced)
      : () => getImpl();
  Object.defineProperty(normalized, 'snapshot', {
    configurable: true,
    enumerable: false,
    writable: false,
    value: snapshotImpl,
  });

  return normalized;
}

export function withBehaviors<T>(
  input: IoView<T>,
  behaviors: IoBehavior<T>[],
): IoView<T>;
export function withBehaviors<N extends WithBehaviorsNode<unknown>>(
  input: N,
  behaviors: IoBehavior<ValueOfNode<N>>[],
): N & IoView<ValueOfNode<N>>;
export function withBehaviors(
  input: IoView<unknown> | WithBehaviorsNode<unknown>,
  behaviors: IoBehavior<unknown>[],
): object {
  const baseView = isView(input) ? input : adaptIo(input as IoLike<unknown>);
  const enhanced = behaviors.reduce((acc, behavior) => behavior(acc), baseView);
  const normalized = normalizeView(baseView, enhanced);
  return createViewProxy(normalized, input);
}
