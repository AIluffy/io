import type {
  IoQueryDerivedFlags,
  IoQueryState,
} from './types.js';

export function createInitialQueryState<TData, TError>(): IoQueryState<
  TData,
  TError
> {
  return {
    status: 'pending',
    fetchStatus: 'idle',
    data: undefined,
    error: null,
    dataUpdatedAt: 0,
    errorUpdatedAt: 0,
    failureCount: 0,
    failureReason: null,
    isInvalidated: false,
    isPlaceholderData: false,
  };
}

export function deriveQueryFlags<TData, TError>(
  state: IoQueryState<TData, TError>,
  options: {
    isStale?: boolean;
    isFetchedAfterMount?: boolean;
  } = {},
): IoQueryDerivedFlags {
  const isPending = state.status === 'pending';
  const isSuccess = state.status === 'success';
  const isError = state.status === 'error';
  const isFetching = state.fetchStatus === 'fetching';
  const hasData = state.data !== undefined;
  const isFetched = state.dataUpdatedAt > 0 || state.errorUpdatedAt > 0;

  return {
    isPending,
    isSuccess,
    isError,
    isFetching,
    isLoading: isPending && isFetching,
    isRefetching: isSuccess && isFetching,
    isStale:
      options.isStale ?? (state.isInvalidated || state.status !== 'success'),
    hasData,
    isFetched,
    isFetchedAfterMount: options.isFetchedAfterMount ?? false,
  };
}
