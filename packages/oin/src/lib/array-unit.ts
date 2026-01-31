import { cloneValue, snapshotValue } from './snapshot.js';
import { notifyUpdate, notifyValue } from './batch.js';
import { createUpdate } from './updates.js';
import type {
  OinArrayUnit,
  OinErrorHandler,
  OinPatch,
  OinUnit,
  OinUnsubscribe,
  OinUpdate,
} from './types.js';
import { createUnit } from './unit.js';
import { emitError } from './debug.js';

const INTERNAL = Symbol.for('@org/oin/internal');

type UnitInternal<T> = {
  kind: 'unit';
  getValue: () => T;
  setValue: (
    next: T,
    options?: { emitUpdate?: boolean; emitValue?: boolean }
  ) => void;
};

function getUnitInternal<T>(unit: OinUnit<T>): UnitInternal<T> {
  const internal = (unit as unknown as Record<PropertyKey, unknown>)[INTERNAL];
  if (typeof internal !== 'object' || internal === null)
    throw new Error('ArrayUnit: missing element internal');
  const kind = (internal as { kind?: unknown }).kind;
  if (kind !== 'unit') throw new Error('ArrayUnit: invalid element internal');
  return internal as UnitInternal<T>;
}

type ArrayState<T> = {
  units: OinUnit<T>[];
  elementValueUnsubs: Map<OinUnit<T>, OinUnsubscribe>;
  elementUpdateUnsubs: Map<OinUnit<T>, OinUnsubscribe>;
  revision: number;
  cachedSnapshot: T[] | undefined;
  cachedSnapshotRevision: number;
  hasCachedSnapshot: boolean;
  valueListeners: Set<(value: T[]) => void>;
  updateListeners: Set<(update: OinUpdate) => void>;
  errorListeners: Set<OinErrorHandler>;
};

type ArrayInternal<T> = {
  kind: 'array';
  setIndex: (
    index: number,
    next: T,
    options?: { emitUpdate?: boolean; emitValue?: boolean }
  ) => void;
  applySplice: (start: number, deleteCount: number, items: T[]) => void;
  applySortOrder: (order: number[]) => void;
  getState: () => ArrayState<T>;
};

function emitArrayValue<T>(state: ArrayState<T>): void {
  const values = getArraySnapshot(state);
  notifyValue(state.valueListeners, values);
}

function emitArrayUpdate<T>(state: ArrayState<T>, update: OinUpdate): void {
  notifyUpdate(state.updateListeners, update);
}

function getArraySnapshot<T>(state: ArrayState<T>): T[] {
  if (
    state.hasCachedSnapshot &&
    state.cachedSnapshotRevision === state.revision
  )
    return state.cachedSnapshot as T[];
  const values = snapshotValue(state.units.map((u) => u()));
  state.cachedSnapshot = values;
  state.cachedSnapshotRevision = state.revision;
  state.hasCachedSnapshot = true;
  return values;
}

function attachElementBubbling<T>(
  state: ArrayState<T>,
  unit: OinUnit<T>
): void {
  const valueUnsub = unit.subscribe(() => {
    emitArrayValue(state);
  });
  const updateUnsub = unit.subscribeUpdate((u) => {
    const index = state.units.indexOf(unit);
    if (index < 0) return;

    const patches: OinPatch[] = u.patches.map((p) => {
      if (p.op !== 'set' || p.path.length !== 0) return p;
      return { ...p, path: [index] };
    });

    const baseRevision = state.revision;
    state.revision += 1;
    const update = createUpdate(baseRevision, state.revision, patches);
    emitArrayUpdate(state, update);
  });

  state.elementValueUnsubs.set(unit, valueUnsub);
  state.elementUpdateUnsubs.set(unit, updateUnsub);
}

function detachElementBubbling<T>(
  state: ArrayState<T>,
  unit: OinUnit<T>
): void {
  state.elementValueUnsubs.get(unit)?.();
  state.elementUpdateUnsubs.get(unit)?.();
  state.elementValueUnsubs.delete(unit);
  state.elementUpdateUnsubs.delete(unit);
}

