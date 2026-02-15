import type { IoDerived, IoUnit } from '../utils/types.js';
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
  const get = () => {
    if (hasGet) return (node as { get: () => T }).get();
    if (hasSnapshot) return (node as { snapshot: () => T }).snapshot();
    throw new Error('withBehaviors: node is not readable');
  };
  const subscribe = (fn: (v: T) => void) => {
    if (typeof (node as { subscribe?: unknown }).subscribe !== 'function')
      throw new Error('withBehaviors: node is not subscribable');
    return (node as { subscribe: (f: (v: T) => void) => () => void }).subscribe(
      fn,
    );
  };
  const set = (next: T | ((prev: T) => T)) => {
    if (!isWritable(node)) throw new Error('withBehaviors: node is read-only');
    const setter = (
      node as { set?: (value: T | ((prev: T) => T)) => void }
    ).set;
    if (!setter) throw new Error('withBehaviors: node is read-only');
    setter(next);
  };
  return {
    get,
    set: isWritable(node) ? set : undefined,
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
    ['set', view.set],
    ['subscribe', view.subscribe],
    ['snapshot', view.snapshot],
    ['extensions', view.extensions],
    ['destroy', view.destroy],
  ]);

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
      for (const [key, value] of overrides.entries()) {
        if (value !== undefined) keys.add(key);
      }
      return Array.from(keys);
    },
    getOwnPropertyDescriptor(target, prop) {
      const targetDesc = Object.getOwnPropertyDescriptor(target, prop);
      if (targetDesc && targetDesc.configurable === false) return targetDesc;

      if (overrides.has(prop)) {
        const value = overrides.get(prop);
        if (value === undefined) return undefined;
        return {
          configurable: true,
          enumerable: false,
          writable: false,
          value,
        };
      }
      const nodeDesc = Object.getOwnPropertyDescriptor(node as object, prop);
      if (nodeDesc) return nodeDesc;
      return targetDesc;
    },
  }) as N & IoView<T>;
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
  return createViewProxy(enhanced, input);
}
