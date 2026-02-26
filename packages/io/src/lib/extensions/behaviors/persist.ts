import type { IoBehavior } from '../types.js';

type MaybePromise<T> = T | Promise<T>;

const PERSIST_VERSION_TAG = '__iostore_persist_v1__';

export type IoStorageLike = {
  getItem: (key: string) => MaybePromise<string | null>;
  setItem: (key: string, value: string) => MaybePromise<void>;
  subscribe?: (key: string, onChange: (raw: string | null) => void) => () => void;
};

export type PersistOptions = {
  key: string;
  storage?: IoStorageLike;
  version?: number;
  partialize?: (value: unknown) => unknown;
  merge?: (persisted: unknown, current: unknown) => unknown;
  throttleMs?: number;
  syncTabs?: boolean;
  serialize?: (value: unknown) => string;
  deserialize?: (raw: string) => unknown;
  onError?: (error: unknown, phase: 'hydrate' | 'persist') => void;
};

const defaultSerialize = (value: unknown) => JSON.stringify(value);
const defaultDeserialize = (raw: string) => JSON.parse(raw) as unknown;

function resolveStorage(custom?: IoStorageLike): IoStorageLike | null {
  if (custom) return custom;
  if (typeof localStorage !== 'undefined') return localStorage;
  return null;
}

function isPromiseLike<T>(value: MaybePromise<T>): value is Promise<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

function resolveMaybePromise<T>(
  value: MaybePromise<T>,
  onResolved: (resolved: T) => void,
  onRejected: (error: unknown) => void,
): void {
  if (isPromiseLike(value)) {
    void value.then(onResolved).catch(onRejected);
    return;
  }
  onResolved(value);
}

type PersistPayload = {
  [PERSIST_VERSION_TAG]: true;
  version: number;
  state: unknown;
};

function isPersistPayload(value: unknown): value is PersistPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<string, unknown>)[PERSIST_VERSION_TAG] === true &&
    typeof (value as { version?: unknown }).version === 'number' &&
    'state' in (value as Record<string, unknown>)
  );
}

function resolvePayload(
  value: unknown,
): { version: number | undefined; state: unknown } {
  if (isPersistPayload(value)) {
    return {
      version: value.version,
      state: value.state,
    };
  }
  return {
    version: undefined,
    state: value,
  };
}

function toPersistedValue(options: PersistOptions, state: unknown): unknown {
  const partial = options.partialize ? options.partialize(state) : state;
  if (typeof options.version !== 'number') return partial;
  return {
    [PERSIST_VERSION_TAG]: true,
    version: options.version,
    state: partial,
  } satisfies PersistPayload;
}

function hasStaleVersion(options: PersistOptions, storedVersion: number | undefined): boolean {
  if (typeof options.version !== 'number') return false;
  return storedVersion !== options.version;
}

function attachStorageEventListener(
  key: string,
  storage: IoStorageLike,
  onChange: (raw: string | null) => void,
): (() => void) | null {
  const globalObj = globalThis as {
    addEventListener?: (type: string, listener: (event: Event) => void) => void;
    removeEventListener?: (type: string, listener: (event: Event) => void) => void;
  };

  if (
    typeof globalObj.addEventListener !== 'function' ||
    typeof globalObj.removeEventListener !== 'function'
  ) {
    return null;
  }

  const handler = (
    event: Event & {
      key?: string | null;
      newValue?: string | null;
      storageArea?: unknown;
    },
  ) => {
    if (event.key !== key) return;
    if (event.storageArea && event.storageArea !== storage) return;
    onChange(event.newValue ?? null);
  };

  globalObj.addEventListener('storage', handler);
  return () => {
    globalObj.removeEventListener?.('storage', handler);
  };
}

