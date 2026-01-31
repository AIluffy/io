import { mergeUpdates } from './updates.js';
import type { OinUpdate } from './types.js';

type ValueListener<T> = (value: T) => void;
type UpdateListener = (update: OinUpdate) => void;

let batchDepth = 0;

const pendingValues = new Map<ValueListener<unknown>, unknown>();
const pendingUpdates = new Map<UpdateListener, OinUpdate[]>();

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
      listener(mergeUpdates(updates));
    }
  }
}

export function batch<R>(fn: () => R): R {
  batchDepth += 1;
  try {
    return fn();
  } finally {
    batchDepth -= 1;
    if (batchDepth === 0) flush();
  }
}

export function notifyValue<T>(
  listeners: ReadonlySet<ValueListener<T>>,
  value: T
): void {
  if (batchDepth === 0) {
    for (const listener of listeners) listener(value);
    return;
  }
  for (const listener of listeners) {
    pendingValues.set(listener as ValueListener<unknown>, value);
  }
}

export function notifyUpdate(
  listeners: ReadonlySet<UpdateListener>,
  update: OinUpdate
): void {
  if (batchDepth === 0) {
    for (const listener of listeners) listener(update);
    return;
  }
  for (const listener of listeners) {
    const arr = pendingUpdates.get(listener);
    if (arr) arr.push(update);
    else pendingUpdates.set(listener, [update]);
  }
}

