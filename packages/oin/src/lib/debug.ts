import type { OinErrorHandler, OinMutationOp, OinPatch, OinPath, OinUnsubscribe, OinUpdate } from './types.js';

const INTERNAL = Symbol.for('@org/oin/internal');

type ErrorStore = {
  errorListeners: Set<OinErrorHandler>;
};

type InternalWithState = {
  getState?: () => unknown;
};

function getInternal(value: unknown): (InternalWithState & { kind?: unknown }) | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'function' && typeof value !== 'object') return undefined;
  const internal = (value as unknown as Record<PropertyKey, unknown>)[INTERNAL];
  if (typeof internal !== 'object' || internal === null) return undefined;
  return internal as InternalWithState & { kind?: unknown };
}

export function emitError(
  target: unknown,
  error: unknown,
  path: OinPath,
  operation: OinMutationOp
): void {
  const internal = getInternal(target);
  const state = internal?.getState?.();
  if (!state || typeof state !== 'object') return;

  const store = state as unknown as Partial<ErrorStore> & {
    ctx?: Partial<ErrorStore>;
  };
  const listeners = store.ctx?.errorListeners ?? store.errorListeners;
  if (!listeners) return;
  for (const fn of listeners) fn(error, path, operation);
}

export function onError(target: unknown, fn: OinErrorHandler): OinUnsubscribe {
  const internal = getInternal(target);
  const state = internal?.getState?.();
  if (!state || typeof state !== 'object')
    throw new Error('onError: target is not an OIN node');

  const store = state as unknown as Partial<ErrorStore> & {
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
  fn: (patch: OinPatch, path: OinPath, update: OinUpdate) => void
): OinUnsubscribe {
  if (target === null || target === undefined) throw new Error('onMutation: invalid target');
  const sub = (target as unknown as {
    subscribeUpdate?: (cb: (u: OinUpdate) => void) => OinUnsubscribe;
  }).subscribeUpdate;
  if (typeof sub !== 'function')
    throw new Error('onMutation: target does not support subscribeUpdate');
  return sub((u) => {
    for (const patch of u.patches) fn(patch, patch.path, u);
  });
}

