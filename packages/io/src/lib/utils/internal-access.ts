export type InternalKind = 'unit' | 'scope' | 'array' | 'derived';

export type IoInternal = { kind: InternalKind } & Record<string, unknown>;

export const INTERNAL = Symbol.for('@iostore/store/internal');

const INTERNAL_REGISTRY = new WeakMap<object, IoInternal>();

type InternalCarrier = {
  [INTERNAL]?: IoInternal;
};

export function registerInternal(target: object, internal: IoInternal): void {
  if (Object.isExtensible(target)) {
    try {
      Object.defineProperty(target, INTERNAL, {
        value: internal,
        enumerable: false,
        configurable: false,
        writable: false,
      });
      INTERNAL_REGISTRY.delete(target);
      return;
    } catch {
      // fall through
    }
  }
  INTERNAL_REGISTRY.set(target, internal);
}

export function getInternal(value: unknown): IoInternal | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'function' && typeof value !== 'object') return undefined;
  const target = value as object;
  const direct = (target as InternalCarrier)[INTERNAL];
  if (direct) return direct;
  return INTERNAL_REGISTRY.get(target);
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
