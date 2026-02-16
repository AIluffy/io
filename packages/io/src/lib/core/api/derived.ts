import type {
  IoArrayUnit,
  IoDerived,
  IoNode,
  IoTreeNode,
  IoUnit,
  IoUnsubscribe,
  UnwrapIo,
} from '../../utils/types/types.js';

import { computed, effect } from '../../utils/reactive/signals.js';
import { cloneValue, snapshotValue } from '../../utils/immutable/immutable.js';
import { getInternal, registerInternal } from '../../utils/internal/internal-access.js';
import { INTERNAL } from '../../utils/internal/internal-access.js';
import { getValueView } from './utils/value-view.js';
import { createSubscriptionManager } from './utils/subscription-manager.js';

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

function createDerivedFromComputed<T>(c: { get(): T }): IoDerived<T> {
  let stop: IoUnsubscribe | undefined;
  let current: T | undefined;
  let hasCurrent = false;
  const manager = createSubscriptionManager<T>({
    onActivate: () => {
      stop = effect(() => {
        const next = c.get();
        if (!hasCurrent) {
          current = next;
          hasCurrent = true;
          return;
        }
        if (Object.is(current, next)) return;
        current = next;
        manager.emit(next);
      });
    },
    onDeactivate: () => {
      stop?.();
      stop = undefined;
    },
  });

  const get = (): T => {
    const next = c.get();
    current = next;
    hasCurrent = true;
    return next;
  };

  const snapshot = (): T => snapshotValue(get());

  const internal: { kind: 'derived' } = { kind: 'derived' };

  const derived = {} as IoDerived<T>;
  Object.defineProperties(derived, {
    get: { value: get },
    snapshot: { value: snapshot },
    subscribe: { value: manager.subscribe },
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

  let depUnsubs: IoUnsubscribe[] = [];
  let active = false;
  const manager = createSubscriptionManager<T>({
    onActivate: () => {
      ensureCurrent();
      start();
    },
    onDeactivate: () => {
      stop();
    },
  });

  const ensureCurrent = (): void => {
    if (active) return;
    current = compute(...readArgs());
  };

  const recompute = (): void => {
    const next = compute(...readArgs());
    if (Object.is(current, next)) return;
    current = next;
    manager.emit(cloneValue(current));
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

  const internal: { kind: 'derived' } = { kind: 'derived' };

  const derived = {} as IoDerived<T>;
  Object.defineProperties(derived, {
    get: { value: get },
    snapshot: { value: snapshot },
    subscribe: { value: manager.subscribe },
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
