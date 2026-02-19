export type Unsubscribe = () => void;

export type IoQueryKey = unknown;

export type IoRetryValue =
  | number
  | boolean
  | ((failureCount: number, error: unknown) => boolean);

export type IoRetryDelayValue =
  | number
  | ((failureCount: number, error: unknown) => number);

export type IoQueryStatus = 'idle' | 'loading' | 'success' | 'error';

export type IoFetchStatus = 'idle' | 'fetching';

export type IoQueryState<TData = unknown, TError = unknown> = {
  status: IoQueryStatus;
  fetchStatus: IoFetchStatus;
  data?: TData;
  error?: TError;
  updatedAt: number;
  invalidated: boolean;
};

export type IoQueryFnContext = {
  key: IoQueryKey;
  signal: AbortSignal;
  meta?: Record<string, unknown>;
};

export type IoQueryFn<TData> = (
  context: IoQueryFnContext,
) => Promise<TData> | TData;

export type IoQueryOptions<TData = unknown> = {
  key: IoQueryKey;
  queryFn: IoQueryFn<TData>;
  staleTime?: number;
  gcTime?: number;
  retry?: IoRetryValue;
  retryDelay?: IoRetryDelayValue;
  action?: string;
  meta?: Record<string, unknown>;
};

export type IoFetchQueryOptions<TData = unknown> = IoQueryOptions<TData> & {
  force?: boolean;
};

export type IoSetQueryDataOptions = {
  action?: string;
  meta?: Record<string, unknown>;
  updatedAt?: number;
  gcTime?: number;
};

export type IoQueryDataUpdater<TData> =
  | TData
  | ((previous: TData | undefined) => TData);

export type IoQueryClientOptions = {
  defaultStaleTime?: number;
  defaultGcTime?: number;
  defaultRetry?: IoRetryValue;
  defaultRetryDelay?: IoRetryDelayValue;
  hashKey?: (key: IoQueryKey) => string;
};

export type IoQueryMatch = {
  key: IoQueryKey;
  hash: string;
  state: IoQueryState<unknown>;
};

export type IoQueryFilter = {
  key?: IoQueryKey;
  exact?: boolean;
  predicate?: (query: IoQueryMatch) => boolean;
};

export type IoQueryEvent = {
  type: 'updated' | 'invalidated' | 'removed' | 'cancelled';
  key: IoQueryKey;
  hash: string;
  state: IoQueryState<unknown>;
  action?: string;
  meta?: Record<string, unknown>;
};

export type IoQueryClient = {
  fetchQuery: <TData>(options: IoFetchQueryOptions<TData>) => Promise<TData>;
  prefetchQuery: <TData>(options: IoFetchQueryOptions<TData>) => Promise<void>;
  getQueryData: <TData>(key: IoQueryKey) => TData | undefined;
  setQueryData: <TData>(
    key: IoQueryKey,
    updater: IoQueryDataUpdater<TData>,
    options?: IoSetQueryDataOptions,
  ) => TData;
  getQueryState: <TData, TError = unknown>(
    key: IoQueryKey,
  ) => IoQueryState<TData, TError> | undefined;
  invalidateQueries: (
    filter?: IoQueryFilter,
    options?: { action?: string; meta?: Record<string, unknown> },
  ) => number;
  cancelQueries: (filter?: IoQueryFilter) => number;
  removeQueries: (
    filter?: IoQueryFilter,
    options?: { action?: string; meta?: Record<string, unknown> },
  ) => number;
  subscribe: (
    listener: (event: IoQueryEvent) => void,
    filter?: IoQueryFilter,
  ) => Unsubscribe;
  clear: () => void;
};

const DEFAULT_STALE_TIME = 0;
const DEFAULT_GC_TIME = Number.POSITIVE_INFINITY;
const DEFAULT_RETRY_ATTEMPTS = 0;
const RETRY_DELAY_BASE_MS = 1_000;
const RETRY_DELAY_MAX_MS = 30_000;

type StoredQueryOptions = {
  queryFn?: IoQueryFn<unknown>;
  staleTime: number;
  gcTime: number;
  retry: IoRetryValue;
  retryDelay: IoRetryDelayValue;
  meta?: Record<string, unknown>;
};

