export function cloneValue<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  const maybeStructuredClone = (globalThis as Record<PropertyKey, unknown>)
    .structuredClone;
  if (typeof maybeStructuredClone === 'function') {
    return (maybeStructuredClone as (v: unknown) => unknown)(value) as T;
  }
  return JSON.parse(JSON.stringify(value)) as T;
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

export function snapshotValue<T>(value: T): T {
  return deepFreeze(cloneValue(value));
}

export function readValue<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  return snapshotValue(value);
}
