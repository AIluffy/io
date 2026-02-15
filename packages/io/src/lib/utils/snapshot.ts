import { isPlainObject } from './plain-object.js';

const IMMUTABLE_ROOTS = new WeakSet<object>();
let deepCloneCount = 0;
const FAST_CLONE_UNSUPPORTED: unique symbol = Symbol.for(
  '@iostore/store/fastCloneUnsupported',
);
const REUSABLE_VISITED = new Set<object>();
const REUSABLE_STACK: unknown[] = [];
let deepFreezeWorkspaceInUse = false;

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

function toImmutable<T>(value: T): T {
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
  let usingReusableWorkspace = false;
  if (!deepFreezeWorkspaceInUse) {
    deepFreezeWorkspaceInUse = true;
    usingReusableWorkspace = true;
    visited = REUSABLE_VISITED;
    stack = REUSABLE_STACK;
    visited.clear();
    stack.length = 0;
  } else {
    visited = new Set<object>();
    stack = [];
  }
  stack.push(value);

  try {
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === null || current === undefined) continue;
      if (typeof current !== 'object') continue;
      const obj = current as object;
      if (visited.has(obj)) continue;
      visited.add(obj);

      Object.freeze(obj);

      if (assumeDataProperties) {
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
    if (usingReusableWorkspace) {
      stack.length = 0;
      visited.clear();
      deepFreezeWorkspaceInUse = false;
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

/** @deprecated Use cloneValue(value) instead. */
export function readValue<T>(value: T): T {
  return cloneValue(value);
}

export const __testing = {
  resetDeepCloneCount: () => {
    deepCloneCount = 0;
  },
  getDeepCloneCount: () => deepCloneCount,
};
