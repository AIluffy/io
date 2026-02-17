import { isPlainObject } from './plain-object.js';

const IMMUTABLE_ROOTS = new WeakSet<object>();
const FAST_CLONE_UNSUPPORTED: unique symbol = Symbol.for(
  '@iostore/store/fastCloneUnsupported',
);

function getFastPlainObjectKeys(
  value: object,
): ReadonlyArray<string> | undefined {
  if (!isPlainObject(value)) return undefined;
  if (Object.getOwnPropertySymbols(value).length > 0) return undefined;
  const keys = Object.keys(value as Record<string, unknown>);
  if (Reflect.ownKeys(value).length !== keys.length) return undefined;
  return keys;
}

function isImmutableRoot(value: object): boolean {
  return IMMUTABLE_ROOTS.has(value);
}

function markImmutableRoot(value: object): void {
  IMMUTABLE_ROOTS.add(value);
}

function deepClone<T>(value: T): T {
  const maybeStructuredClone = (globalThis as Record<PropertyKey, unknown>)
    .structuredClone;
  if (typeof maybeStructuredClone === 'function') {
    return (maybeStructuredClone as (v: unknown) => unknown)(value) as T;
  }
  throw new Error(
    'IO snapshot: structuredClone is required in this environment',
  );
}

function cloneFastChild(
  value: unknown,
  seen: WeakMap<object, unknown>,
): unknown | typeof FAST_CLONE_UNSUPPORTED {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  return cloneFastObject(value as object, seen);
}

function cloneFastObject(
  value: object,
  seen: WeakMap<object, unknown>,
): unknown | typeof FAST_CLONE_UNSUPPORTED {
  if (seen.has(value)) return seen.get(value) as object;

  if (Array.isArray(value)) {
    const source = value as unknown[];
    const target = new Array(source.length) as unknown[];
    seen.set(value, target);

    for (let i = 0; i < source.length; i += 1) {
      const clonedValue = cloneFastChild(source[i], seen);
      if (clonedValue === FAST_CLONE_UNSUPPORTED)
        return FAST_CLONE_UNSUPPORTED;
      target[i] = clonedValue;
    }
    if (Object.getOwnPropertySymbols(source).length === 0) {
      return target;
    }

    for (const key of Reflect.ownKeys(source)) {
      const desc = Object.getOwnPropertyDescriptor(source, key);
      if (!desc || !('value' in desc)) return FAST_CLONE_UNSUPPORTED;
      const clonedValue = cloneFastChild(desc.value, seen);
      if (clonedValue === FAST_CLONE_UNSUPPORTED) return FAST_CLONE_UNSUPPORTED;
      Object.defineProperty(target, key, { ...desc, value: clonedValue });
    }
    return target;
  }

  if (!isPlainObject(value)) return FAST_CLONE_UNSUPPORTED;

  const target = Object.create(Object.getPrototypeOf(value)) as Record<
    PropertyKey,
    unknown
  >;
  seen.set(value, target);

  const fastKeys = getFastPlainObjectKeys(value);
  if (fastKeys) {
    const source = value as Record<string, unknown>;
    for (const key of fastKeys) {
      const rawValue = source[key];
      const clonedValue = cloneFastChild(rawValue, seen);
      if (clonedValue === FAST_CLONE_UNSUPPORTED)
        return FAST_CLONE_UNSUPPORTED;
      target[key] = clonedValue;
    }
    return target;
  }

  for (const key of Reflect.ownKeys(value)) {
    const desc = Object.getOwnPropertyDescriptor(value, key);
    if (!desc || !('value' in desc)) return FAST_CLONE_UNSUPPORTED;
    const clonedValue = cloneFastChild(desc.value, seen);
    if (clonedValue === FAST_CLONE_UNSUPPORTED) return FAST_CLONE_UNSUPPORTED;
    Object.defineProperty(target, key, { ...desc, value: clonedValue });
  }
  return target;
}

function cloneFast<T>(value: T): T | typeof FAST_CLONE_UNSUPPORTED {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  return cloneFastObject(value as object, new WeakMap<object, unknown>()) as
    | T
    | typeof FAST_CLONE_UNSUPPORTED;
}

export function toImmutable<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (isImmutableRoot(value as object)) return value;
  const fastCloned = cloneFast(value);
  const cloned =
    fastCloned === FAST_CLONE_UNSUPPORTED ? deepClone(value) : fastCloned;
  const frozen = deepFreeze(cloned, { assumeDataProperties: true });
  markImmutableRoot(frozen as object);
  return frozen;
}

type DeepFreezeOptions = {
  assumeDataProperties?: boolean;
};

const REUSABLE_VISITED = new Set<object>();
const REUSABLE_STACK: unknown[] = [];
let reusableDeepFreezeContextBusy = false;

export function deepFreeze<T>(value: T, options?: DeepFreezeOptions): T {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;

  const assumeDataProperties = options?.assumeDataProperties === true;
  if (assumeDataProperties) {
    let hasObjectChild = false;
    for (const key of Reflect.ownKeys(value as object)) {
      const desc = Object.getOwnPropertyDescriptor(value as object, key);
      if (!desc || !('value' in desc)) continue;
      const child = desc.value;
      if (child !== null && typeof child === 'object') {
        hasObjectChild = true;
        break;
      }
    }
    if (!hasObjectChild) {
      Object.freeze(value);
      return value;
    }
  }

  let visited: Set<object>;
  let stack: unknown[];
  let useReusableContext = false;
  if (!reusableDeepFreezeContextBusy) {
    reusableDeepFreezeContextBusy = true;
    useReusableContext = true;
    visited = REUSABLE_VISITED;
    stack = REUSABLE_STACK;
    visited.clear();
    stack.length = 0;
  } else {
    visited = new Set<object>();
    stack = [];
  }

  try {
    stack.push(value);

    while (stack.length > 0) {
      const current = stack.pop();
      if (current === null || current === undefined) continue;
      if (typeof current !== 'object') continue;
      const obj = current as object;
      if (visited.has(obj)) continue;
      visited.add(obj);

      Object.freeze(obj);

      if (assumeDataProperties) {
        if (Array.isArray(obj)) {
          const array = obj as unknown[];
          for (let i = 0; i < array.length; i += 1) stack.push(array[i]);
          if (Object.getOwnPropertySymbols(array).length === 0) continue;
        }

        const fastKeys = getFastPlainObjectKeys(obj);
        if (fastKeys) {
          const record = obj as Record<string, unknown>;
          for (const key of fastKeys) stack.push(record[key]);
          continue;
        }

        for (const key of Reflect.ownKeys(obj)) {
          const desc = Object.getOwnPropertyDescriptor(obj, key);
          if (!desc || !('value' in desc)) continue;
          stack.push(desc.value);
        }
        continue;
      }

      if (Array.isArray(obj)) {
        for (const item of obj) stack.push(item);
      }
      for (const key of Reflect.ownKeys(obj)) {
        const desc = Object.getOwnPropertyDescriptor(obj, key);
        if (!desc) continue;
        if ('value' in desc) stack.push(desc.value);
      }
    }
  } finally {
    if (useReusableContext) {
      REUSABLE_VISITED.clear();
      REUSABLE_STACK.length = 0;
      reusableDeepFreezeContextBusy = false;
    }
  }

  return value;
}

export function freezeOwned<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (isImmutableRoot(value as object)) return value;
  const frozen = deepFreeze(value, { assumeDataProperties: true });
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
