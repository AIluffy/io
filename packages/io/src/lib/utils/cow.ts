import { cloneValue } from './snapshot.js';

type DraftState = {
  base: object;
  copy: object | undefined;
  modified: boolean;
  drafts: Map<PropertyKey, unknown>;
  finalized: boolean;
};

const baseToDraft = new WeakMap<object, object>();

const DRAFT_STATE = Symbol('@iostore/store/draftState');
type DraftCarrier = {
  [DRAFT_STATE]?: DraftState;
};

function tryGetState(value: object): DraftState | undefined {
  return (value as DraftCarrier)[DRAFT_STATE];
}

function isDraft(value: unknown): value is object {
  if (value === null || value === undefined) return false;
  if (typeof value !== 'object') return false;
  const state = tryGetState(value);
  return !!state && !state.finalized;
}

function getState(draft: object): DraftState {
  const state = tryGetState(draft);
  if (!state || state.finalized) throw new Error('COW: missing draft state');
  return state;
}

function isDraftable(value: unknown): value is object {
  if (value === null || value === undefined) return false;
  if (typeof value !== 'object') return false;
  return true;
}

function currentSource(state: DraftState): object {
  return state.copy ?? state.base;
}

function shallowCopy(base: object): object {
  if (Array.isArray(base)) return base.slice();
  const proto = Object.getPrototypeOf(base);
  const copy = Object.create(proto);
  return Object.assign(copy, base);
}

function ensureCopy(state: DraftState): object {
  // Copy-on-write: we only allocate a shallow clone after the first mutation.
  // Pure reads keep sharing the frozen base snapshot.
  if (!state.modified) {
    state.modified = true;
    state.copy = shallowCopy(state.base);
  }
  return state.copy as object;
}

function toImmutableIfNeeded(value: unknown): unknown {
  if (!isDraftable(value)) return value;
  if (isDraft(value)) return finishDraft(value);
  return cloneValue(value);
}

const arrayMutators = new Set<PropertyKey>([
  'copyWithin',
  'fill',
  'pop',
  'push',
  'reverse',
  'shift',
  'sort',
  'splice',
  'unshift',
]);

function createProxy(base: object): object {
  const target: object = Array.isArray(base) ? [] : {};
  Object.assign(target as object, base);

  const state: DraftState = {
    base,
    copy: undefined,
    modified: false,
    drafts: new Map(),
    finalized: false,
  };

  const proxy = new Proxy(target, {
    get(_target, prop) {
      if (prop === DRAFT_STATE) return state;

      const source = currentSource(state) as Record<PropertyKey, unknown>;

      // Array mutators must run against the writable copy. Calling the method
      // directly on base would mutate frozen snapshots and break sharing.
      if (Array.isArray(source) && arrayMutators.has(prop)) {
        const fn = (source as Record<PropertyKey, unknown>)[prop];
        if (typeof fn !== 'function') return fn;
        return (...args: unknown[]) => {
          const copy = ensureCopy(state) as unknown[];
          const method = Reflect.get(copy as object, prop);
          if (typeof method !== 'function')
            throw new Error('COW: invalid array mutator');
          const immutableArgs =
            prop === 'push' || prop === 'unshift'
              ? args.map(toImmutableIfNeeded)
              : prop === 'splice'
                ? [args[0], args[1], ...args.slice(2).map(toImmutableIfNeeded)]
                : args;
          return (method as (...a: unknown[]) => unknown).apply(
            copy,
            immutableArgs,
          );
        };
      }

      const value = source[prop];
      if (!isDraftable(value)) return value;

      const existing = state.drafts.get(prop);
      if (existing) return existing;

      const childDraft = createDraft(value);
      state.drafts.set(prop, childDraft);
      return childDraft;
    },
    set(_target, prop, value) {
      const copy = ensureCopy(state) as Record<PropertyKey, unknown>;
      const immutable = toImmutableIfNeeded(value);
      copy[prop] = immutable;
      state.drafts.delete(prop);
      return true;
    },
    deleteProperty(_target, prop) {
      const copy = ensureCopy(state) as Record<PropertyKey, unknown>;
      delete copy[prop];
      state.drafts.delete(prop);
      return true;
    },
    has(_target, prop) {
      return prop in (currentSource(state) as object);
    },
    ownKeys() {
      return Reflect.ownKeys(currentSource(state));
    },
    getOwnPropertyDescriptor(_target, prop) {
      const desc = Object.getOwnPropertyDescriptor(currentSource(state), prop);
      if (!desc) return undefined;
      return {
        ...desc,
        configurable: true,
      };
    },
  });

  baseToDraft.set(base, proxy);
  return proxy;
}

export function createDraft<T>(base: T): T {
  if (!isDraftable(base)) return base;
  const cached = baseToDraft.get(base);
  if (cached) return cached as T;
  return createProxy(base) as T;
}

function finalize(value: unknown): unknown {
  if (!isDraft(value)) return value;
  return finishDraft(value);
}

export function finishDraft<T>(draft: T): T {
  if (!isDraft(draft)) return draft;
  const draftObject = draft as object;
  const state = getState(draftObject);

  const release = (): void => {
    state.finalized = true;
    state.drafts.clear();
    baseToDraft.delete(state.base);
  };

  // No local writes and no child drafts means full structural sharing is valid.
  if (!state.modified && state.drafts.size === 0) {
    release();
    return state.base as T;
  }

  const result = (
    state.modified ? state.copy : shallowCopy(state.base)
  ) as Record<PropertyKey, unknown>;
  let changed = state.modified;
  state.drafts.forEach((child, prop) => {
    const finalized = finalize(child);
    if (!Object.is(result[prop], finalized)) {
      result[prop] = finalized;
      changed = true;
    }
  });

  if (!changed) {
    release();
    return state.base as T;
  }

  Object.freeze(result);
  release();
  return result as T;
}

export function isDraftValue(value: unknown): boolean {
  return isDraft(value);
}
