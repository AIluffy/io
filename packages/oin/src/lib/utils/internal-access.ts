import { INTERNAL } from './internal-symbol.js';

export type InternalKind = 'unit' | 'scope' | 'array' | 'derived';

export type OinInternal = { kind: InternalKind } & Record<string, unknown>;

export function getInternal(value: unknown): OinInternal | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'function' && typeof value !== 'object') return undefined;
  const internal = (value as unknown as Record<PropertyKey, unknown>)[INTERNAL];
  if (typeof internal !== 'object' || internal === null) return undefined;
  const kind = (internal as { kind?: unknown }).kind;
  if (kind !== 'unit' && kind !== 'scope' && kind !== 'array' && kind !== 'derived')
    return undefined;
  return internal as OinInternal;
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