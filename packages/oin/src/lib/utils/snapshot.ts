const IMMUTABLE_ROOTS = new WeakSet<object>();
let deepCloneCount = 0;

function isImmutableRoot(value: object): boolean {
  return IMMUTABLE_ROOTS.has(value);
}

function markImmutableRoot(value: object): void {
  IMMUTABLE_ROOTS.add(value);
}

function deepClone<T>(value: T): T {
  deepCloneCount += 1;
  const maybeStructuredClone = (globalThis as Record<PropertyKey, unknown>)
    .structuredClone;
  if (typeof maybeStructuredClone === 'function') {
    return (maybeStructuredClone as (v: unknown) => unknown)(value) as T;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function toImmutable<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (isImmutableRoot(value as object)) return value;
  const cloned = deepClone(value);
  const frozen = deepFreeze(cloned);
  markImmutableRoot(frozen as object);
  return frozen;
}

export function deepFreeze<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;

  const visited = new Set<object>();

  const walk = (current: unknown): void => {
    if (current === null || current === undefined) return;
    if (typeof current !== 'object') return;
    if (visited.has(current as object)) return;
    visited.add(current as object);

    Object.freeze(current);

    if (Array.isArray(current)) {
      for (const item of current) walk(item);
      return;
    }

    for (const key of Object.keys(current as object)) {
      walk((current as Record<string, unknown>)[key]);
    }
  };

  walk(value);
  return value;
}

function freezeOwned<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (isImmutableRoot(value as object)) return value;
  const frozen = deepFreeze(value);
  markImmutableRoot(frozen as object);
  return frozen;
}

export function freezeRootShallow<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (isImmutableRoot(value as object)) return value;
  Object.freeze(value);
  markImmutableRoot(value as object);
  return value;
}

export function cloneValue<T>(value: T): T {
  return toImmutable(value);
}

export function snapshotValue<T>(value: T, options?: { owned?: boolean }): T {
  if (options?.owned) return freezeOwned(value);
  return toImmutable(value);
}

export function readValue<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (isImmutableRoot(value as object)) return value;
  return toImmutable(value);
}

export const __testing = {
  resetDeepCloneCount: () => {
    deepCloneCount = 0;
  },
  getDeepCloneCount: () => deepCloneCount,
};
