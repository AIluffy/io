import { cloneValue, readValue } from './snapshot.js';
import { notifyUpdate, notifyValue } from './batch.js';
import { trackRead } from './signals.js';
import { createUpdate } from './updates.js';
import type {
  OinErrorHandler,
  OinPatch,
  OinUnit,
  OinUnsubscribe,
  OinUpdate,
} from './types.js';
import { emitError } from './debug.js';

const INTERNAL = Symbol.for('@org/oin/internal');

type UnitState<T> = {
  initial: T;
  value: T;
  revision: number;
  cachedRead: T | undefined;
  cachedReadRevision: number;
  hasCachedRead: boolean;
  valueListeners: Set<(value: T) => void>;
  updateListeners: Set<(update: OinUpdate) => void>;
  errorListeners: Set<OinErrorHandler>;
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

function readCachedValue<T>(state: UnitState<T>): T {
  if (state.hasCachedRead && state.cachedReadRevision === state.revision)
    return state.cachedRead as T;
  const v = readValue(state.value);
  state.cachedRead = v;
  state.cachedReadRevision = state.revision;
  state.hasCachedRead = true;
  return v;
}

function emitValue<T>(state: UnitState<T>): void {
  const v = readCachedValue(state);
  notifyValue(state.valueListeners, v);
}

function emitUpdate(state: UnitState<unknown>, update: OinUpdate): void {
  notifyUpdate(state.updateListeners, update);
}

export function createUnit<T>(initial: T): OinUnit<T> {
  const state: UnitState<T> = {
    initial: cloneValue(initial),
    value: cloneValue(initial),
    revision: 0,
    cachedRead: undefined,
    cachedReadRevision: -1,
    hasCachedRead: false,
    valueListeners: new Set(),
    updateListeners: new Set(),
    errorListeners: new Set(),
  };

  const setValue = (next: T | ((prev: T) => T), options?: SetOptions): void => {
    try {
      const emitValueFlag = options?.emitValue !== false;
      const emitUpdateFlag = options?.emitUpdate !== false;

      const prev = state.value;
      const resolved =
        typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
      const after = cloneValue(resolved);
      if (Object.is(prev, after)) return;

      const baseRevision = state.revision;
      state.revision += 1;
      state.value = after;

      if (emitUpdateFlag) {
        const patch: OinPatch = {
          op: 'set',
          path: [],
          prev,
          next: after,
        };
        const update = createUpdate(baseRevision, state.revision, [patch]);
        emitUpdate(state as UnitState<unknown>, update);
      }

      if (emitValueFlag) emitValue(state);
    } catch (error) {
      emitError(unitFn, error, [], 'set');
      throw error;
    }
  };

  function unit(): T;
  function unit(next: T | ((prev: T) => T)): void;
  function unit(next?: T | ((prev: T) => T)): T | void {
    if (arguments.length === 0) {
      trackRead(unitFn);
      return readCachedValue(state);
    }
    setValue(next as T | ((prev: T) => T));
  }
  const unitFn = unit as OinUnit<T>;

  const snapshot = (): T => readCachedValue(state);

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
    try {
      setValue(cloneValue(state.initial));
    } catch (error) {
      emitError(unitFn, error, [], 'reset');
      throw error;
    }
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
