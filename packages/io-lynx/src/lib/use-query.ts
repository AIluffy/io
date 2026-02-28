import type {
  IoQueryClient,
  IoQueryDefinition,
  IoQueryHandle,
  IoQueryObserver,
  IoQueryObserverOptions,
  IoQueryObserverResult,
} from '@iostore/store/query';

import {
  getDefaultClient,
  hashKey,
} from '@iostore/store/query';
import { useEffect, useMemo, useRef } from '@lynx-js/react';

import { useIO } from './use-io.js';

type IoUseQueryDefinitionOptions<TData, TError, TSelected> =
  IoQueryDefinition<TData, TError> &
    Omit<IoQueryObserverOptions<TData, TError, TSelected>, 'query'> & {
      client?: IoQueryClient;
      cancelOnUnmount?: boolean;
    };

type IoUseQueryHandleOptions<TData, TError, TSelected> =
  Omit<IoQueryObserverOptions<TData, TError, TSelected>, 'query'> & {
    query: IoQueryHandle<TData, TError>;
    client?: IoQueryClient;
    cancelOnUnmount?: boolean;
  };

type IoUseQueryOptions<TData, TError = Error, TSelected = TData> =
  | IoUseQueryDefinitionOptions<TData, TError, TSelected>
  | IoUseQueryHandleOptions<TData, TError, TSelected>;

export type IoLynxQueryResult<TData, TError = Error, TSelected = TData> =
  IoQueryObserverResult<TSelected, TError> & {
    fetch: () => Promise<TData>;
    refetch: () => Promise<TData>;
    prefetch: () => Promise<void>;
    invalidate: (refetch?: boolean) => void;
    cancel: () => void;
    query: IoQueryHandle<TData, TError>;
    observer: IoQueryObserver<TSelected, TError>;
  };

function isHandleOptions<TData, TError, TSelected>(
  options: IoUseQueryOptions<TData, TError, TSelected>,
): options is IoUseQueryHandleOptions<TData, TError, TSelected> {
  return 'query' in options;
}

function resolveObserverOptions<TData, TError, TSelected>(
  options: IoUseQueryOptions<TData, TError, TSelected>,
  query: IoQueryHandle<TData, TError>,
): IoQueryObserverOptions<TData, TError, TSelected> {
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

export function useQuery<TData, TError = Error, TSelected = TData>(
  options: IoUseQueryOptions<TData, TError, TSelected>,
): IoLynxQueryResult<TData, TError, TSelected> {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const client = options.client ?? getDefaultClient();
  const keyHash = isHandleOptions(options)
    ? options.query.keyHash
    : hashKey(options.key);

  const query = useMemo(() => {
    if (isHandleOptions(optionsRef.current)) {
      return optionsRef.current.query as IoQueryHandle<TData, TError>;
    }

    const current = optionsRef.current as IoUseQueryDefinitionOptions<
      TData,
      TError,
      TSelected
    >;

    return (
      client.getQuery<TData, TError>(current.key) ??
      client.defineQuery<TData, TError>({
        key: current.key,
        queryFn: current.queryFn,
        staleTime: current.staleTime,
        gcTime: current.gcTime,
        retry: current.retry,
        retryDelay: current.retryDelay,
      })
    );
  }, [client, keyHash]);

  const observer = useMemo(() => {
    return client.observeQuery<TData, TError, TSelected>(
      resolveObserverOptions(optionsRef.current, query),
    );
  }, [client, query]);

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
    fetch: () => query.fetch(false),
    refetch: () => query.fetch(true),
    prefetch: () => query.prefetch(),
    invalidate: (refetch = true) => query.invalidate(refetch),
    cancel: () => query.cancel(),
    query,
    observer,
  };
}
