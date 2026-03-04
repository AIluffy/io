import { deriveQueryFlags } from './query.js';
import type {
  InfiniteData,
  IoInfiniteQueryDefinition,
  IoInfiniteQueryDerivedFlags,
  IoInfiniteQueryState,
} from './types.js';

export function createInitialInfiniteQueryState<TData, TError, TPageParam>(): IoInfiniteQueryState<
  TData,
  TError,
  TPageParam
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
    fetchDirection: null,
  };
}

export function cloneInfiniteData<TData, TPageParam>(
  data: InfiniteData<TData, TPageParam> | undefined,
): InfiniteData<TData, TPageParam> {
  if (!data) {
    return { pages: [], pageParams: [] };
  }

  return {
    pages: [...data.pages],
    pageParams: [...data.pageParams],
  };
}

export function toHydratedInfiniteState<TData, TError, TPageParam>(
  state: IoInfiniteQueryState<TData, TError, TPageParam>,
): Partial<IoInfiniteQueryState<TData, TError, TPageParam>> {
  return {
    ...state,
    fetchStatus: 'idle',
    fetchDirection: null,
    isPlaceholderData: false,
  };
}

export function deriveInfiniteQueryFlags<TData, TError, TPageParam>(options: {
  state: IoInfiniteQueryState<TData, TError, TPageParam>;
  definition: IoInfiniteQueryDefinition<TData, TError, TPageParam>;
  isStale: boolean;
  isFetchedAfterMount: boolean;
}): IoInfiniteQueryDerivedFlags {
  const { state, definition } = options;
  const queryFlags = deriveQueryFlags(state, {
    isStale: options.isStale,
    isFetchedAfterMount: options.isFetchedAfterMount,
  });

  return {
    ...queryFlags,
    isFetchingNextPage: state.fetchStatus === 'fetching' && state.fetchDirection === 'forward',
    isFetchingPreviousPage:
      state.fetchStatus === 'fetching' && state.fetchDirection === 'backward',
    hasNextPage: (() => {
      if (!state.data || state.data.pages.length === 0) {
        return true;
      }

      const lastIndex = state.data.pages.length - 1;
      return (
        definition.getNextPageParam(
          state.data.pages[lastIndex] as TData,
          state.data.pages,
          state.data.pageParams[lastIndex] as TPageParam,
          state.data.pageParams,
        ) != null
      );
    })(),
    hasPreviousPage: (() => {
      if (!definition.getPreviousPageParam || !state.data || state.data.pages.length === 0) {
        return false;
      }
      return (
        definition.getPreviousPageParam(
          state.data.pages[0] as TData,
          state.data.pages,
          state.data.pageParams[0] as TPageParam,
          state.data.pageParams,
        ) != null
      );
    })(),
  };
}
