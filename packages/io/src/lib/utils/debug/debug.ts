import type { IoErrorHandler, IoMutationOp, IoPatch, IoPath, IoUnsubscribe, IoUpdate } from '../types/types.js';

import { getInternal } from '../internal/internal-access.js';

type ErrorStore = {
  errorListeners: Set<IoErrorHandler>;
};

type InternalWithState = {
  getState?: () => unknown;
};

export function emitError(
  target: unknown,
  error: unknown,
  path: IoPath,
  operation: IoMutationOp
): void {
  const internal = getInternal(target) as InternalWithState | undefined;
  const state = internal?.getState?.();
  if (!state || typeof state !== 'object') return;

  const store = state as Partial<ErrorStore> & {
    ctx?: Partial<ErrorStore>;
  };
  const listeners = store.ctx?.errorListeners ?? store.errorListeners;
  if (!listeners) return;
  for (const fn of listeners) fn(error, path, operation);
}

export function onError(target: unknown, fn: IoErrorHandler): IoUnsubscribe {
  const internal = getInternal(target) as InternalWithState | undefined;
  const state = internal?.getState?.();
  if (!state || typeof state !== 'object')
    throw new Error('onError: target is not an IO node');

  const store = state as Partial<ErrorStore> & {
    ctx?: Partial<ErrorStore>;
  };
  const container = (store.ctx ?? store) as Partial<ErrorStore>;
  if (!container.errorListeners) container.errorListeners = new Set();
  container.errorListeners.add(fn);
  return () => {
    container.errorListeners?.delete(fn);
  };
}

export function onMutation(
  target: unknown,
  fn: (patch: IoPatch, path: IoPath, update: IoUpdate) => void
): IoUnsubscribe {
  if (target === null || target === undefined) throw new Error('onMutation: invalid target');
  const sub = (target as {
    subscribeUpdate?: (cb: (u: IoUpdate) => void) => IoUnsubscribe;
  }).subscribeUpdate;
  if (typeof sub !== 'function')
    throw new Error('onMutation: target does not support subscribeUpdate');
  return sub((u) => {
    for (const patch of u.patches) fn(patch, patch.path, u);
  });
}