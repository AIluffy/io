import type {
  InfiniteData,
  IoInfiniteQueryDefinition,
  IoInfiniteQueryHandle,
  IoInfiniteQueryObserver,
  IoInfiniteQueryObserverOptions,
  IoInfiniteQueryObserverResult,
  IoQueryClient,
} from '@iostore/store/query';
import type { ShallowRef } from 'vue';

import { getDefaultClient } from '@iostore/store/query';
import { onScopeDispose } from 'vue';

import { useIO, useIOSelector } from './adapters.js';

type IoUseInfiniteQueryDefinitionOptions<TData, TError, TPageParam, TSelected> =
  IoInfiniteQueryDefinition<TData, TError, TPageParam> &
    Omit<
      IoInfiniteQueryObserverOptions<TData, TError, TPageParam, TSelected>,
      'query'
    > & {
      client?: IoQueryClient;
      cancelOnDispose?: boolean;
    };

type IoUseInfiniteQueryHandleOptions<TData, TError, TPageParam, TSelected> =
  Omit<
    IoInfiniteQueryObserverOptions<TData, TError, TPageParam, TSelected>,
    'query'
  > & {
    query: IoInfiniteQueryHandle<TData, TError, TPageParam>;
    client?: IoQueryClient;
    cancelOnDispose?: boolean;
  };

type IoUseInfiniteQueryOptions<
  TData,
  TError = Error,
  TPageParam = unknown,
  TSelected = InfiniteData<TData, TPageParam>,
> =
  | IoUseInfiniteQueryDefinitionOptions<TData, TError, TPageParam, TSelected>
  | IoUseInfiniteQueryHandleOptions<TData, TError, TPageParam, TSelected>;

export type IoVueInfiniteQueryResult<
  TData,
  TError = Error,
  TPageParam = unknown,
  TSelected = InfiniteData<TData, TPageParam>,
> = {
  state: ShallowRef<IoInfiniteQueryObserverResult<TSelected, TError, TPageParam>>;
  data: ShallowRef<TSelected | undefined>;
  fetchNextPage: () => Promise<InfiniteData<TData, TPageParam>>;
  fetchPreviousPage: () => Promise<InfiniteData<TData, TPageParam>>;
  refetch: () => Promise<InfiniteData<TData, TPageParam>>;
  prefetch: () => Promise<void>;
  invalidate: (refetch?: boolean) => void;
  cancel: () => void;
  query: IoInfiniteQueryHandle<TData, TError, TPageParam>;
  observer: IoInfiniteQueryObserver<TSelected, TError, TPageParam>;
};

function isHandleOptions<TData, TError, TPageParam, TSelected>(
  options: IoUseInfiniteQueryOptions<TData, TError, TPageParam, TSelected>,
): options is IoUseInfiniteQueryHandleOptions<TData, TError, TPageParam, TSelected> {
  return 'query' in options;
}

function resolveInfiniteObserverOptions<TData, TError, TPageParam, TSelected>(
  options: IoUseInfiniteQueryOptions<TData, TError, TPageParam, TSelected>,
  query: IoInfiniteQueryHandle<TData, TError, TPageParam>,
): IoInfiniteQueryObserverOptions<TData, TError, TPageParam, TSelected> {
  return {
    query,
    enabled: options.enabled,
    placeholderData: options.placeholderData,
    select: options.select,
    refetchOnMount: options.refetchOnMount,
    refetchOnWindowFocus: options.refetchOnWindowFocus,
    refetchOnReconnect: options.refetchOnReconnect,
    onSuccess: options.onSuccess,
    onError: options.onError,
    onSettled: options.onSettled,
  };
}

export function useInfiniteQuery<
  TData,
  TError = Error,
  TPageParam = unknown,
  TSelected = InfiniteData<TData, TPageParam>,
>(
  options: IoUseInfiniteQueryOptions<TData, TError, TPageParam, TSelected>,
): IoVueInfiniteQueryResult<TData, TError, TPageParam, TSelected> {
  const client = options.client ?? getDefaultClient();

  const query = isHandleOptions(options)
    ? options.query
    : client.defineInfiniteQuery<TData, TError, TPageParam>({
        key: options.key,
        queryFn: options.queryFn,
        staleTime: options.staleTime,
        gcTime: options.gcTime,
        retry: options.retry,
        retryDelay: options.retryDelay,
        initialPageParam: options.initialPageParam,
        getNextPageParam: options.getNextPageParam,
        getPreviousPageParam: options.getPreviousPageParam,
        maxPages: options.maxPages,
      });

  const observer = client.observeInfiniteQuery<TData, TError, TPageParam, TSelected>(
    resolveInfiniteObserverOptions(options, query),
  );

  const state = useIO(observer);
  const data = useIOSelector(observer, (value) => value.data as unknown as TSelected | undefined);

  onScopeDispose(() => {
    if (options.cancelOnDispose) {
      observer.cancel();
    }
    observer.dispose();
  });

  return {
    state,
    data,
    fetchNextPage: () => query.fetchNextPage(),
    fetchPreviousPage: () => query.fetchPreviousPage(),
    refetch: () => query.refetchAllPages(),
    prefetch: () => query.prefetch(),
    invalidate: (refetch = true) => query.invalidate(refetch),
    cancel: () => query.cancel(),
    query,
    observer,
  };
}
