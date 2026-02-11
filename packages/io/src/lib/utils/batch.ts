import type { IoUpdate } from './types.js';

import { mergeUpdates } from './update-merge.js';

type ValueListener<T> = (value: T) => void;
type UpdateListener = (update: IoUpdate) => void;

let batchDepth = 0;
let hasPending = false;

const pendingValues = new Map<ValueListener<unknown>, unknown>();
const pendingUpdates = new Map<UpdateListener, IoUpdate[]>();
const updateArrayPool: IoUpdate[][] = [];
const UPDATE_POOL_LIMIT = 100;

const acquireUpdateArray = (): IoUpdate[] => {
  return updateArrayPool.pop() ?? [];
};

const releaseUpdateArray = (updates: IoUpdate[]): void => {
  updates.length = 0;
  if (updateArrayPool.length < UPDATE_POOL_LIMIT) {
    updateArrayPool.push(updates);
  }
};

function flush(): void {
  if (pendingValues.size > 0) {
    const entries = Array.from(pendingValues.entries());
    pendingValues.clear();
    for (const [listener, value] of entries) {
      (listener as ValueListener<unknown>)(value);
    }
  }

  if (pendingUpdates.size > 0) {
    const entries = Array.from(pendingUpdates.entries());
    pendingUpdates.clear();
    for (const [listener, updates] of entries) {
      if (updates.length === 1) listener(updates[0]);
      else listener(mergeUpdates(updates));
      releaseUpdateArray(updates);
    }
  }
}

export function batch<R>(fn: () => R): R {
  batchDepth += 1;
  try {
    return fn();
  } finally {
    batchDepth -= 1;
    if (batchDepth === 0 && hasPending) {
      hasPending = false;
      flush();
    }
  }
}

export function notifyValue<T>(
  listeners: ReadonlySet<ValueListener<T>>,
  value: T
): void {
  if (listeners.size === 0) return;
  if (batchDepth === 0) {
    for (const listener of listeners) listener(value);
    return;
  }
  hasPending = true;
  for (const listener of listeners) {
    pendingValues.set(listener as ValueListener<unknown>, value);
  }
}

export function notifyUpdate(
  listeners: ReadonlySet<UpdateListener>,
  update: IoUpdate
): void {
  if (listeners.size === 0) return;
  if (batchDepth === 0) {
    for (const listener of listeners) listener(update);
    return;
  }
  hasPending = true;
  for (const listener of listeners) {
    const arr = pendingUpdates.get(listener);
    if (arr) arr.push(update);
    else {
      const next = acquireUpdateArray();
      next.push(update);
      pendingUpdates.set(listener, next);
    }
  }
}