export function createArrayUnit<T>(initial: T[]): OinArrayUnit<T> {
  const state: ArrayState<T> = {
    units: initial.map((v) => createUnit(cloneValue(v))),
    elementValueUnsubs: new Map(),
    elementUpdateUnsubs: new Map(),
    revision: 0,
    cachedSnapshot: undefined,
    cachedSnapshotRevision: -1,
    hasCachedSnapshot: false,
    valueListeners: new Set(),
    updateListeners: new Set(),
    errorListeners: new Set(),
  };

  for (const unit of state.units) attachElementBubbling(state, unit);

  const snapshot = (): T[] => getArraySnapshot(state);

  const subscribe = (fn: (v: T[]) => void): OinUnsubscribe => {
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

  const performSplice = (start: number, deleteCount: number, items: T[]) => {
    const normalizedStart =
      start < 0 ? Math.max(0, state.units.length + start) : start;
    const dc = Math.max(
      0,
      Math.min(deleteCount, state.units.length - normalizedStart)
    );

    const removedUnits = state.units.splice(normalizedStart, dc);
    const removedValues = removedUnits.map((u) => u());
    for (const u of removedUnits) detachElementBubbling(state, u);

    const insertedUnits = items.map((v) => createUnit(cloneValue(v)));
    for (const u of insertedUnits) attachElementBubbling(state, u);
    state.units.splice(normalizedStart, 0, ...insertedUnits);

    return { normalizedStart, dc, removedValues };
  };

  const push = (...items: T[]): void => {
    try {
      if (items.length === 0) return;

      const baseRevision = state.revision;
      state.revision += 1;
      const start = state.units.length;
      const created = items.map((v) => createUnit(cloneValue(v)));
      for (const unit of created) attachElementBubbling(state, unit);
      state.units.push(...created);

      const patch: OinPatch = {
        op: 'splice',
        path: [],
        start,
        deleteCount: 0,
        deleted: [],
        items: items.map((v) => cloneValue(v)),
      };
      const update = createUpdate(baseRevision, state.revision, [patch]);
      emitArrayUpdate(state, update);
      emitArrayValue(state);
    } catch (error) {
      emitError(array, error, [], 'push');
      throw error;
    }
  };

  const pop = (): T | undefined => {
    try {
      if (state.units.length === 0) return undefined;

      const baseRevision = state.revision;
      state.revision += 1;
      const start = state.units.length - 1;
      const removedUnit = state.units.pop();
      if (!removedUnit) return undefined;
      const removedValue = removedUnit();
      detachElementBubbling(state, removedUnit);

      const patch: OinPatch = {
        op: 'splice',
        path: [],
        start,
        deleteCount: 1,
        deleted: [cloneValue(removedValue)],
        items: [],
      };
      const update = createUpdate(baseRevision, state.revision, [patch]);
      emitArrayUpdate(state, update);
      emitArrayValue(state);

      return removedValue;
    } catch (error) {
      emitError(array, error, [], 'pop');
      throw error;
    }
  };

  const splice = (start: number, deleteCount: number, ...items: T[]): void => {
    try {
      const baseRevision = state.revision;
      state.revision += 1;
      const { normalizedStart, dc, removedValues } = performSplice(
        start,
        deleteCount,
        items
      );

      const patch: OinPatch = {
        op: 'splice',
        path: [],
        start: normalizedStart,
        deleteCount: dc,
        deleted: removedValues.map((v) => cloneValue(v)),
        items: items.map((v) => cloneValue(v)),
      };
      const update = createUpdate(baseRevision, state.revision, [patch]);
      emitArrayUpdate(state, update);
      emitArrayValue(state);
    } catch (error) {
      emitError(array, error, [], 'splice');
      throw error;
    }
  };

  const sort = (compareFn?: (a: T, b: T) => number): void => {
    try {
      if (state.units.length <= 1) return;

      const baseRevision = state.revision;
      state.revision += 1;
      const decorated = state.units.map((unit, index) => ({
        unit,
        index,
        value: unit(),
      }));
      decorated.sort((a, b) => {
        const av = a.value;
        const bv = b.value;
        if (compareFn) return compareFn(av, bv);
        if (av === bv) return 0;
        return av > bv ? 1 : -1;
      });

      const order = decorated.map((d) => d.index);
      state.units = decorated.map((d) => d.unit);

      const patch: OinPatch = { op: 'sort', path: [], order };
      const update = createUpdate(baseRevision, state.revision, [patch]);
      emitArrayUpdate(state, update);
      emitArrayValue(state);
    } catch (error) {
      emitError(array, error, [], 'sort');
      throw error;
    }
  };

  const commit = (fn: (draft: T[]) => void): void => {
    try {
      const baseRevision = state.revision;
      state.revision += 1;
      const before = state.units.map((u) => u());
      const draft = before.map((v) => cloneValue(v));
      fn(draft);

      for (const u of state.units) detachElementBubbling(state, u);

      state.units = draft.map((v) => createUnit(cloneValue(v)));
      for (const u of state.units) attachElementBubbling(state, u);

      const patch: OinPatch = {
        op: 'splice',
        path: [],
        start: 0,
        deleteCount: before.length,
        deleted: before.map((v) => cloneValue(v)),
        items: draft.map((v) => cloneValue(v)),
      };

      const update = createUpdate(baseRevision, state.revision, [patch]);
      emitArrayUpdate(state, update);
      emitArrayValue(state);
    } catch (error) {
      emitError(array, error, [], 'commit');
      throw error;
    }
  };

  const setIndex = (
    index: number,
    next: T,
    options?: { emitUpdate?: boolean; emitValue?: boolean }
  ): void => {
    try {
      const unit = state.units[index];
      if (!unit) throw new Error(`ArrayUnit: index out of range ${index}`);
      const internal = getUnitInternal(unit);
      const before = internal.getValue();
      internal.setValue(next, options);
      const after = internal.getValue();
      if (!Object.is(before, after) && options?.emitUpdate === false) {
        state.revision += 1;
      }
    } catch (error) {
      emitError(array, error, [index], 'set');
      throw error;
    }
  };

  const applySplice = (
    start: number,
    deleteCount: number,
    items: T[]
  ): void => {
    try {
      state.revision += 1;
      performSplice(start, deleteCount, items);
      emitArrayValue(state);
    } catch (error) {
      emitError(array, error, [], 'splice');
      throw error;
    }
  };

  const applySortOrder = (order: number[]): void => {
    try {
      if (order.length !== state.units.length)
        throw new Error('ArrayUnit: invalid sort order length');
      const old = state.units.slice();
      state.units = order.map((oldIndex) => old[oldIndex]);
      state.revision += 1;
      emitArrayValue(state);
    } catch (error) {
      emitError(array, error, [], 'sort');
      throw error;
    }
  };

  const reduce = <R>(
    reducer: (acc: R, item: OinUnit<T>, index: number) => R,
    initialValue: R
  ): R => {
    let acc = initialValue;
    for (let i = 0; i < state.units.length; i += 1) {
      acc = reducer(acc, state.units[i], i);
    }
    return acc;
  };

  const array = function () {
    return snapshotValue(state.units.map((u) => u()));
  } as OinArrayUnit<T>;

  Object.defineProperties(array, {
    snapshot: { value: snapshot },
    subscribe: { value: subscribe },
    subscribeUpdate: { value: subscribeUpdate },
    push: { value: push },
    pop: { value: pop },
    splice: { value: splice },
    sort: { value: sort },
    commit: { value: commit },
    reduce: { value: reduce },
    [INTERNAL]: {
      value: {
        kind: 'array',
        setIndex,
        applySplice,
        applySortOrder,
        getState: () => state,
      } satisfies ArrayInternal<T>,
    },
  });

  return new Proxy(array as OinArrayUnit<T> & object, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && /^[0-9]+$/.test(prop)) {
        return state.units[Number(prop)];
      }
      if (prop === Symbol.iterator) {
        return function* () {
          for (const u of state.units) yield u;
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as OinArrayUnit<T>;
}
