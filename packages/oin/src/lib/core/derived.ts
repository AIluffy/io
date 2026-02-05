import type {
  OinArrayUnit,
  OinDerived,
  OinNode,
  OinTreeNode,
  OinUnit,
  OinUnsubscribe,
  UnwrapOin,
} from '../utils/types.js';

import { computed, effect } from '../utils/signals.js';
import { readValue, snapshotValue } from '../utils/snapshot.js';
import { getInternal, registerInternal } from '../utils/internal-access.js';
import { INTERNAL } from '../utils/internal-symbol.js';

type Subscribable = {
  subscribe: (fn: (value: unknown) => void) => OinUnsubscribe;
};

type FormulaDep = OinArrayUnit<unknown> | OinUnit<unknown> | { (): unknown };
type DepArg<D> = D extends OinArrayUnit<infer U>
  ? OinArrayUnit<U>
  : D extends OinUnit<infer U>
  ? U
  : D extends { (): infer R }
  ? R
  : never;

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

function createDerivedFromComputed<T>(c: { get(): T }): OinDerived<T> {
  const listeners = new Set<(value: T) => void>();
  let stop: OinUnsubscribe | undefined;
  let current = c.get();

  const derived = function () {
    return c.get();
  } as OinDerived<T>;

  const snapshot = (): T => snapshotValue(c.get());

  const subscribe = (fn: (v: T) => void): OinUnsubscribe => {
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

  const internal: { kind: 'derived' } = { kind: 'derived' };

  Object.defineProperties(derived, {
    snapshot: { value: snapshot },
    subscribe: { value: subscribe },
    [INTERNAL]: { value: internal },
  });

  registerInternal(derived as unknown as object, internal);

  return derived;
}

function derivedFromDeps<const D extends readonly FormulaDep[], T>(
  deps: D,
  compute: (...args: { [K in keyof D]: DepArg<D[K]> }) => T
): OinDerived<T> {
  const readArgs = (): { [K in keyof D]: DepArg<D[K]> } =>
    deps.map((dep) => {
      const internal = getInternal(dep);
      if (internal?.kind === 'array') return dep;
      if (typeof dep === 'function') return dep();
      return undefined;
    }) as unknown as { [K in keyof D]: DepArg<D[K]> };

  let current = compute(...readArgs());

  const listeners = new Set<(value: T) => void>();
  let depUnsubs: OinUnsubscribe[] = [];
  let active = false;

  const ensureCurrent = (): void => {
    if (active) return;
    current = compute(...readArgs());
  };

  const recompute = (): void => {
    const next = compute(...readArgs());
    if (Object.is(current, next)) return;
    current = next;
    const v = readValue(current);
    for (const listener of listeners) listener(v);
  };

  const start = (): void => {
    if (active) return;
    active = true;
    depUnsubs = deps.flatMap((dep) => {
      const sub = (dep as unknown as Subscribable).subscribe?.(() => {
        recompute();
      });
      return typeof sub === 'function' ? [sub] : [];
    });
  };

  const stop = (): void => {
    if (!active) return;
    active = false;
    for (const unsub of depUnsubs) unsub();
    depUnsubs = [];
  };

  const derived = function () {
    ensureCurrent();
    return readValue(current);
  } as OinDerived<T>;

  const snapshot = (): T => {
    ensureCurrent();
    return snapshotValue(current);
  };

  const subscribe = (fn: (v: T) => void): OinUnsubscribe => {
    listeners.add(fn);
    if (listeners.size === 1) {
      ensureCurrent();
      start();
    }
    return () => {
      listeners.delete(fn);
      if (listeners.size === 0) stop();
    };
  };

  const internal: { kind: 'derived' } = { kind: 'derived' };

  Object.defineProperties(derived, {
    snapshot: { value: snapshot },
    subscribe: { value: subscribe },
    [INTERNAL]: { value: internal },
  });

  registerInternal(derived as unknown as object, internal);

  return derived;
}

function derivedFromNode<T, R>(
  node: OinNode<T> | OinTreeNode<T>,
  selector: (state: UnwrapOin<T>) => R
): OinDerived<R> {
  const c = computed(() => selector(getValueView<UnwrapOin<T>>(node)));
  return createDerivedFromComputed(c);
}

function derivedFromCompute<T>(compute: () => T): OinDerived<T> {
  const c = computed(compute);
  return createDerivedFromComputed(c);
}

export function derived<const D extends readonly FormulaDep[], T>(
  deps: D,
  compute: (...args: { [K in keyof D]: DepArg<D[K]> }) => T
): OinDerived<T>;
export function derived<T, R>(
  node: OinNode<T> | OinTreeNode<T>,
  selector: (state: UnwrapOin<T>) => R
): OinDerived<R>;
export function derived<T>(compute: () => T): OinDerived<T>;
export function derived(
  arg1: unknown,
  arg2?: unknown
): OinDerived<unknown> {
  if (Array.isArray(arg1)) {
    if (typeof arg2 !== 'function')
      throw new Error('derived: compute function is required for deps');
    return derivedFromDeps(
      arg1 as readonly FormulaDep[],
      arg2 as (...args: unknown[]) => unknown
    );
  }

  if (typeof arg1 === 'function' && arg2 === undefined) {
    return derivedFromCompute(arg1 as () => unknown);
  }

  if (typeof arg2 !== 'function') {
    throw new Error('derived: selector function is required for node');
  }

  return derivedFromNode(
    arg1 as OinNode<unknown> | OinTreeNode<unknown>,
    arg2 as (state: unknown) => unknown
  );
}
