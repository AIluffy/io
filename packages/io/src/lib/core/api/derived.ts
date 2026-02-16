import type {
  IoArrayUnit,
  IoDerived,
  IoNode,
  IoTreeNode,
  IoUnit,
  IoUnsubscribe,
  UnwrapIo,
} from '../../utils/types.js';

import { computed, effect } from '../../utils/signals.js';
import { cloneValue, snapshotValue } from '../../utils/immutable.js';
import { getInternal, registerInternal } from '../../utils/internal-access.js';
import { INTERNAL } from '../../utils/internal-access.js';
import { isIndexKey } from '../../utils/is-index-key.js';

type Subscribable = {
  subscribe: (fn: (...args: unknown[]) => void) => IoUnsubscribe;
};

type FormulaReadableDep = {
  get: () => unknown;
  subscribe: (fn: (...args: unknown[]) => void) => IoUnsubscribe;
};

type FormulaDep =
  | IoArrayUnit<unknown>
  | IoUnit<unknown>
  | IoDerived<unknown>
  | FormulaReadableDep;
type DepArg<D> = D extends IoArrayUnit<infer U>
  ? IoArrayUnit<U>
  : D extends { get: () => infer R }
  ? R
  : never;

const proxyCache = new WeakMap<object, unknown>();

function asObjectKey(prop: PropertyKey): prop is string | symbol {
  return typeof prop === 'string' || typeof prop === 'symbol';
}

function hasGet(value: unknown): value is { get: () => unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { get?: unknown }).get === 'function'
  );
}

function hasSubscribe(value: unknown): value is Subscribable {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { subscribe?: unknown }).subscribe === 'function'
  );
}

type Getter = { get: () => unknown };
type ArrayGetter = { get: () => unknown[] };

function readFromGetter(value: unknown): unknown {
  return (value as Getter).get();
}

function getValueView<T>(node: unknown): T {
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

function createDerivedFromComputed<T>(c: { get(): T }): IoDerived<T> {
  const listeners = new Set<(value: T) => void>();
  let stop: IoUnsubscribe | undefined;
  let current = c.get();

  const get = (): T => c.get();

  const snapshot = (): T => snapshotValue(c.get());

  const subscribe = (fn: (v: T) => void): IoUnsubscribe => {
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

  const derived = {} as IoDerived<T>;
  Object.defineProperties(derived, {
    get: { value: get },
    snapshot: { value: snapshot },
    subscribe: { value: subscribe },
    [INTERNAL]: { value: internal },
  });

  registerInternal(derived as object, internal);

  return derived;
}

function derivedFromDeps<const D extends readonly FormulaDep[], T>(
  deps: D,
  compute: (...args: { [K in keyof D]: DepArg<D[K]> }) => T
): IoDerived<T> {
  const depSubs = deps.map((dep, index) => {
    if (!hasSubscribe(dep))
      throw new Error(`derived: deps[${index}] must implement subscribe()`);
    return dep;
  });

  const readArgs = (): { [K in keyof D]: DepArg<D[K]> } =>
    deps.map((dep, index) => {
      const internal = getInternal(dep);
      if (internal?.kind === 'array') return dep;
      if (hasGet(dep)) return dep.get();
      throw new Error(`derived: deps[${index}] must implement get()`);
    }) as { [K in keyof D]: DepArg<D[K]> };

  let current = compute(...readArgs());

  const listeners = new Set<(value: T) => void>();
  let depUnsubs: IoUnsubscribe[] = [];
  let active = false;

  const ensureCurrent = (): void => {
    if (active) return;
    current = compute(...readArgs());
  };

  const recompute = (): void => {
    const next = compute(...readArgs());
    if (Object.is(current, next)) return;
    current = next;
    const v = cloneValue(current);
    for (const listener of listeners) listener(v);
  };

  const start = (): void => {
    if (active) return;
    active = true;
    depUnsubs = depSubs.flatMap((dep) => {
      const sub = dep.subscribe(() => {
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

  const get = (): T => {
    ensureCurrent();
    return cloneValue(current);
  };

  const snapshot = (): T => {
    ensureCurrent();
    return snapshotValue(current);
  };

  const subscribe = (fn: (v: T) => void): IoUnsubscribe => {
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

  const derived = {} as IoDerived<T>;
  Object.defineProperties(derived, {
    get: { value: get },
    snapshot: { value: snapshot },
    subscribe: { value: subscribe },
    [INTERNAL]: { value: internal },
  });

  registerInternal(derived as object, internal);

  return derived;
}

function derivedFromNode<T, R>(
  node: IoNode<T> | IoTreeNode<T>,
  selector: (state: UnwrapIo<T>) => R
): IoDerived<R> {
  const c = computed(() => selector(getValueView<UnwrapIo<T>>(node)));
  return createDerivedFromComputed(c);
}

function derivedFromCompute<T>(compute: () => T): IoDerived<T> {
  const c = computed(compute);
  return createDerivedFromComputed(c);
}

export function derived<const D extends readonly FormulaDep[], T>(
  deps: D,
  compute: (...args: { [K in keyof D]: DepArg<D[K]> }) => T
): IoDerived<T>;
export function derived<T, R>(
  node: IoNode<T> | IoTreeNode<T>,
  selector: (state: UnwrapIo<T>) => R
): IoDerived<R>;
export function derived<T>(compute: () => T): IoDerived<T>;
export function derived(
  arg1: unknown,
  arg2?: unknown
): IoDerived<unknown> {
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
    arg1 as IoNode<unknown> | IoTreeNode<unknown>,
    arg2 as (state: unknown) => unknown
  );
}
