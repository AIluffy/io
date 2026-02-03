import type {
  OinErrorHandler,
  OinPatch,
  OinScope,
  OinUnit,
  OinUnsubscribe,
  OinUpdate,
} from '../utils/types.js';
import type { VersionedCache } from '../container/cache.js';

import { cloneValue, snapshotValue } from '../utils/snapshot.js';
import { createDraft, finishDraft } from '../utils/cow.js';
import { notifyUpdate, notifyValue } from '../utils/batch.js';
import { createUpdate } from '../utils/updates.js';
import { createUnit } from '../units/unit.js';
import { emitError } from '../utils/debug.js';
import { requireInternalOfKind } from '../utils/internal-access.js';
import { INTERNAL } from '../utils/internal-symbol.js';
import { subscribeKeyedChild } from '../container/bubbling.js';
import { readCachedByVersion } from '../container/cache.js';

type UnitInternal = {
  kind: 'unit';
  setValue: (
    next: unknown,
    options?: { emitUpdate?: boolean; emitValue?: boolean }
  ) => void;
  getValue: () => unknown;
};

function getUnitInternal(unit: OinUnit<unknown>): UnitInternal {
  return requireInternalOfKind(
    unit,
    'unit',
    'Scope: missing or invalid unit internal',
  ) as unknown as UnitInternal;
}

type ScopeState<T extends Record<string, unknown>> = {
  units: Map<string, OinUnit<unknown>>;
  revision: number;
  snapshotCache: VersionedCache<T>;
  valueListeners: Set<(value: T) => void>;
  updateListeners: Set<(update: OinUpdate) => void>;
  childValueUnsubs: Map<string, OinUnsubscribe>;
  childUpdateUnsubs: Map<string, OinUnsubscribe>;
  errorListeners: Set<OinErrorHandler>;
};

type ScopeInternal<T extends Record<string, unknown>> = {
  kind: 'scope';
  getUnit: (key: string) => OinUnit<unknown> | undefined;
  applySet: (
    key: string,
    next: unknown,
    options?: { emitUpdate?: boolean; emitValue?: boolean }
  ) => void;
  getState: () => ScopeState<T>;
};

function emitScopeValue<T extends Record<string, unknown>>(
  state: ScopeState<T>
): void {
  const value = getScopeSnapshot(state);
  notifyValue(state.valueListeners, value);
}

function getScopeSnapshot<T extends Record<string, unknown>>(
  state: ScopeState<T>
): T {
  return readCachedByVersion(state.snapshotCache, state.revision, () => {
    const plain: Record<string, unknown> = {};
    for (const [key, unit] of state.units.entries()) plain[key] = unit();
    return snapshotValue(plain as T, { owned: true });
  });
}

function emitScopeUpdate<T extends Record<string, unknown>>(
  state: ScopeState<T>,
  update: OinUpdate
): void {
  notifyUpdate(state.updateListeners, update);
}

function createScopeState<T extends Record<string, unknown>>(): ScopeState<T> {
  return {
    units: new Map(),
    revision: 0,
    snapshotCache: { value: undefined, version: -1, hasValue: false },
    valueListeners: new Set(),
    updateListeners: new Set(),
    childValueUnsubs: new Map(),
    childUpdateUnsubs: new Map(),
    errorListeners: new Set(),
  };
}

function initScopeUnits<T extends Record<string, unknown>>(
  state: ScopeState<T>,
  initial: T,
): void {
  for (const key of Object.keys(initial) as Array<Extract<keyof T, string>>) {
    state.units.set(
      key,
      createUnit(cloneValue(initial[key])) as OinUnit<unknown>,
    );
  }
}

function attachScopeUnit<T extends Record<string, unknown>>(
  state: ScopeState<T>,
  key: string,
  unit: OinUnit<unknown>,
  isCommitting: () => boolean,
): void {
  const { valueUnsub, updateUnsub } = subscribeKeyedChild(unit, key, {
    onValue: () => {
      if (isCommitting()) return;
      emitScopeValue(state);
    },
    onUpdate: (u) => {
      const baseRevision = state.revision;
      state.revision += 1;
      emitScopeUpdate(state, createUpdate(baseRevision, state.revision, u.patches));
    },
  });
  state.childValueUnsubs.set(key, valueUnsub);
  state.childUpdateUnsubs.set(key, updateUnsub);
}

export function createScope<T extends Record<string, unknown>>(
  initial: T
): OinScope<T> {
  const state = createScopeState<T>();
  let isCommitting = false;

  initScopeUnits(state, initial);
  for (const [key, unit] of state.units.entries()) {
    attachScopeUnit(state, key, unit, () => isCommitting);
  }

  const commit = (fn: (draft: T) => void): void => {
    try {
      const before = snapshot() as Record<string, unknown>;
      const draft = createDraft(before) as T;
      fn(draft);
      const next = finishDraft(draft) as Record<string, unknown>;

      const patches: OinPatch[] = [];
      isCommitting = true;
      for (const [key, unit] of state.units.entries()) {
        const nextValue = next[key];
        const prev = before[key];
        if (Object.is(prev, nextValue)) continue;
        patches.push({
          op: 'set',
          path: [key],
          prev,
          next: nextValue,
        });
        const unitInternal = getUnitInternal(unit);
        unitInternal.setValue(nextValue, { emitUpdate: false, emitValue: true });
      }
      isCommitting = false;

      if (patches.length === 0) return;
      const baseRevision = state.revision;
      state.revision += 1;
      const update = createUpdate(baseRevision, state.revision, patches);
      emitScopeUpdate(state, update);
      emitScopeValue(state);
    } catch (error) {
      isCommitting = false;
      emitError(scope as unknown as OinScope<T>, error, [], 'commit');
      throw error;
    }
  };

  const snapshot = (): T => {
    return getScopeSnapshot(state);
  };

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

  const applySet = (
    key: string,
    next: unknown,
    options?: { emitUpdate?: boolean; emitValue?: boolean }
  ): void => {
    try {
      const unit = state.units.get(key);
      if (!unit) throw new Error(`Scope: missing key ${key}`);
      const unitInternal = getUnitInternal(unit);
      const before = unitInternal.getValue();
      unitInternal.setValue(next, {
        emitUpdate: false,
        emitValue: options?.emitValue !== false,
      });
      const after = unitInternal.getValue();
      if (!Object.is(before, after)) state.revision += 1;
    } catch (error) {
      emitError(scope as unknown as OinScope<T>, error, [key], 'set');
      throw error;
    }
  };

  const scope: Record<string, unknown> = {};
  for (const [key, unit] of state.units.entries()) scope[key] = unit;

  Object.defineProperties(scope, {
    commit: { value: commit },
    snapshot: { value: snapshot },
    subscribe: { value: subscribe },
    subscribeUpdate: { value: subscribeUpdate },
    [INTERNAL]: {
      value: {
        kind: 'scope',
        getUnit: (key: string) => state.units.get(key),
        applySet,
        getState: () => state,
      } satisfies ScopeInternal<T>,
    },
  });

  return scope as OinScope<T>;
}