type InternalInFlight = {
  promise: Promise<unknown>;
  controller: AbortController;
  cancellation: {
    cancelled: boolean;
  };
};

type InternalQueryEntry = {
  key: IoQueryKey;
  hash: string;
  state: IoQueryState<unknown>;
  inFlight?: InternalInFlight;
  gcTimer?: ReturnType<typeof setTimeout>;
  options?: StoredQueryOptions;
};

type Subscriber = {
  listener: (event: IoQueryEvent) => void;
  filter?: IoQueryFilter;
};

function nowEpochMs(): number {
  return Date.now();
}

function cloneState<TData, TError>(
  state: IoQueryState<TData, TError>,
): IoQueryState<TData, TError> {
  return {
    status: state.status,
    fetchStatus: state.fetchStatus,
    data: state.data,
    error: state.error,
    updatedAt: state.updatedAt,
    invalidated: state.invalidated,
  };
}

function createAbortError(): Error {
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

function isAbortError(error: unknown): boolean {
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

function shouldRetry(
  retry: IoRetryValue,
  failureCount: number,
  error: unknown,
): boolean {
  if (typeof retry === 'function') {
    return retry(failureCount, error);
  }
  if (typeof retry === 'number') {
    return failureCount <= retry;
  }
  if (retry === true) {
    return failureCount <= 3;
  }
  return false;
}

function normalizeDelay(delayMs: number): number {
  if (!Number.isFinite(delayMs)) {
    return 0;
  }
  return Math.max(0, delayMs);
}

function calculateRetryDelay(
  retryDelay: IoRetryDelayValue,
  failureCount: number,
  error: unknown,
): number {
  if (typeof retryDelay === 'function') {
    return normalizeDelay(retryDelay(failureCount, error));
  }
  if (typeof retryDelay === 'number') {
    return normalizeDelay(retryDelay);
  }
  return Math.min(
    RETRY_DELAY_BASE_MS * 2 ** Math.max(0, failureCount - 1),
    RETRY_DELAY_MAX_MS,
  );
}

function sleep(delayMs: number, signal: AbortSignal): Promise<void> {
  const normalizedDelay = normalizeDelay(delayMs);
  if (normalizedDelay <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(createAbortError());
    };

    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, normalizedDelay);

    if (signal.aborted) {
      onAbort();
      return;
    }

    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function mergeMeta(
  base?: Record<string, unknown>,
  override?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!base && !override) {
    return undefined;
  }
  if (!base) {
    return override;
  }
  if (!override) {
    return base;
  }
  return {
    ...base,
    ...override,
  };
}

function stableSerialize(value: unknown, seen: WeakSet<object>): string {
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
    return `symbol:${String(value)}`;
  }
  if (valueType === 'function') {
    const fn = value as (...args: unknown[]) => unknown;
    return `function:${fn.name || 'anonymous'}`;
  }

  const objectValue = value as object;
  if (seen.has(objectValue)) {
    throw new Error(
      'createQueryClient: query key cannot contain circular references',
    );
  }
  seen.add(objectValue);
  try {
    if (Array.isArray(value)) {
      const list = value.map((item) => stableSerialize(item, seen));
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
            `${stableSerialize(key, seen)}=>${stableSerialize(mapValue, seen)}`,
        )
        .sort();
      return `map:{${list.join(',')}}`;
    }
    if (value instanceof Set) {
      const list = Array.from(value.values())
        .map((item) => stableSerialize(item, seen))
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
    const keys = Object.keys(record).sort();
    const symbolKeys = Object.getOwnPropertySymbols(record).sort((a, b) =>
      String(a).localeCompare(String(b)),
    );
    const segments: string[] = [];
    for (const key of keys) {
      segments.push(`${key}:${stableSerialize(record[key], seen)}`);
    }
    for (const symbolKey of symbolKeys) {
      segments.push(
        `${String(symbolKey)}:${stableSerialize(record[symbolKey], seen)}`,
      );
    }
    const tag = Object.prototype.toString.call(value);
    return `${tag}:{${segments.join(',')}}`;
  } finally {
    seen.delete(objectValue);
  }
}

function defaultHashKey(key: IoQueryKey): string {
  return stableSerialize(key, new WeakSet<object>());
}

function areKeysEqual(left: unknown, right: unknown): boolean {
  return (
    stableSerialize(left, new WeakSet<object>()) ===
    stableSerialize(right, new WeakSet<object>())
  );
}

