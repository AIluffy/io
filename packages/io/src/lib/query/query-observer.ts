import { io } from '../core/api/io.js';
import { getInternal, registerInternal } from '../utils/internal/internal-access.js';
import type { IoUnit } from '../utils/types/types.js';

import { getFocusManager } from './focus-manager.js';
import { getOnlineManager } from './online-manager.js';
import { deriveQueryFlags } from './query.js';
import type { QueryRecord } from './query-record.js';
import type {
  IoQueryObserver,
  IoQueryObserverOptions,
  IoQueryObserverResult,
  IoQueryState,
} from './types.js';
import { setUnitState } from './unit-state.js';
import {
  isAbortError,
  reportBackgroundError,
} from './utils.js';

type ObserverUnitBox<TData, TError> = {
  value: IoUnit<IoQueryObserverResult<TData, TError>>;
};

type ResolvedObserverOptions<TData, TError, TSelected> = {
  enabled: boolean;
  placeholderData?: TSelected | (() => TSelected);
  select?: (data: TData | undefined) => TSelected;
  refetchOnMount: false | 'stale' | 'always';
  refetchOnWindowFocus: boolean;
  refetchOnReconnect: boolean;
  onSuccess?: (data: TSelected) => void;
  onError?: (error: TError) => void;
  onSettled?: (data: TSelected | undefined, error: TError | null) => void;
};

type SelectedDataResult<TData, TError> = {
  state: IoQueryState<TData, TError>;
};

function resolvePlaceholderData<TData>(
  value: TData | (() => TData) | undefined,
): TData | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'function') {
    return (value as () => TData)();
  }
  return value;
}

function runCallback(scope: string, fn: () => void, target?: unknown): void {
  try {
    fn();
  } catch (error) {
    reportBackgroundError(scope, error, target);
  }
}

function resolveOptions<TData, TError, TSelected>(
  options: IoQueryObserverOptions<TData, TError, TSelected>,
  defaults: {
    refetchOnMount: false | 'stale' | 'always';
    refetchOnWindowFocus: boolean;
    refetchOnReconnect: boolean;
  },
): ResolvedObserverOptions<TData, TError, TSelected> {
  return {
    enabled: options.enabled ?? true,
    placeholderData: options.placeholderData,
    select: options.select,
    refetchOnMount: options.refetchOnMount ?? defaults.refetchOnMount,
    refetchOnWindowFocus:
      options.refetchOnWindowFocus ?? defaults.refetchOnWindowFocus,
    refetchOnReconnect: options.refetchOnReconnect ?? defaults.refetchOnReconnect,
    onSuccess: options.onSuccess,
    onError: options.onError,
    onSettled: options.onSettled,
  };
}

function deriveSelectedData<TData, TError, TSelected>(
  baseResult: IoQueryState<TData, TError>,
  resolvedOptions: ResolvedObserverOptions<TData, TError, TSelected>,
): SelectedDataResult<TSelected, TError> {
  const baseData = baseResult.data as TData | undefined;
  let selected: TSelected | undefined;
  let isPlaceholderData = false;

  if (baseData !== undefined) {
    selected = resolvedOptions.select
      ? resolvedOptions.select(baseData)
      : (baseData as unknown as TSelected);
  } else if (baseResult.status === 'pending') {
    selected = resolvePlaceholderData(resolvedOptions.placeholderData);
    isPlaceholderData = selected !== undefined;
  }

  const status =
    isPlaceholderData && baseResult.status === 'pending' ? 'success' : baseResult.status;

  return {
    state: {
      status,
      fetchStatus: baseResult.fetchStatus,
      data: selected,
      error: baseResult.error,
      dataUpdatedAt: baseResult.dataUpdatedAt,
      errorUpdatedAt: baseResult.errorUpdatedAt,
      failureCount: baseResult.failureCount,
      failureReason: baseResult.failureReason,
      isInvalidated: baseResult.isInvalidated,
      isPlaceholderData,
    },
  };
}

function assembleObserverResult<TData, TError>(
  selectedResult: IoQueryState<TData, TError>,
  flags: ReturnType<typeof deriveQueryFlags>,
): IoQueryObserverResult<TData, TError> {
  return {
    ...selectedResult,
    ...flags,
  };
}

