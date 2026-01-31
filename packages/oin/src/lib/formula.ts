import { readValue, snapshotValue } from './snapshot.js';
import type {
  OinArrayUnit,
  OinDerived,
  OinUnit,
  OinUnsubscribe,
} from './types.js';

const INTERNAL = Symbol.for('@org/oin/internal');

type Subscribable = {
  subscribe: (fn: (value: unknown) => void) => OinUnsubscribe;
};

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
