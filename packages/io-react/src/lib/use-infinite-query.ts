import type {
  InfiniteData,
  IoInfiniteQueryDefinition,
  IoInfiniteQueryHandle,
  IoInfiniteQueryObserver,
  IoInfiniteQueryObserverOptions,
  IoInfiniteQueryObserverResult,
  IoQueryClient,
} from '@iostore/store/query';

import { getDefaultClient, hashKey } from '@iostore/store/query';
import { useEffect, useMemo, useRef } from 'react';

import { useIO } from './use-io.js';

type UseInfiniteQueryDefinitionOptions<TData, TError, TPageParam, TSelected> =
  IoInfiniteQueryDefinition<TData, TError, TPageParam> &
    Omit<
      IoInfiniteQueryObserverOptions<TData, TError, TPageParam, TSelected>,
      'query'
    > & {
      client?: IoQueryClient;
      cancelOnUnmount?: boolean;
    };

type UseInfiniteQueryHandleOptions<TData, TError, TPageParam, TSelected> =
  Omit<
    IoInfiniteQueryObserverOptions<TData, TError, TPageParam, TSelected>,
    'query'
  > & {
    query: IoInfiniteQueryHandle<TData, TError, TPageParam>;
    client?: IoQueryClient;
    cancelOnUnmount?: boolean;
  };

export type UseInfiniteQueryOptions<
  TData,
  TError = Error,
  TPageParam = unknown,
  TSelected = InfiniteData<TData, TPageParam>,
> =
  | UseInfiniteQueryDefinitionOptions<TData, TError, TPageParam, TSelected>
  | UseInfiniteQueryHandleOptions<TData, TError, TPageParam, TSelected>;

export type UseInfiniteQueryResult<
  TData,
  TError = Error,
  TPageParam = unknown,
  TSelected = InfiniteData<TData, TPageParam>,
> = IoInfiniteQueryObserverResult<TSelected, TError, TPageParam> & {
  fetchNextPage: () => Promise<InfiniteData<TData, TPageParam>>;
  fetchPreviousPage: () => Promise<InfiniteData<TData, TPageParam>>;
  refetch: () => Promise<InfiniteData<TData, TPageParam>>;
  prefetch: () => Promise<void>;
  invalidate: (refetch?: boolean) => void;
  cancel: () => void;
  query: IoInfiniteQueryHandle<TData, TError, TPageParam>;
  observer: IoInfiniteQueryObserver<TSelected, TError, TPageParam>;
};

export type UseSuspenseInfiniteQueryResult<
  TData,
  TError = Error,
  TPageParam = unknown,
  TSelected = InfiniteData<TData, TPageParam>,
> = UseInfiniteQueryResult<TData, TError, TPageParam, TSelected> & {
  data: TSelected;
};

function isHandleOptions<TData, TError, TPageParam, TSelected>(
  options: UseInfiniteQueryOptions<TData, TError, TPageParam, TSelected>,
): options is UseInfiniteQueryHandleOptions<TData, TError, TPageParam, TSelected> {
  return 'query' in options;
}

function resolveObserverOptions<TData, TError, TPageParam, TSelected>(
  options: UseInfiniteQueryOptions<TData, TError, TPageParam, TSelected>,
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
  options: UseInfiniteQueryOptions<TData, TError, TPageParam, TSelected>,
): UseInfiniteQueryResult<TData, TError, TPageParam, TSelected> {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const client = options.client ?? getDefaultClient();
  const keyHash = isHandleOptions(options)
    ? options.query.keyHash
    : hashKey(options.key);

  const infiniteQuery = useMemo(() => {
    if (isHandleOptions(optionsRef.current)) {
      return optionsRef.current.query as IoInfiniteQueryHandle<
        TData,
        TError,
        TPageParam
      >;
    }

    const current = optionsRef.current as UseInfiniteQueryDefinitionOptions<
      TData,
      TError,
      TPageParam,
      TSelected
    >;

    const existing = client.getInfiniteQuery<TData, TError, TPageParam>(
      current.key,
    );
    if (existing) {
      return existing;
    }

    return client.defineInfiniteQuery<TData, TError, TPageParam>({
      key: current.key,
      queryFn: current.queryFn,
      staleTime: current.staleTime,
      gcTime: current.gcTime,
      retry: current.retry,
      retryDelay: current.retryDelay,
      initialPageParam: current.initialPageParam,
      getNextPageParam: current.getNextPageParam,
      getPreviousPageParam: current.getPreviousPageParam,
      maxPages: current.maxPages,
    });
  }, [client, keyHash]);

  const observer = useMemo(() => {
    return client.observeInfiniteQuery<TData, TError, TPageParam, TSelected>(
      resolveObserverOptions(optionsRef.current, infiniteQuery),
    );
  }, [client, infiniteQuery]);

  useEffect(
    () => () => {
      if (optionsRef.current.cancelOnUnmount) {
        observer.cancel();
      }
      observer.dispose();
    },
    [observer],
  );

  const state = useIO(observer);

  return {
    ...state,
    fetchNextPage: () => infiniteQuery.fetchNextPage(),
    fetchPreviousPage: () => infiniteQuery.fetchPreviousPage(),
    refetch: () => infiniteQuery.refetchAllPages(),
    prefetch: () => infiniteQuery.prefetch(),
    invalidate: (refetch = true) => {
      infiniteQuery.invalidate(refetch);
    },
    cancel: () => {
      infiniteQuery.cancel();
    },
    query: infiniteQuery,
    observer,
  };
}

export function useSuspenseInfiniteQuery<
  TData,
  TError = Error,
  TPageParam = unknown,
  TSelected = InfiniteData<TData, TPageParam>,
>(
  options: UseInfiniteQueryOptions<TData, TError, TPageParam, TSelected>,
): UseSuspenseInfiniteQueryResult<TData, TError, TPageParam, TSelected> {
  const result = useInfiniteQuery<TData, TError, TPageParam, TSelected>(options);

  if (result.status === 'error' && result.error !== null) {
    throw result.error;
  }

  if (result.status === 'pending') {
    throw result.query.fetchNextPage();
  }

  const data = result.observer.read() as unknown as TSelected;

  return {
    ...result,
    data,
  } as UseSuspenseInfiniteQueryResult<TData, TError, TPageParam, TSelected>;
}
