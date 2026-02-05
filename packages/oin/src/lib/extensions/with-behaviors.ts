import type { OinDerived, OinUnit } from '../utils/types.js';
import type { OinBehavior, OinCallableView, OinView } from './types.js';

type WithBehaviorsNode<T> = object & {
  subscribe(fn: (v: T) => void): () => void;
} & ({ snapshot(): T } | { (): T });

type OinLike<T> = OinUnit<T> | OinDerived<T> | WithBehaviorsNode<T>;

type ValueOfNode<N> = N extends { snapshot(): infer T }
  ? T
  : N extends { (): infer T }
    ? T
    : never;

function isView<T>(value: unknown): value is OinView<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as OinView<T>).get === 'function' &&
    typeof (value as OinView<T>).subscribe === 'function'
  );
}

function isCallable(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function';
}

function isWritable<T>(node: OinLike<T>): node is OinUnit<T> {
  return (
    typeof node === 'function' &&
    typeof (node as { reset?: unknown }).reset === 'function'
  );
}

function adaptOin<T>(node: OinLike<T>): OinView<T> {
  const hasSnapshot =
    typeof (node as { snapshot?: unknown }).snapshot === 'function';
  const get = () => {
    if (isCallable(node)) return (node as OinUnit<T>)();
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
    node(next as T | ((prev: T) => T));
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

function createCallableView<T, N extends object>(
  view: OinView<T>,
  node: N,
): N & OinCallableView<T> {
  const fn = function (...args: [T | ((prev: T) => T)] | []): T | void {
    if (args.length === 0) return view.get();
    if (!view.set) throw new Error('withBehaviors: view is read-only');
    view.set(args[0] as T | ((prev: T) => T));
  };

  const overrides = new Map<string | symbol, unknown>([
    ['get', view.get],
    ['set', view.set],
    ['subscribe', view.subscribe],
    ['snapshot', view.snapshot],
    ['extensions', view.extensions],
    ['destroy', view.destroy],
  ]);

  return new Proxy(fn as OinLike<T> & OinCallableView<T>, {
    apply(_target, _thisArg, argArray) {
      return (fn as (...args: unknown[]) => unknown)(...argArray);
    },
    get(_target, prop, receiver) {
      if (overrides.has(prop)) return overrides.get(prop);
      if (Reflect.has(node as object, prop))
        return Reflect.get(node as object, prop, receiver);
      return Reflect.get(fn as object, prop, receiver);
    },
    has(_target, prop) {
      if (overrides.has(prop)) return overrides.get(prop) !== undefined;
      return (
        Reflect.has(node as object, prop) || Reflect.has(fn as object, prop)
      );
    },
    ownKeys(_target) {
      const keys = new Set<string | symbol>([
        ...Reflect.ownKeys(fn as object),
        ...Reflect.ownKeys(node as object),
      ]);
      for (const [key, value] of overrides.entries()) {
        if (value !== undefined) keys.add(key);
      }
      return Array.from(keys);
    },
    getOwnPropertyDescriptor(_target, prop) {
      const targetDesc = Object.getOwnPropertyDescriptor(fn as object, prop);
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
  }) as N & OinCallableView<T>;
}

export function withBehaviors<T>(
  input: OinView<T>,
  behaviors: OinBehavior<T>[],
): OinCallableView<T>;
export function withBehaviors<N extends WithBehaviorsNode<unknown>>(
  input: N,
  behaviors: OinBehavior<ValueOfNode<N>>[],
): N & OinCallableView<ValueOfNode<N>>;
export function withBehaviors(
  input: OinView<unknown> | WithBehaviorsNode<unknown>,
  behaviors: OinBehavior<unknown>[],
): object {
  const baseView = isView(input) ? input : adaptOin(input as OinLike<unknown>);
  const enhanced = behaviors.reduce((acc, behavior) => behavior(acc), baseView);
  return createCallableView(enhanced, input);
}
