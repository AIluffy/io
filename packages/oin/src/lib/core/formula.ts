import type {
  OinArrayUnit,
  OinDerived,
  OinUnit,
  OinUnsubscribe,
} from '../utils/types.js';

import { readValue, snapshotValue } from '../utils/snapshot.js';
import { getInternal } from '../utils/internal-access.js';
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

export function formula<const D extends readonly FormulaDep[], T>(
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

  Object.defineProperties(derived, {
    snapshot: { value: snapshot },
    subscribe: { value: subscribe },
    [INTERNAL]: { value: { kind: 'derived' } },
  });

  return derived;
}