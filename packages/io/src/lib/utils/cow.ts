import { cloneValue } from './snapshot.js';

type DraftState = {
  base: object;
  copy: object | undefined;
  modified: boolean;
  drafts: Map<PropertyKey, unknown>;
};

const draftToState = new WeakMap<object, DraftState>();
const baseToDraft = new WeakMap<object, object>();

const DRAFT_STATE = Symbol.for('io-store/draftState');

function isDraft(value: unknown): value is object {
  if (value === null || value === undefined) return false;
  if (typeof value !== 'object') return false;
  return draftToState.has(value);
}

function getState(draft: object): DraftState {
  const state = draftToState.get(draft);
  if (!state) throw new Error('COW: missing draft state');
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
  };

  const proxy = new Proxy(target, {
    get(_target, prop) {
      if (prop === DRAFT_STATE) return state;

      const source = currentSource(state) as Record<PropertyKey, unknown>;

      // Array mutators must run against the writable copy. Calling the method
      // directly on base would mutate frozen snapshots and break sharing.
      if (Array.isArray(source) && arrayMutators.has(prop)) {
        const fn = (source as unknown as Record<PropertyKey, unknown>)[prop];
        if (typeof fn !== 'function') return fn;
        return (...args: unknown[]) => {
          const copy = ensureCopy(state) as unknown[];
          const method = (copy as unknown as Record<PropertyKey, unknown>)[
            prop
          ];
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

  draftToState.set(proxy, state);
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
  const state = getState(draft);

  // No local writes means full structural sharing is valid.
  if (!state.modified) return state.base as T;

  const result = state.copy as Record<PropertyKey, unknown>;
  for (const [prop, child] of state.drafts.entries()) {
    const finalized = finalize(child);
    if (result[prop] !== finalized) result[prop] = finalized;
  }

  Object.freeze(result);
  return result as T;
}

export function isDraftValue(value: unknown): boolean {
  return isDraft(value);
}
