import { io } from '../core/api/io.js';
import { getInternal, registerInternal } from '../utils/internal/internal-access.js';
import type { IoUnit } from '../utils/types/types.js';

import { getFocusManager } from './focus-manager.js';
import { getOnlineManager } from './online-manager.js';
import type { InfiniteQueryRecord } from './infinite-query-record.js';
import type {
  InfiniteData,
  IoInfiniteQueryObserver,
  IoInfiniteQueryObserverOptions,
  IoInfiniteQueryObserverResult,
  IoInfiniteQueryState,
} from './types.js';
import { setUnitState } from './unit-state.js';
import { isAbortError, reportBackgroundError } from './utils.js';

type ObserverUnitBox<TData, TError, TPageParam> = {
  value: IoUnit<IoInfiniteQueryObserverResult<TData, TError, TPageParam>>;
};

type ResolvedObserverOptions<TData, TError, TPageParam, TSelected> = {
  enabled: boolean;
  placeholderData?: TSelected | (() => TSelected);
  select?: (data: InfiniteData<TData, TPageParam> | undefined) => TSelected;
  refetchOnMount: false | 'stale' | 'always';
  refetchOnWindowFocus: boolean;
  refetchOnReconnect: boolean;
  onSuccess?: (data: TSelected) => void;
  onError?: (error: TError) => void;
  onSettled?: (data: TSelected | undefined, error: TError | null) => void;
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

function resolveOptions<TData, TError, TPageParam, TSelected>(
  options: IoInfiniteQueryObserverOptions<TData, TError, TPageParam, TSelected>,
  defaults: {
    refetchOnMount: false | 'stale' | 'always';
    refetchOnWindowFocus: boolean;
    refetchOnReconnect: boolean;
  },
): ResolvedObserverOptions<TData, TError, TPageParam, TSelected> {
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

export function createInfiniteQueryObserver<
  TData,
  TError,
  TPageParam,
  TSelected = InfiniteData<TData, TPageParam>,
>(options: {
  record: InfiniteQueryRecord<TData, TError, TPageParam>;
  observerOptions: IoInfiniteQueryObserverOptions<
    TData,
    TError,
    TPageParam,
    TSelected
  >;
  defaultRefetchOnMount: false | 'stale' | 'always';
  defaultRefetchOnWindowFocus: boolean;
  defaultRefetchOnReconnect: boolean;
}): IoInfiniteQueryObserver<TSelected, TError, TPageParam> {
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

  const buildResult = (): IoInfiniteQueryObserverResult<TSelected, TError, TPageParam> => {
    const base = record.getState();
    const baseData = base.data;

    let selected = undefined as TSelected | undefined;
    let isPlaceholderData = false;

    try {
      if (baseData !== undefined) {
        selected = resolvedOptions.select
          ? resolvedOptions.select(baseData)
          : (baseData as unknown as TSelected);
      } else if (base.status === 'pending') {
        selected = resolvePlaceholderData(resolvedOptions.placeholderData);
        isPlaceholderData = selected !== undefined;
      }
    } catch (error) {
      const errorState: IoInfiniteQueryState<TSelected, TError, TPageParam> = {
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
        fetchDirection: null,
      };
      return {
        ...errorState,
        ...record.getFlags(fetchedAfterMount),
        isFetchingNextPage: false,
        isFetchingPreviousPage: false,
      };
    }

    const status =
      isPlaceholderData && base.status === 'pending' ? 'success' : base.status;

    const nextState: IoInfiniteQueryState<TSelected, TError, TPageParam> = {
      status,
      fetchStatus: base.fetchStatus,
      data: selected as unknown as InfiniteData<TSelected, TPageParam> | undefined,
      error: base.error,
      dataUpdatedAt: base.dataUpdatedAt,
      errorUpdatedAt: base.errorUpdatedAt,
      failureCount: base.failureCount,
      failureReason: base.failureReason,
      isInvalidated: base.isInvalidated,
      isPlaceholderData,
      fetchDirection: base.fetchDirection,
    };

    const flags = record.getFlags(fetchedAfterMount);

    return {
      ...nextState,
      ...flags,
      isFetchingNextPage:
        nextState.fetchStatus === 'fetching' && nextState.fetchDirection === 'forward',
      isFetchingPreviousPage:
        nextState.fetchStatus === 'fetching' && nextState.fetchDirection === 'backward',
    };
  };

  const holder = io(
    { value: buildResult() },
    { shallow: true },
  ) as unknown as ObserverUnitBox<TSelected, TError, TPageParam>;
  const unit = holder.value;

  const maybeNotifyCallbacks = (
    next: IoInfiniteQueryObserverResult<TSelected, TError, TPageParam>,
  ): void => {
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
        runCallback(
          'infiniteQueryObserver.onSuccess',
          () => {
            resolvedOptions.onSuccess?.(next.data as TSelected);
          },
          unit,
        );
      }
      if (resolvedOptions.onSettled) {
        runCallback(
          'infiniteQueryObserver.onSettled',
          () => {
            resolvedOptions.onSettled?.(next.data as unknown as TSelected | undefined, null);
          },
          unit,
        );
      }
      return;
    }

    if (next.status === 'error' && next.error !== null) {
      if (resolvedOptions.onError) {
        runCallback(
          'infiniteQueryObserver.onError',
          () => {
            resolvedOptions.onError?.(next.error as TError);
          },
          unit,
        );
      }
      if (resolvedOptions.onSettled) {
        runCallback(
          'infiniteQueryObserver.onSettled',
          () => {
            resolvedOptions.onSettled?.(undefined, next.error as TError);
          },
          unit,
        );
      }
    }
  };

  const sync = (): void => {
    const next = buildResult();
    maybeNotifyCallbacks(next);
    setUnitState(unit, next, {
      action: 'infiniteQuery.observer.sync',
      meta: {
        keyHash: record.keyHash,
      },
    });
  };

  const safeRefetch = (scope: string): void => {
    void record.refetchAllPages().catch((error: unknown) => {
      if (isAbortError(error)) {
        return;
      }
      reportBackgroundError(scope, error, unit);
    });
  };

  const maybeFetchOnMount = (): void => {
    if (!resolvedOptions.enabled || resolvedOptions.refetchOnMount === false) {
      return;
    }

    if (resolvedOptions.refetchOnMount === 'always') {
      safeRefetch('infiniteQueryObserver.refetchOnMount(always)');
      return;
    }

    if (record.isStale()) {
      safeRefetch('infiniteQueryObserver.refetchOnMount(stale)');
    }
  };

  const onFocus = (focused: boolean): void => {
    if (!focused || !resolvedOptions.enabled || !resolvedOptions.refetchOnWindowFocus) {
      return;
    }

    if (!record.isStale()) {
      return;
    }

    safeRefetch('infiniteQueryObserver.refetchOnWindowFocus');
  };

  const onOnline = (online: boolean): void => {
    if (!online || !resolvedOptions.enabled || !resolvedOptions.refetchOnReconnect) {
      return;
    }

    if (!record.isStale()) {
      return;
    }

    safeRefetch('infiniteQueryObserver.refetchOnReconnect');
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

  const observer: IoInfiniteQueryObserver<TSelected, TError, TPageParam> = {
    get: () => unit.get(),
    set: (next) => unit.set(next),
    snapshot: () => unit.snapshot(),
    subscribe: (fn) => unit.subscribe(fn),
    subscribeUpdate: (fn) => unit.subscribeUpdate(fn),
    reset: () => {
      setUnitState(unit, buildResult(), {
        action: 'infiniteQuery.observer.reset',
        meta: {
          keyHash: record.keyHash,
        },
      });
    },
    key: record.key,
    keyHash: record.keyHash,
    query: {
      key: record.key,
      keyHash: record.keyHash,
      fetchNextPage: () => record.fetchNextPage(),
      fetchPreviousPage: () => record.fetchPreviousPage(),
      refetchAllPages: () => record.refetchAllPages(),
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
        record.setData(
          updater as
            | InfiniteData<TData, TPageParam>
            | ((
                prev: InfiniteData<TData, TPageParam> | undefined,
              ) => InfiniteData<TData, TPageParam>),
        );
      },
      getData: () =>
        record.getState().data as unknown as InfiniteData<TSelected, TPageParam> | undefined,
      getState: () =>
        record.getState() as unknown as IoInfiniteQueryState<TSelected, TError, TPageParam>,
      getFlags: () => record.getFlags(fetchedAfterMount),
      get isActive() {
        return record.isActive;
      },
      get observerCount() {
        return record.observerCount;
      },
      subscribe: (fn) =>
        record.subscribe((state) => {
          fn(state as unknown as IoInfiniteQueryState<TSelected, TError, TPageParam>);
        }),
      subscribeUpdate: (fn) => record.subscribeUpdate(fn),
    },
    fetchNextPage: () => record.fetchNextPage(),
    fetchPreviousPage: () => record.fetchPreviousPage(),
    refetchAllPages: () => record.refetchAllPages(),
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
        throw record.getInFlightPromise() ?? record.fetchNextPage();
      }
      return current.data as InfiniteData<TSelected, TPageParam>;
    },
    dispose,
    setOptions: (next) => {
      const previousEnabled = resolvedOptions.enabled;
      resolvedOptions = {
        ...resolvedOptions,
        ...(next as Partial<
          ResolvedObserverOptions<TData, TError, TPageParam, TSelected>
        >),
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
