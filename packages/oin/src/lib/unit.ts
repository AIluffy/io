import { cloneValue, readValue, snapshotValue } from './snapshot.js';
import { createUpdate } from './updates.js';
import type { OinPatch, OinUnit, OinUnsubscribe, OinUpdate } from './types.js';

const INTERNAL = Symbol.for('@org/oin/internal');

type UnitState<T> = {
  initial: T;
  value: T;
  revision: number;
  valueListeners: Set<(value: T) => void>;
  updateListeners: Set<(update: OinUpdate) => void>;
};

type SetOptions = {
  emitValue?: boolean;
  emitUpdate?: boolean;
};

type UnitInternal<T> = {
  kind: 'unit';
  setValue: (next: T | ((prev: T) => T), options?: SetOptions) => void;
  getValue: () => T;
  getState: () => UnitState<T>;
};

function emitValue<T>(state: UnitState<T>): void {
  const v = readValue(state.value);
  for (const listener of state.valueListeners) listener(v);
}

function emitUpdate(state: UnitState<unknown>, update: OinUpdate): void {
  for (const listener of state.updateListeners) listener(update);
}

export function createUnit<T>(initial: T): OinUnit<T> {
  const state: UnitState<T> = {
    initial: cloneValue(initial),
    value: cloneValue(initial),
    revision: 0,
    valueListeners: new Set(),
    updateListeners: new Set(),
  };

  const setValue = (next: T | ((prev: T) => T), options?: SetOptions): void => {
    const emitValueFlag = options?.emitValue !== false;
    const emitUpdateFlag = options?.emitUpdate !== false;

    const prev = state.value;
    const resolved =
      typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
    if (Object.is(prev, resolved)) return;

    const baseRevision = state.revision;
    state.revision += 1;
    state.value = resolved;

    if (emitUpdateFlag) {
      const patch: OinPatch = {
        op: 'set',
        path: [],
        prev: cloneValue(prev),
        next: cloneValue(resolved),
      };
      const update = createUpdate(baseRevision, state.revision, [patch]);
      emitUpdate(state as UnitState<unknown>, update);
    }

    if (emitValueFlag) emitValue(state);
  };

  function unit(): T;
  function unit(next: T | ((prev: T) => T)): void;
  function unit(next?: T | ((prev: T) => T)): T | void {
    if (arguments.length === 0) return readValue(state.value);
    setValue(next as T | ((prev: T) => T));
  }
  const unitFn = unit as OinUnit<T>;

  const snapshot = (): T => snapshotValue(state.value);

  const subscribe = (fn: (v: T) => void): OinUnsubscribe => {
    state.valueListeners.add(fn);
    return () => {
      state.valueListeners.delete(fn);
    };
  };

  const subscribeUpdate = (fn: (u: OinUpdate) => void): OinUnsubscribe => {
    state.updateListeners.add(fn);
    return () => {
      state.updateListeners.delete(fn);
    };
  };

  const reset = (): void => {
    setValue(cloneValue(state.initial));
  };

  Object.defineProperties(unit, {
    snapshot: { value: snapshot },
    subscribe: { value: subscribe },
    subscribeUpdate: { value: subscribeUpdate },
    reset: { value: reset },
    [INTERNAL]: {
      value: {
        kind: 'unit',
        setValue,
        getValue: () => state.value,
        getState: () => state,
      } satisfies UnitInternal<T>,
    },
  });

  return unitFn;
}

export function isUnit(value: unknown): value is OinUnit<unknown> {
  if (typeof value !== 'function') return false;
  const internal = (value as unknown as Record<PropertyKey, unknown>)[INTERNAL];
  if (typeof internal !== 'object' || internal === null) return false;
  return (internal as { kind?: unknown }).kind === 'unit';
}
