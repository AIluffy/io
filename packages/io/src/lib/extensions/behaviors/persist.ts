import type { IoBehavior } from '../types.js';

export type IoStorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export type PersistOptions = {
  key: string;
  storage?: IoStorageLike;
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

export function persist<T>(options: PersistOptions): IoBehavior<T> {
  const reportError = (error: unknown, phase: 'hydrate' | 'persist'): void => {
    options.onError?.(error, phase);
    if (typeof console !== 'undefined' && typeof console.warn === 'function') {
      console.warn(
        `[io-store/persist] ${phase} failed for key "${options.key}"`,
        error,
      );
    }
  };

  return (view) => {
    const storage = resolveStorage(options.storage);
    const serialize = options.serialize ?? defaultSerialize;
    const deserialize = options.deserialize ?? defaultDeserialize;
    if (storage) {
      const raw = storage.getItem(options.key);
      if (raw !== null && view.set) {
        try {
          view.set(deserialize(raw) as T);
        } catch (error) {
          reportError(error, 'hydrate');
        }
      }
    }

    return {
      ...view,
      set(next) {
        view.set?.(next);
        if (!storage) return;
        try {
          storage.setItem(options.key, serialize(view.get()));
        } catch (error) {
          reportError(error, 'persist');
        }
      },
    };
  };
}