function buildQueryActions<TData, TError, TSelected>(
  record: QueryRecord<TData, TError>,
  fetchedAfterMount: () => boolean,
): IoQueryObserver<TSelected, TError>['query'] {
  return {
    key: record.key,
    keyHash: record.keyHash,
    fetch: (force = false) => record.fetch(force),
    prefetch: () => record.prefetch(),
    ensureData: () => record.ensureData(),
    invalidate: (refetch = true) => {
      record.invalidate(refetch);
    },
    cancel: () => {
      record.cancel();
    },
    reset: () => {
      record.reset();
    },
    setData: (updater) => {
      record.setData(updater as TData | ((prev: TData | undefined) => TData));
    },
    getData: () => record.getState().data as unknown as TSelected | undefined,
    getState: () => record.getState() as unknown as IoQueryState<TSelected, TError>,
    getFlags: () => record.getFlags(fetchedAfterMount()),
    get isActive() {
      return record.isActive;
    },
    get observerCount() {
      return record.observerCount;
    },
    subscribe: (fn) =>
      record.subscribe((state) => {
        fn(state as unknown as IoQueryState<TSelected, TError>);
      }),
    subscribeUpdate: (fn) => record.subscribeUpdate(fn),
  };
}

export function createQueryObserver<TData, TError, TSelected = TData>(options: {
  record: QueryRecord<TData, TError>;
  observerOptions: IoQueryObserverOptions<TData, TError, TSelected>;
  defaultRefetchOnMount: false | 'stale' | 'always';
  defaultRefetchOnWindowFocus: boolean;
  defaultRefetchOnReconnect: boolean;
}): IoQueryObserver<TSelected, TError> {
  const { record } = options;
  const focusManager = getFocusManager();
  const onlineManager = getOnlineManager();

  let resolvedOptions = resolveOptions(options.observerOptions, {
    refetchOnMount: options.defaultRefetchOnMount,
    refetchOnWindowFocus: options.defaultRefetchOnWindowFocus,
    refetchOnReconnect: options.defaultRefetchOnReconnect,
  });

  const mountedAt = Date.now();
  let fetchedAfterMount = false;
  let lastSettledAt = Math.max(
    record.getState().dataUpdatedAt,
    record.getState().errorUpdatedAt,
  );

  const buildResult = (): IoQueryObserverResult<TSelected, TError> => {
    const base = record.getState();
    try {
      const selectedResult = deriveSelectedData(base, resolvedOptions);
      const flags = deriveQueryFlags(selectedResult.state, {
        isStale: record.isStale(base),
        isFetchedAfterMount: fetchedAfterMount,
      });
      return assembleObserverResult(selectedResult.state, flags);
    } catch (error) {
      const errorState: IoQueryState<TSelected, TError> = {
        status: 'error',
        fetchStatus: 'idle',
        data: undefined,
        error: error as TError,
        dataUpdatedAt: base.dataUpdatedAt,
        errorUpdatedAt: Date.now(),
        failureCount: base.failureCount,
        failureReason: error as TError,
        isInvalidated: base.isInvalidated,
        isPlaceholderData: false,
      };
      const flags = deriveQueryFlags(errorState, {
        isStale: record.isStale(base),
        isFetchedAfterMount: fetchedAfterMount,
      });
      return assembleObserverResult(errorState, flags);
    }
  };

  const holder = io(
    { value: buildResult() },
    { shallow: true },
  ) as unknown as ObserverUnitBox<TSelected, TError>;
  const unit = holder.value;

  const maybeNotifyCallbacks = (next: IoQueryObserverResult<TSelected, TError>): void => {
    const settledAt = Math.max(next.dataUpdatedAt, next.errorUpdatedAt);
    if (settledAt <= lastSettledAt) {
      return;
    }

    lastSettledAt = settledAt;
    if (settledAt >= mountedAt) {
      fetchedAfterMount = true;
    }

    if (next.status === 'success') {
      if (resolvedOptions.onSuccess && next.data !== undefined) {
        runCallback('queryObserver.onSuccess', () => {
          resolvedOptions.onSuccess?.(next.data as TSelected);
        }, unit);
      }
      if (resolvedOptions.onSettled) {
        runCallback('queryObserver.onSettled', () => {
          resolvedOptions.onSettled?.(next.data, null);
        }, unit);
      }
      return;
    }

    if (next.status === 'error' && next.error !== null) {
      if (resolvedOptions.onError) {
        runCallback('queryObserver.onError', () => {
          resolvedOptions.onError?.(next.error as TError);
        }, unit);
      }
      if (resolvedOptions.onSettled) {
        runCallback('queryObserver.onSettled', () => {
          resolvedOptions.onSettled?.(undefined, next.error as TError);
        }, unit);
      }
    }
  };

  const sync = (): void => {
    const next = buildResult();
    maybeNotifyCallbacks(next);
    setUnitState(unit, next, {
      action: 'query.observer.sync',
      meta: {
        keyHash: record.keyHash,
      },
    });
  };

  const safeFetch = (force: boolean, scope: string): void => {
    void record.fetch(force).catch((error: unknown) => {
      if (isAbortError(error)) {
        return;
      }
      reportBackgroundError(scope, error, unit);
    });
  };

  const maybeFetchOnMount = (): void => {
    if (!resolvedOptions.enabled) {
      return;
    }

    if (resolvedOptions.refetchOnMount === false) {
      return;
    }

    if (resolvedOptions.refetchOnMount === 'always') {
      safeFetch(true, 'queryObserver.refetchOnMount(always)');
      return;
    }

    safeFetch(false, 'queryObserver.refetchOnMount(stale)');
  };

  const onFocus = (focused: boolean): void => {
    if (!focused || !resolvedOptions.enabled || !resolvedOptions.refetchOnWindowFocus) {
      return;
    }

    if (!record.isStale()) {
      return;
    }

    safeFetch(false, 'queryObserver.refetchOnWindowFocus');
  };

  const onOnline = (online: boolean): void => {
    if (!online || !resolvedOptions.enabled || !resolvedOptions.refetchOnReconnect) {
      return;
    }

    if (!record.isStale()) {
      return;
    }

    safeFetch(false, 'queryObserver.refetchOnReconnect');
  };

  const recordUnsub = record.subscribe(() => {
    sync();
  });
  const focusUnsub = focusManager.subscribe(onFocus);
  const onlineUnsub = onlineManager.subscribe(onOnline);

  maybeFetchOnMount();

  let disposed = false;
  const dispose = (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    recordUnsub();
    focusUnsub();
    onlineUnsub();
  };

  const queryActions = buildQueryActions(record, () => fetchedAfterMount);

  const observer: IoQueryObserver<TSelected, TError> = {
    get: () => unit.get(),
    set: (next) => unit.set(next),
    snapshot: () => unit.snapshot(),
    subscribe: (fn) => unit.subscribe(fn),
    subscribeUpdate: (fn) => unit.subscribeUpdate(fn),
    reset: () => {
      setUnitState(unit, buildResult(), {
        action: 'query.observer.reset',
        meta: {
          keyHash: record.keyHash,
        },
      });
    },
    key: record.key,
    keyHash: record.keyHash,
    query: queryActions,
    fetch: () => record.fetch(false),
    refetch: () => record.fetch(true),
    prefetch: () => record.prefetch(),
    invalidate: (refetch = true) => {
      record.invalidate(refetch);
    },
    cancel: () => {
      record.cancel();
    },
    read: () => {
      const current = unit.get();
      if (current.status === 'error' && current.error !== null) {
        throw current.error;
      }
      if (current.status === 'pending') {
        throw record.getInFlightPromise() ?? record.fetch(false);
      }
      return current.data as TSelected;
    },
    dispose,
    setOptions: (next) => {
      const previousEnabled = resolvedOptions.enabled;
      resolvedOptions = {
        ...resolvedOptions,
        ...(next as Partial<ResolvedObserverOptions<TData, TError, TSelected>>),
      };
      sync();

      if (!previousEnabled && resolvedOptions.enabled) {
        maybeFetchOnMount();
      }
    },
  };

  const internal = getInternal(unit);
  if (internal) {
    registerInternal(observer as object, internal);
  }

  return observer;
}
