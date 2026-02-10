import { notifyUpdate, notifyValue } from '../utils/batch.js';
import { emitError } from '../utils/debug.js';
import { getInternal, registerInternal } from '../utils/internal-access.js';
import { INTERNAL } from '../utils/internal-symbol.js';
import { trackRead } from '../utils/signals.js';
import { cloneValue, readValue } from '../utils/snapshot.js';
import type {
  IoErrorHandler,
  IoPatch,
  IoUnit,
  IoUnsubscribe,
  IoUpdate,
} from '../utils/types.js';
import { createUpdate } from '../utils/updates.js';

type UnitState<T> = {
  initial: T;
  value: T;
  revision: number;
  cachedRead: T | undefined;
  cachedReadRevision: number;
  hasCachedRead: boolean;
  valueListeners: Set<(value: T) => void>;
  updateListeners: Set<(update: IoUpdate) => void>;
  errorListeners: Set<IoErrorHandler>;
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

function emitUpdate(state: UnitState<unknown>, update: IoUpdate): void {
  notifyUpdate(state.updateListeners, update);
}

function createUnitState<T>(initial: T): UnitState<T> {
  const cloned = cloneValue(initial);
  return {
    initial: cloned,
    value: cloned,
    revision: 0,
    cachedRead: undefined,
    cachedReadRevision: -1,
    hasCachedRead: false,
    valueListeners: new Set(),
    updateListeners: new Set(),
    errorListeners: new Set(),
  };
}

function applyUnitSet<T>(
  state: UnitState<T>,
  next: T | ((prev: T) => T),
  options?: SetOptions,
): void {
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
    const patch: IoPatch = {
      op: 'set',
      path: [],
      prev,
      next: after,
    };
    const update = createUpdate(baseRevision, state.revision, [patch]);
    emitUpdate(state as UnitState<unknown>, update);
  }

  if (emitValueFlag) emitValue(state);
}

export function createUnit<T>(initial: T): IoUnit<T> {
  const state = createUnitState(initial);

  const setValue = (next: T | ((prev: T) => T), options?: SetOptions): void => {
    try {
      applyUnitSet(state, next, options);
    } catch (error) {
      emitError(unit, error, [], 'set');
      throw error;
    }
  };

  const get = (): T => {
    trackRead(unit);
    return readCachedValue(state);
  };

  const set = (next: T): void => {
    setValue(next);
  };

  const update = (fn: (prev: T) => T): void => {
    setValue(fn);
  };

  const snapshot = (): T => readCachedValue(state);

  const subscribe = (fn: (v: T) => void): IoUnsubscribe => {
    state.valueListeners.add(fn);
    return () => {
      state.valueListeners.delete(fn);
    };
  };

  const subscribeUpdate = (fn: (u: IoUpdate) => void): IoUnsubscribe => {
    state.updateListeners.add(fn);
    return () => {
      state.updateListeners.delete(fn);
    };
  };

  const reset = (): void => {
    try {
      setValue(cloneValue(state.initial));
    } catch (error) {
      emitError(unit, error, [], 'reset');
      throw error;
    }
  };

  const internal: UnitInternal<T> = {
    kind: 'unit',
    setValue,
    getValue: () => state.value,
    getState: () => state,
  };

  const unit = {} as IoUnit<T>;
  Object.defineProperties(unit, {
    get: { value: get },
    set: { value: set },
    update: { value: update },
    snapshot: { value: snapshot },
    subscribe: { value: subscribe },
    subscribeUpdate: { value: subscribeUpdate },
    reset: { value: reset },
    [INTERNAL]: {
      value: internal satisfies UnitInternal<T>,
    },
  });

  registerInternal(unit as unknown as object, internal);

  return unit;
}

export function isUnit(value: unknown): value is IoUnit<unknown> {
  const internal = getInternal(value);
  return internal?.kind === 'unit';
}
