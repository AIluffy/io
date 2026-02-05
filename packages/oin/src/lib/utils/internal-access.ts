export type InternalKind = 'unit' | 'scope' | 'array' | 'derived';

export type OinInternal = { kind: InternalKind } & Record<string, unknown>;

const INTERNAL_REGISTRY = new WeakMap<object, OinInternal>();

export function registerInternal(target: object, internal: OinInternal): void {
  INTERNAL_REGISTRY.set(target, internal);
}

export function getInternal(value: unknown): OinInternal | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'function' && typeof value !== 'object') return undefined;
  return INTERNAL_REGISTRY.get(value as object);
}

export function requireInternal(value: unknown, errorMessage: string): OinInternal {
  const internal = getInternal(value);
  if (!internal) throw new Error(errorMessage);
  return internal;
}

export function requireInternalOfKind<K extends InternalKind>(
  value: unknown,
  kind: K,
  errorMessage: string,
): OinInternal & { kind: K } {
  const internal = requireInternal(value, errorMessage);
  if (internal.kind !== kind) throw new Error(errorMessage);
  return internal as OinInternal & { kind: K };
}
