import type { IoQueryKey } from './types.js';
import { emitError } from '../utils/debug/debug.js';
import { getInternal } from '../utils/internal/internal-access.js';
import type { IoMutationOp } from '../utils/types/types.js';

export const DEFAULT_STALE_TIME = 0;
export const DEFAULT_GC_TIME = 300_000;
export const DEFAULT_RETRY_ATTEMPTS = 0;

const RETRY_DELAY_BASE_MS = 1_000;
const RETRY_DELAY_MAX_MS = 30_000;

function createInvalidKeyTypeError(type: 'function' | 'symbol'): Error {
  return new Error(`hashKey: query key cannot contain values of type "${type}"`);
}

function serialize(value: unknown, seen: WeakSet<object>): string {
  if (value === null) {
    return 'null';
  }

  const valueType = typeof value;
  if (valueType === 'string') {
    return `str:${value}`;
  }
  if (valueType === 'number') {
    if (Number.isNaN(value)) {
      return 'num:NaN';
    }
    if (Object.is(value, -0)) {
      return 'num:-0';
    }
    return `num:${value}`;
  }
  if (valueType === 'boolean') {
    return value ? 'bool:true' : 'bool:false';
  }
  if (valueType === 'undefined') {
    return 'undefined';
  }
  if (valueType === 'bigint') {
    return `bigint:${(value as bigint).toString()}`;
  }
  if (valueType === 'symbol') {
    throw createInvalidKeyTypeError('symbol');
  }
  if (valueType === 'function') {
    throw createInvalidKeyTypeError('function');
  }

  const objectValue = value as object;
  if (seen.has(objectValue)) {
    throw new Error('hashKey: query key cannot contain circular references');
  }

  seen.add(objectValue);
  try {
    if (Array.isArray(value)) {
      const list = value.map((item) => serialize(item, seen));
      return `array:[${list.join(',')}]`;
    }
    if (value instanceof Date) {
      return `date:${value.toISOString()}`;
    }
    if (value instanceof RegExp) {
      return `regexp:${value.toString()}`;
    }
    if (value instanceof Map) {
      const list = Array.from(value.entries())
        .map(
          ([key, mapValue]) =>
            `${serialize(key, seen)}=>${serialize(mapValue, seen)}`,
        )
        .sort();
      return `map:{${list.join(',')}}`;
    }
    if (value instanceof Set) {
      const list = Array.from(value.values())
        .map((item) => serialize(item, seen))
        .sort();
      return `set:[${list.join(',')}]`;
    }
    if (ArrayBuffer.isView(value)) {
      const bytes = Array.from(
        new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
      );
      return `${value.constructor.name}:[${bytes.join(',')}]`;
    }
    if (value instanceof ArrayBuffer) {
      const bytes = Array.from(new Uint8Array(value));
      return `ArrayBuffer:[${bytes.join(',')}]`;
    }

    const record = value as Record<string | symbol, unknown>;
    // Deterministic hashing requires stable key ordering across runtimes.
    const keys = Object.keys(record).sort();
    if (Object.getOwnPropertySymbols(record).length > 0) {
      throw createInvalidKeyTypeError('symbol');
    }
    const parts: string[] = [];

    for (const key of keys) {
      parts.push(`${key}:${serialize(record[key], seen)}`);
    }

    const tag = Object.prototype.toString.call(value);
    return `${tag}:{${parts.join(',')}}`;
  } finally {
    seen.delete(objectValue);
  }
}

function normalizeDelay(delayMs: number): number {
  if (!Number.isFinite(delayMs)) {
    return 0;
  }
  return Math.max(0, delayMs);
}

export function hashKey(key: IoQueryKey): string {
  return serialize(key, new WeakSet<object>());
}

export function keyMatches(
  queryKey: IoQueryKey,
  filterKey: IoQueryKey,
  exact = false,
  queryKeyHash?: string,
): boolean {
  if (exact) {
    return (queryKeyHash ?? hashKey(queryKey)) === hashKey(filterKey);
  }

  if (filterKey.length > queryKey.length) {
    return false;
  }

  for (let index = 0; index < filterKey.length; index += 1) {
    const left = serialize(queryKey[index], new WeakSet<object>());
    const right = serialize(filterKey[index], new WeakSet<object>());
    if (left !== right) {
      return false;
    }
  }

  return true;
}

export function createAbortError(): Error {
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

export function isAbortError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.name === 'AbortError';
  }

  if (typeof error !== 'object' || error === null) {
    return false;
  }

  if (!('name' in error)) {
    return false;
  }

  return (error as { name?: unknown }).name === 'AbortError';
}

export function shouldRetry(
  failureCount: number,
  maxRetries: number,
  error: unknown,
): boolean {
  if (isAbortError(error)) {
    return false;
  }

  return failureCount <= Math.max(0, maxRetries);
}

export function defaultRetryDelay(attempt: number): number {
  return Math.min(
    RETRY_DELAY_BASE_MS * 2 ** Math.max(0, attempt),
    RETRY_DELAY_MAX_MS,
  );
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(createAbortError());
  }

  const normalizedDelay = normalizeDelay(ms);
  if (normalizedDelay <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(createAbortError());
    };

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, normalizedDelay);

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

type ErrorStore = {
  errorListeners?: ReadonlySet<unknown>;
  ctx?: {
    errorListeners?: ReadonlySet<unknown>;
  };
};

type InternalWithState = {
  getState?: () => unknown;
};

function hasErrorListeners(target: unknown): boolean {
  const internal = getInternal(target) as InternalWithState | undefined;
  const state = internal?.getState?.();
  if (!state || typeof state !== 'object') {
    return false;
  }

  const store = state as ErrorStore;
  const listeners = store.ctx?.errorListeners ?? store.errorListeners;
  return Boolean(listeners && listeners.size > 0);
}

export function reportBackgroundError(
  scope: string,
  error: unknown,
  target?: unknown,
  operation: IoMutationOp = 'applyUpdate',
): void {
  if (isAbortError(error)) {
    return;
  }

  const handledByIoErrorBus = Boolean(target) && hasErrorListeners(target);
  if (handledByIoErrorBus) {
    try {
      emitError(target, error, [], operation);
      return;
    } catch {
      // Fall back to console reporting below.
    }
  }

  const runtimeProcess =
    typeof globalThis === 'object' &&
    globalThis !== null &&
    'process' in globalThis
      ? (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process
      : undefined;

  if (runtimeProcess?.env?.NODE_ENV === 'test') {
    return;
  }

  if (typeof console !== 'undefined' && typeof console.error === 'function') {
    console.error(`[iostore/query] ${scope}`, error);
  }
}
