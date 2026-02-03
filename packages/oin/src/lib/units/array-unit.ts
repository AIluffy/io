import type {
  OinArrayUnit,
  OinErrorHandler,
  OinPatch,
  OinUnit,
  OinUnsubscribe,
  OinUpdate,
} from '../utils/types.js';
import type { VersionedCache } from '../container/cache.js';

import { cloneValue, freezeRootShallow, snapshotValue } from '../utils/snapshot.js';
import { createDraft, finishDraft } from '../utils/cow.js';
import { notifyUpdate, notifyValue } from '../utils/batch.js';
import { createUpdate } from '../utils/updates.js';
import { createUnit } from './unit.js';
import { emitError } from '../utils/debug.js';
import { requireInternalOfKind } from '../utils/internal-access.js';
import { INTERNAL } from '../utils/internal-symbol.js';
import { subscribeIndexedChild } from '../container/bubbling.js';
import { readCachedByVersion } from '../container/cache.js';

type UnitInternal<T> = {
  kind: 'unit';
  getValue: () => T;
  setValue: (
    next: T,
    options?: { emitUpdate?: boolean; emitValue?: boolean }
  ) => void;
};

function getUnitInternal<T>(unit: OinUnit<T>): UnitInternal<T> {
  return requireInternalOfKind(
    unit,
    'unit',
    'ArrayUnit: missing or invalid element internal',
  ) as unknown as UnitInternal<T>;
}

type ArrayState<T> = {
  units: OinUnit<T>[];
  elementValueUnsubs: Map<OinUnit<T>, OinUnsubscribe>;
  elementUpdateUnsubs: Map<OinUnit<T>, OinUnsubscribe>;
  revision: number;
  snapshotCache: VersionedCache<T[]>;
  dirtyIndices: Set<number>;
  dirtyStructure: boolean;
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
  return readCachedByVersion(state.snapshotCache, state.revision, () => {
    const prev = state.snapshotCache.hasValue ? state.snapshotCache.value : undefined;

    if (!prev || state.dirtyStructure) {
      state.dirtyIndices.clear();
      state.dirtyStructure = false;
      return freezeRootShallow(state.units.map((u) => u()));
    }

    if (state.dirtyIndices.size === 0) {
      return prev as T[];
    }

    const next = (prev as T[]).slice();
    for (const index of state.dirtyIndices) {
      if (index < 0 || index >= state.units.length) continue;
      next[index] = state.units[index]();
    }
    state.dirtyIndices.clear();
    return freezeRootShallow(next);
  });
}

function attachElementBubbling<T>(
  state: ArrayState<T>,
  unit: OinUnit<T>
): void {
  const { valueUnsub, updateUnsub } = subscribeIndexedChild(
    unit,
    (child) => state.units.indexOf(child as OinUnit<T>),
    {
      onValue: () => {
        const index = state.units.indexOf(unit);
        if (index >= 0) state.dirtyIndices.add(index);
        emitArrayValue(state);
      },
      onUpdate: (u, index) => {
        if (index >= 0) state.dirtyIndices.add(index);
        const baseRevision = state.revision;
        state.revision += 1;
        emitArrayUpdate(state, createUpdate(baseRevision, state.revision, u.patches));
      },
    },
  );

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
    snapshotCache: { value: undefined, version: -1, hasValue: false },
    dirtyIndices: new Set(),
    dirtyStructure: false,
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
      state.dirtyStructure = true;
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
      state.dirtyStructure = true;
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
      state.dirtyStructure = true;
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
      state.dirtyStructure = true;
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
      const before = snapshotValue(state.units.map((u) => u()), { owned: true });
      const draft = createDraft(before);
      fn(draft);
      const next = finishDraft(draft);

      let changed = before.length !== next.length;
      if (!changed) {
        for (let i = 0; i < before.length; i += 1) {
          if (!Object.is(before[i], next[i])) {
            changed = true;
            break;
          }
        }
      }
      if (!changed) return;

      const baseRevision = state.revision;
      state.revision += 1;

      if (before.length !== next.length) {
        state.dirtyStructure = true;
        for (const u of state.units) detachElementBubbling(state, u);
        state.units = next.map((v) => createUnit(v));
        for (const u of state.units) attachElementBubbling(state, u);
      } else {
        for (let i = 0; i < next.length; i += 1) {
          const unit = state.units[i];
          if (!unit) continue;
          if (Object.is(unit(), next[i])) continue;
          const internal = getUnitInternal(unit);
          internal.setValue(next[i], { emitUpdate: false, emitValue: false });
          state.dirtyIndices.add(i);
        }
      }

      const patch: OinPatch = {
        op: 'splice',
        path: [],
        start: 0,
        deleteCount: before.length,
        deleted: before as unknown[],
        items: next as unknown[],
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
      if (!Object.is(before, after)) {
        state.dirtyIndices.add(index);
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
      state.dirtyStructure = true;
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
      state.dirtyStructure = true;
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
    return getArraySnapshot(state);
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
