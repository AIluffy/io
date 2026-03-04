import { batch } from '../utils/reactive/batch.js';
import type { IoUnit, IoUpdateAnnotation } from '../utils/types/types.js';

import { createGcScheduler } from './gc-scheduler.js';
import { readUnitState, setUnitState } from './unit-state.js';
import type { IoUnsubscribe, KeyHash } from './types.js';

export type RecordDefinitionCore = {
  keyHash: KeyHash;
  staleTime: number;
  gcTime: number;
  retry: number;
  canFetch: boolean;
  queryFn: unknown;
};

export function patchRecordState<TState>(
  unit: IoUnit<TState>,
  patch: Partial<TState>,
  annotation?: IoUpdateAnnotation,
): void {
  batch(() => {
    setUnitState(
      unit,
      (current) => ({
        ...current,
        ...patch,
      }),
      annotation,
    );
  });
}

export function createRecordDefinitionConflictError(
  recordName: string,
  keyHash: KeyHash,
  field: string,
  expected: unknown,
  received: unknown,
): Error {
  return new Error(
    `${recordName}: conflicting ${field} for key ${keyHash}. Expected ${String(expected)}, received ${String(
      received,
    )}.`,
  );
}

export function updateRecordDefinition<TDefinition extends RecordDefinitionCore>(
  recordName: string,
  current: TDefinition,
  next: TDefinition,
): TDefinition {
  const canUpgradeSeeded = !current.canFetch && next.canFetch;

  if (current.queryFn !== next.queryFn && !canUpgradeSeeded) {
    throw createRecordDefinitionConflictError(
      recordName,
      current.keyHash,
      'queryFn',
      current.queryFn,
      next.queryFn,
    );
  }

  if (!canUpgradeSeeded) {
    if (current.staleTime !== next.staleTime) {
      throw createRecordDefinitionConflictError(
        recordName,
        current.keyHash,
        'staleTime',
        current.staleTime,
        next.staleTime,
      );
    }
    if (current.gcTime !== next.gcTime) {
      throw createRecordDefinitionConflictError(
        recordName,
        current.keyHash,
        'gcTime',
        current.gcTime,
        next.gcTime,
      );
    }
    if (current.retry !== next.retry) {
      throw createRecordDefinitionConflictError(
        recordName,
        current.keyHash,
        'retry',
        current.retry,
        next.retry,
      );
    }
  }

  return canUpgradeSeeded ? next : current;
}

export function createRecordStaleChecker<TState extends { isInvalidated: boolean; status: string; dataUpdatedAt: number }>(options: {
  getDefinition: () => { staleTime: number };
  getState: () => TState;
}): (state?: TState) => boolean {
  return (state = options.getState()): boolean => {
    if (state.isInvalidated) {
      return true;
    }
    if (state.status !== 'success') {
      return true;
    }

    const { staleTime } = options.getDefinition();
    if (!Number.isFinite(staleTime)) {
      return false;
    }
    return Date.now() - state.dataUpdatedAt >= staleTime;
  };
}

export function createRecordGcController(options: {
  getGcTime: () => number;
  hasObservers: () => boolean;
  hasInFlight: () => boolean;
  onCollect: () => void;
}): { touch: () => void; schedule: () => void } {
  const scheduler = createGcScheduler(options);
  return {
    touch: () => scheduler.touch(),
    schedule: () => scheduler.schedule(),
  };
}

export function createObserverManager<TState>(options: {
  unit: IoUnit<TState>;
  onObserverAdded: () => void;
  onObserverRemoved: () => void;
}): {
  getObserverCount: () => number;
  addObserver: () => void;
  removeObserver: () => void;
  subscribe: (fn: (state: TState) => void) => IoUnsubscribe;
} {
  let observerCount = 0;

  const addObserver = (): void => {
    observerCount += 1;
    options.onObserverAdded();
  };

  const removeObserver = (): void => {
    observerCount = Math.max(0, observerCount - 1);
    options.onObserverRemoved();
  };

  const subscribe = (fn: (state: TState) => void): IoUnsubscribe => {
    addObserver();
    const unsub = options.unit.subscribe(fn);
    let unsubscribed = false;

    return () => {
      if (unsubscribed) {
        return;
      }
      unsubscribed = true;
      unsub();
      removeObserver();
    };
  };

  return {
    getObserverCount: () => observerCount,
    addObserver,
    removeObserver,
    subscribe,
  };
}

export function resetRecordState<TState>(options: {
  unit: IoUnit<TState>;
  createInitialState: () => TState;
  annotation: IoUpdateAnnotation;
}): void {
  batch(() => {
    setUnitState(options.unit, options.createInitialState(), options.annotation);
  });
}

export function readRecordState<TState>(unit: IoUnit<TState>): TState {
  return readUnitState(unit);
}
