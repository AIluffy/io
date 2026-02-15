import {
  deepFreeze,
  freezeOwned,
  freezeRootShallow,
  immutableTesting,
  toImmutable,
} from './immutable.js';

export { deepFreeze, freezeOwned, freezeRootShallow };

export function cloneValue<T>(value: T): T {
  return toImmutable(value);
}

export function snapshotValue<T>(value: T, options?: { owned?: boolean }): T {
  if (options?.owned) return freezeOwned(value);
  return toImmutable(value);
}

/** @deprecated Use cloneValue(value) instead. */
export function readValue<T>(value: T): T {
  return cloneValue(value);
}

export const __testing = immutableTesting;
