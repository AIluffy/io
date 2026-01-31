import { cloneValue, snapshotValue } from './snapshot.js';
import { createUpdate } from './updates.js';
import type {
  OinPatch,
  OinScope,
  OinUnit,
  OinUnsubscribe,
  OinUpdate,
} from './types.js';
import { createUnit } from './unit.js';

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
  valueListeners: Set<(value: T) => void>;
  updateListeners: Set<(update: OinUpdate) => void>;
  childValueUnsubs: Map<string, OinUnsubscribe>;
  childUpdateUnsubs: Map<string, OinUnsubscribe>;
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
  const snapshot: Record<string, unknown> = {};
  for (const [key, unit] of state.units.entries()) snapshot[key] = unit();
  const value = snapshotValue(snapshot as T);
  for (const listener of state.valueListeners) listener(value);
}

function emitScopeUpdate<T extends Record<string, unknown>>(
  state: ScopeState<T>,
  update: OinUpdate
): void {
  for (const listener of state.updateListeners) listener(update);
}

export function createScope<T extends Record<string, unknown>>(
  initial: T
): OinScope<T> {
  const state: ScopeState<T> = {
    units: new Map(),
    revision: 0,
    valueListeners: new Set(),
    updateListeners: new Set(),
    childValueUnsubs: new Map(),
    childUpdateUnsubs: new Map(),
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
    const before: Record<string, unknown> = {};
    for (const [key, unit] of state.units.entries()) before[key] = unit();
    const draft = cloneValue(before) as T;
    fn(draft);

    const patches: OinPatch[] = [];
    isCommitting = true;
    for (const [key, unit] of state.units.entries()) {
      const next = (draft as Record<string, unknown>)[key];
      const prev = before[key];
      if (Object.is(prev, next)) continue;
      patches.push({
        op: 'set',
        path: [key],
        prev: cloneValue(prev),
        next: cloneValue(next),
      });
      const unitInternal = getUnitInternal(unit);
      unitInternal.setValue(next, { emitUpdate: false, emitValue: true });
    }
    isCommitting = false;

    if (patches.length === 0) return;
    const baseRevision = state.revision;
    state.revision += 1;
    const update = createUpdate(baseRevision, state.revision, patches);
    emitScopeUpdate(state, update);
    emitScopeValue(state);
  };

  const snapshot = (): T => {
    const plain: Record<string, unknown> = {};
    for (const [key, unit] of state.units.entries()) plain[key] = unit();
    return snapshotValue(plain as T);
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
