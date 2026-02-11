export type InternalKind = 'unit' | 'scope' | 'array' | 'derived';

export type IoInternal = { kind: InternalKind } & Record<string, unknown>;

const INTERNAL_REGISTRY = new WeakMap<object, IoInternal>();

export function registerInternal(target: object, internal: IoInternal): void {
  INTERNAL_REGISTRY.set(target, internal);
}

export function getInternal(value: unknown): IoInternal | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'function' && typeof value !== 'object') return undefined;
  return INTERNAL_REGISTRY.get(value as object);
}

export function requireInternal(value: unknown, errorMessage: string): IoInternal {
  const internal = getInternal(value);
  if (!internal) throw new Error(errorMessage);
  return internal;
}

export function requireInternalOfKind<K extends InternalKind>(
  value: unknown,
  kind: K,
  errorMessage: string,
): IoInternal & { kind: K } {
  const internal = requireInternal(value, errorMessage);
  if (internal.kind !== kind) throw new Error(errorMessage);
  return internal as IoInternal & { kind: K };
}
