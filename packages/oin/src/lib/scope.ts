import { cloneValue, snapshotValue } from './snapshot.js';
import { createDraft, finishDraft } from './cow.js';
import { notifyUpdate, notifyValue } from './batch.js';
import { createUpdate } from './updates.js';
import type {
  OinErrorHandler,
  OinPatch,
  OinScope,
  OinUnit,
  OinUnsubscribe,
  OinUpdate,
} from './types.js';
import { createUnit } from './unit.js';
import { emitError } from './debug.js';

const INTERNAL = Symbol.for('@org/oin/internal');

type UnitInternal = {
  kind: 'unit';
  setValue: (
    next: unknown,
    options?: { emitUpdate?: boolean; emitValue?: boolean }
  ) => void;
  getValue: () => unknown;
};

function getUnitInternal(unit: OinUnit<unknown>): UnitInternal {
  const internal = (unit as unknown as Record<PropertyKey, unknown>)[INTERNAL];
  if (typeof internal !== 'object' || internal === null)
    throw new Error('Scope: missing unit internal');
  const kind = (internal as { kind?: unknown }).kind;
  if (kind !== 'unit') throw new Error('Scope: invalid unit internal kind');
  return internal as UnitInternal;
}

type ScopeState<T extends Record<string, unknown>> = {
  units: Map<string, OinUnit<unknown>>;
  revision: number;
  cachedSnapshot: T | undefined;
  cachedSnapshotRevision: number;
  hasCachedSnapshot: boolean;
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
  if (
    state.hasCachedSnapshot &&
    state.cachedSnapshotRevision === state.revision
  )
    return state.cachedSnapshot as T;
  const plain: Record<string, unknown> = {};
  for (const [key, unit] of state.units.entries()) plain[key] = unit();
  const value = snapshotValue(plain as T, { owned: true });
  state.cachedSnapshot = value;
  state.cachedSnapshotRevision = state.revision;
  state.hasCachedSnapshot = true;
  return value;
}

function emitScopeUpdate<T extends Record<string, unknown>>(
  state: ScopeState<T>,
  update: OinUpdate
): void {
  notifyUpdate(state.updateListeners, update);
}

export function createScope<T extends Record<string, unknown>>(
  initial: T
): OinScope<T> {
  const state: ScopeState<T> = {
    units: new Map(),
    revision: 0,
    cachedSnapshot: undefined,
    cachedSnapshotRevision: -1,
    hasCachedSnapshot: false,
    valueListeners: new Set(),
    updateListeners: new Set(),
    childValueUnsubs: new Map(),
    childUpdateUnsubs: new Map(),
    errorListeners: new Set(),
  };
  let isCommitting = false;

  for (const key of Object.keys(initial) as Array<Extract<keyof T, string>>) {
    state.units.set(
      key,
      createUnit(cloneValue(initial[key])) as OinUnit<unknown>
    );
  }

  for (const [key, unit] of state.units.entries()) {
    state.childValueUnsubs.set(
      key,
      unit.subscribe(() => {
        if (isCommitting) return;
        emitScopeValue(state);
      })
    );
    state.childUpdateUnsubs.set(
      key,
      unit.subscribeUpdate((u) => {
        const patches: OinPatch[] = u.patches.map((p) => {
          if (p.op !== 'set' || p.path.length !== 0) return p;
          return { ...p, path: [key] };
        });
        const baseRevision = state.revision;
        state.revision += 1;
        const update = createUpdate(baseRevision, state.revision, patches);
        emitScopeUpdate(state, update);
      })
    );
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