export function persist<T>(options: PersistOptions): IoBehavior<T> {
  const reportError = (error: unknown, phase: 'hydrate' | 'persist'): void => {
    options.onError?.(error, phase);
    if (typeof console !== 'undefined' && typeof console.warn === 'function') {
      console.warn(
        `[@iostore/store/persist] ${phase} failed for key "${options.key}"`,
        error,
      );
    }
  };

  return (view) => {
    const storage = resolveStorage(options.storage);
    const serialize = options.serialize ?? defaultSerialize;
    const deserialize = options.deserialize ?? defaultDeserialize;
    const throttleMs = Math.max(0, options.throttleMs ?? 0);
    const baseSet = view.set?.bind(view);
    const baseGet = view.get.bind(view);

    let destroyed = false;
    let writeEpoch = 0;
    let queue = Promise.resolve();
    let pendingAsyncWrites = 0;
    let pendingRaw: string | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribeSync: (() => void) | undefined;
    let lastWrittenRaw: string | undefined;

    const enqueuePersist = (raw: string) => {
      if (!storage || destroyed) return;
      const write = (): MaybePromise<void> => {
        if (destroyed) return;
        lastWrittenRaw = raw;
        return storage.setItem(options.key, raw);
      };

      if (pendingAsyncWrites === 0) {
        try {
          const result = write();
          if (isPromiseLike(result)) {
            pendingAsyncWrites += 1;
            queue = result
              .catch((error) => {
                reportError(error, 'persist');
              })
              .finally(() => {
                pendingAsyncWrites -= 1;
              });
          }
        } catch (error) {
          reportError(error, 'persist');
        }
        return;
      }

      pendingAsyncWrites += 1;
      queue = queue
        .then(() => write())
        .catch((error) => {
          reportError(error, 'persist');
        })
        .finally(() => {
          pendingAsyncWrites -= 1;
        });
    };

    const flushPending = () => {
      if (!storage || destroyed) return;
      if (pendingRaw === undefined) return;
      const raw = pendingRaw;
      pendingRaw = undefined;
      enqueuePersist(raw);
    };

    const schedulePersist = (raw: string) => {
      pendingRaw = raw;
      if (throttleMs <= 0) {
        flushPending();
        return;
      }

      if (timer !== undefined) return;
      timer = setTimeout(() => {
        timer = undefined;
        flushPending();
      }, throttleMs);
    };

    const resolveHydratedState = (
      raw: string,
    ): {
      hydrated: MaybePromise<T>;
      staleVersion: boolean;
    } => {
      const decoded = deserialize(raw);
      const payload = resolvePayload(decoded);
      const staleVersion = hasStaleVersion(options, payload.version);
      if (staleVersion) {
        return {
          hydrated: baseGet(),
          staleVersion: true,
        };
      }

      let hydrated = payload.state;

      if (options.merge) {
        hydrated = options.merge(hydrated, baseGet());
      }

      return {
        hydrated: hydrated as T,
        staleVersion: false,
      };
    };

    const applyHydrationRaw = (raw: string, epoch: number) => {
      if (destroyed || !baseSet) return;

      try {
        const resolved = resolveHydratedState(raw);
        if (resolved.staleVersion) {
          try {
            const nextRaw = serialize(toPersistedValue(options, baseGet()));
            schedulePersist(nextRaw);
          } catch (error) {
            reportError(error, 'persist');
          }
          return;
        }
        resolveMaybePromise(
          resolved.hydrated,
          (hydrated) => {
            if (destroyed || writeEpoch !== epoch) return;
            baseSet(hydrated);
          },
          (error) => {
            reportError(error, 'hydrate');
          },
        );
      } catch (error) {
        reportError(error, 'hydrate');
      }
    };

    const hydrateFromValue = (value: MaybePromise<string | null>, epoch: number) => {
      if (isPromiseLike(value)) {
        void value
          .then((raw) => {
            if (raw === null) return;
            applyHydrationRaw(raw, epoch);
          })
          .catch((error) => {
            reportError(error, 'hydrate');
          });
        return;
      }

      if (value === null) return;
      applyHydrationRaw(value, epoch);
    };

    if (storage) {
      const hydrateEpoch = writeEpoch;
      try {
        hydrateFromValue(storage.getItem(options.key), hydrateEpoch);
      } catch (error) {
        reportError(error, 'hydrate');
      }
    }

    if (storage && options.syncTabs) {
      const onExternalRaw = (raw: string | null) => {
        if (raw === null) return;
        if (raw === lastWrittenRaw) return;
        applyHydrationRaw(raw, writeEpoch);
      };

      if (typeof storage.subscribe === 'function') {
        unsubscribeSync = storage.subscribe(options.key, onExternalRaw);
      } else {
        unsubscribeSync =
          attachStorageEventListener(options.key, storage, onExternalRaw) ?? undefined;
      }
    }

    const prevDestroy = view.destroy;
    const destroy = () => {
      if (destroyed) return;
      destroyed = true;
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      pendingRaw = undefined;
      unsubscribeSync?.();
      prevDestroy?.();
    };

    return {
      ...view,
      set(next) {
        writeEpoch += 1;
        baseSet?.(next);
        if (!storage) return;
        try {
          const persistedValue = toPersistedValue(options, baseGet());
          const raw = serialize(persistedValue);
          lastWrittenRaw = raw;
          schedulePersist(raw);
        } catch (error) {
          reportError(error, 'persist');
        }
      },
      destroy,
    };
  };
}