function isArrayKeyPrefix(prefix: unknown[], key: unknown[]): boolean {
  if (prefix.length > key.length) {
    return false;
  }
  for (let i = 0; i < prefix.length; i += 1) {
    if (!areKeysEqual(prefix[i], key[i])) {
      return false;
    }
  }
  return true;
}

function matchesFilter(
  query: IoQueryMatch,
  filter: IoQueryFilter | undefined,
  hashKey: (key: IoQueryKey) => string,
): boolean {
  if (!filter) {
    return true;
  }

  if (filter.key !== undefined) {
    const exact = filter.exact ?? false;
    const keyMatches = exact
      ? hashKey(filter.key) === query.hash
      : Array.isArray(filter.key) && Array.isArray(query.key)
        ? isArrayKeyPrefix(filter.key, query.key)
        : hashKey(filter.key) === query.hash;
    if (!keyMatches) {
      return false;
    }
  }

  if (filter.predicate && !filter.predicate(query)) {
    return false;
  }

  return true;
}

export function createQueryClient(
  clientOptions: IoQueryClientOptions = {},
): IoQueryClient {
  const hashKey = clientOptions.hashKey ?? defaultHashKey;
  const entries = new Map<string, InternalQueryEntry>();
  const subscribers = new Set<Subscriber>();

  const resolveStaleTime = (
    entry: InternalQueryEntry,
    override?: number,
  ): number =>
    override ??
    entry.options?.staleTime ??
    clientOptions.defaultStaleTime ??
    DEFAULT_STALE_TIME;

  const resolveGcTime = (
    entry: InternalQueryEntry,
    override?: number,
  ): number =>
    override ??
    entry.options?.gcTime ??
    clientOptions.defaultGcTime ??
    DEFAULT_GC_TIME;

  const resolveRetry = (
    entry: InternalQueryEntry,
    override?: IoRetryValue,
  ): IoRetryValue =>
    override ??
    entry.options?.retry ??
    clientOptions.defaultRetry ??
    DEFAULT_RETRY_ATTEMPTS;

  const resolveRetryDelayOption = (
    entry: InternalQueryEntry,
    override?: IoRetryDelayValue,
  ): IoRetryDelayValue =>
    override ??
    entry.options?.retryDelay ??
    clientOptions.defaultRetryDelay ??
    RETRY_DELAY_BASE_MS;

  const clearGcTimer = (entry: InternalQueryEntry): void => {
    if (!entry.gcTimer) {
      return;
    }
    clearTimeout(entry.gcTimer);
    entry.gcTimer = undefined;
  };

  const toMatch = (entry: InternalQueryEntry): IoQueryMatch => ({
    key: entry.key,
    hash: entry.hash,
    state: cloneState(entry.state),
  });

  const notify = (
    type: IoQueryEvent['type'],
    entry: InternalQueryEntry,
    action?: string,
    meta?: Record<string, unknown>,
  ): void => {
    const event: IoQueryEvent = {
      type,
      key: entry.key,
      hash: entry.hash,
      state: cloneState(entry.state),
      action,
      meta,
    };
    for (const subscriber of subscribers) {
      if (!matchesFilter(toMatch(entry), subscriber.filter, hashKey)) {
        continue;
      }
      subscriber.listener(event);
    }
  };

  const scheduleGc = (entry: InternalQueryEntry, gcTime: number): void => {
    clearGcTimer(entry);
    if (!Number.isFinite(gcTime) || gcTime < 0) {
      return;
    }
    const timer = setTimeout(() => {
      if (entry.inFlight) {
        scheduleGc(entry, gcTime);
        return;
      }
      if (entries.get(entry.hash) !== entry) {
        return;
      }
      entries.delete(entry.hash);
      notify('removed', entry, 'gc');
    }, gcTime);
    if (typeof (timer as { unref?: () => void }).unref === 'function') {
      (timer as { unref: () => void }).unref();
    }
    entry.gcTimer = timer;
  };

  const getOrCreateEntry = (key: IoQueryKey): InternalQueryEntry => {
    const hash = hashKey(key);
    const existing = entries.get(hash);
    if (existing) {
      return existing;
    }
    const created: InternalQueryEntry = {
      key,
      hash,
      state: {
        status: 'idle',
        fetchStatus: 'idle',
        updatedAt: 0,
        invalidated: false,
      },
    };
    entries.set(hash, created);
    return created;
  };

  const fetchQuery = async <TData>(
    optionsInput: IoFetchQueryOptions<TData>,
  ): Promise<TData> => {
    const entry = getOrCreateEntry(optionsInput.key);
    clearGcTimer(entry);

    const staleTime = resolveStaleTime(entry, optionsInput.staleTime);
    const gcTime = resolveGcTime(entry, optionsInput.gcTime);
    const retry = resolveRetry(entry, optionsInput.retry);
    const retryDelay = resolveRetryDelayOption(entry, optionsInput.retryDelay);
    const mergedMeta = mergeMeta(entry.options?.meta, optionsInput.meta);

    entry.options = {
      queryFn: optionsInput.queryFn as IoQueryFn<unknown>,
      staleTime,
      gcTime,
      retry,
      retryDelay,
      meta: mergedMeta,
    };

    const now = nowEpochMs();
    const shouldUseCache =
      !optionsInput.force &&
      entry.state.status === 'success' &&
      !entry.state.invalidated &&
      now - entry.state.updatedAt <= staleTime;
    if (shouldUseCache) {
      scheduleGc(entry, gcTime);
      return entry.state.data as TData;
    }

    if (entry.inFlight) {
      return entry.inFlight.promise as Promise<TData>;
    }

    const previousState = cloneState(entry.state);
    entry.state = {
      ...previousState,
      status: previousState.status === 'idle' ? 'loading' : previousState.status,
      fetchStatus: 'fetching',
      invalidated: false,
    };
    notify('updated', entry, optionsInput.action, mergedMeta);

    const controller = new AbortController();
    const cancellation = { cancelled: false };
    const inFlightRef: {
      current?: InternalInFlight;
    } = {};

    const run = async (): Promise<TData> => {
      let failureCount = 0;
      while (true) {
        if (controller.signal.aborted || cancellation.cancelled) {
          throw createAbortError();
        }
        try {
          const data = await optionsInput.queryFn({
            key: optionsInput.key,
            signal: controller.signal,
            meta: mergedMeta,
          });
          if (controller.signal.aborted || cancellation.cancelled) {
            throw createAbortError();
          }
          return data;
        } catch (error) {
          if (isAbortError(error) || controller.signal.aborted || cancellation.cancelled) {
            throw createAbortError();
          }
          failureCount += 1;
          if (!shouldRetry(retry, failureCount, error)) {
            throw error;
          }
          await sleep(calculateRetryDelay(retryDelay, failureCount, error), controller.signal);
        }
      }
    };

    const promise = run()
      .then((data) => {
        if (entry.inFlight === inFlightRef.current) {
          entry.state = {
            status: 'success',
            fetchStatus: 'idle',
            data,
            error: undefined,
            updatedAt: nowEpochMs(),
            invalidated: false,
          };
          notify('updated', entry, optionsInput.action, mergedMeta);
        }
        return data;
      })
      .catch((error: unknown) => {
        if (entry.inFlight === inFlightRef.current) {
          if (isAbortError(error) || controller.signal.aborted || cancellation.cancelled) {
            entry.state = {
              ...previousState,
              fetchStatus: 'idle',
            };
            notify('cancelled', entry, optionsInput.action, mergedMeta);
            throw createAbortError();
          }
          entry.state = {
            status: 'error',
            fetchStatus: 'idle',
            data: previousState.data,
            error,
            updatedAt: nowEpochMs(),
            invalidated: true,
          };
          notify('updated', entry, optionsInput.action, mergedMeta);
        }
        throw error;
      })
      .finally(() => {
        if (entry.inFlight === inFlightRef.current) {
          entry.inFlight = undefined;
          scheduleGc(entry, gcTime);
        }
      });

    const inFlight: InternalInFlight = {
      promise: promise as Promise<unknown>,
      controller,
      cancellation,
    };
    inFlightRef.current = inFlight;
    entry.inFlight = inFlight;

    return promise;
  };

  const prefetchQuery = async <TData>(
    optionsInput: IoFetchQueryOptions<TData>,
  ): Promise<void> => {
    await fetchQuery(optionsInput);
  };

  const getQueryData = <TData>(key: IoQueryKey): TData | undefined => {
    const entry = entries.get(hashKey(key));
    if (!entry) {
      return undefined;
    }
    scheduleGc(entry, resolveGcTime(entry));
    return entry.state.data as TData | undefined;
  };

  const setQueryData = <TData>(
    key: IoQueryKey,
    updater: IoQueryDataUpdater<TData>,
    optionsInput?: IoSetQueryDataOptions,
  ): TData => {
    const entry = getOrCreateEntry(key);
    clearGcTimer(entry);

    const previousData = entry.state.data as TData | undefined;
    const nextData =
      typeof updater === 'function'
        ? (updater as (previous: TData | undefined) => TData)(previousData)
        : updater;

    const staleTime = resolveStaleTime(entry);
    const gcTime = resolveGcTime(entry, optionsInput?.gcTime);
    const retry = resolveRetry(entry);
    const retryDelay = resolveRetryDelayOption(entry);
    const mergedMeta = mergeMeta(entry.options?.meta, optionsInput?.meta);

    entry.options = {
      queryFn: entry.options?.queryFn,
      staleTime,
      gcTime,
      retry,
      retryDelay,
      meta: mergedMeta,
    };

    entry.state = {
      status: 'success',
      fetchStatus: entry.inFlight ? 'fetching' : 'idle',
      data: nextData,
      error: undefined,
      updatedAt: optionsInput?.updatedAt ?? nowEpochMs(),
      invalidated: false,
    };
    notify('updated', entry, optionsInput?.action, mergedMeta);
    scheduleGc(entry, gcTime);

    return nextData;
  };

  const getQueryState = <TData, TError = unknown>(
    key: IoQueryKey,
  ): IoQueryState<TData, TError> | undefined => {
    const entry = entries.get(hashKey(key));
    if (!entry) {
      return undefined;
    }
    scheduleGc(entry, resolveGcTime(entry));
    return cloneState(entry.state) as IoQueryState<TData, TError>;
  };

  const invalidateQueries = (
    filter?: IoQueryFilter,
    optionsInput?: { action?: string; meta?: Record<string, unknown> },
  ): number => {
    let count = 0;
    for (const entry of entries.values()) {
      if (!matchesFilter(toMatch(entry), filter, hashKey)) {
        continue;
      }
      count += 1;
      entry.state.invalidated = true;
      notify('invalidated', entry, optionsInput?.action, optionsInput?.meta);
      scheduleGc(entry, resolveGcTime(entry));
    }
    return count;
  };

  const cancelQueries = (filter?: IoQueryFilter): number => {
    let count = 0;
    for (const entry of entries.values()) {
      if (!matchesFilter(toMatch(entry), filter, hashKey)) {
        continue;
      }
      if (!entry.inFlight) {
        continue;
      }
      count += 1;
      entry.inFlight.cancellation.cancelled = true;
      entry.inFlight.controller.abort();
    }
    return count;
  };

  const removeQueries = (
    filter?: IoQueryFilter,
    optionsInput?: { action?: string; meta?: Record<string, unknown> },
  ): number => {
    let count = 0;
    for (const entry of Array.from(entries.values())) {
      if (!matchesFilter(toMatch(entry), filter, hashKey)) {
        continue;
      }
      count += 1;
      clearGcTimer(entry);
      if (entry.inFlight) {
        const inFlight = entry.inFlight;
        entry.inFlight = undefined;
        inFlight.cancellation.cancelled = true;
        inFlight.controller.abort();
      }
      entries.delete(entry.hash);
      notify('removed', entry, optionsInput?.action, optionsInput?.meta);
    }
    return count;
  };

  const subscribe = (
    listener: (event: IoQueryEvent) => void,
    filter?: IoQueryFilter,
  ): Unsubscribe => {
    const subscriber: Subscriber = { listener, filter };
    subscribers.add(subscriber);
    return () => {
      subscribers.delete(subscriber);
    };
  };

  const clear = (): void => {
    removeQueries(undefined, { action: 'clear' });
  };

  return {
    fetchQuery,
    prefetchQuery,
    getQueryData,
    setQueryData,
    getQueryState,
    invalidateQueries,
    cancelQueries,
    removeQueries,
    subscribe,
    clear,
  };
}
