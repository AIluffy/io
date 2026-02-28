import type {
  IoQueryClient,
  IoQueryDefinition,
  IoQueryHandle,
  IoQueryObserver,
  IoQueryObserverOptions,
  IoQueryObserverResult,
} from '@iostore/store/query';
import type { ShallowRef } from 'vue';

import { getDefaultClient } from '@iostore/store/query';
import { onScopeDispose } from 'vue';

import { useIO, useIOSelector } from './adapters.js';

type IoUseQueryDefinitionOptions<TData, TError, TSelected> =
  IoQueryDefinition<TData, TError> &
    Omit<IoQueryObserverOptions<TData, TError, TSelected>, 'query'> & {
      client?: IoQueryClient;
      cancelOnDispose?: boolean;
    };

type IoUseQueryHandleOptions<TData, TError, TSelected> =
  Omit<IoQueryObserverOptions<TData, TError, TSelected>, 'query'> & {
    query: IoQueryHandle<TData, TError>;
    client?: IoQueryClient;
    cancelOnDispose?: boolean;
  };

type IoUseQueryOptions<TData, TError = Error, TSelected = TData> =
  | IoUseQueryDefinitionOptions<TData, TError, TSelected>
  | IoUseQueryHandleOptions<TData, TError, TSelected>;

export type IoVueQueryResult<TData, TError = Error, TSelected = TData> = {
  state: ShallowRef<IoQueryObserverResult<TSelected, TError>>;
  data: ShallowRef<TSelected | undefined>;
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
): IoVueQueryResult<TData, TError, TSelected> {
  const client = options.client ?? getDefaultClient();

  const query = isHandleOptions(options)
    ? options.query
    : client.getQuery<TData, TError>(options.key) ??
      client.defineQuery<TData, TError>({
        key: options.key,
        queryFn: options.queryFn,
        staleTime: options.staleTime,
        gcTime: options.gcTime,
        retry: options.retry,
        retryDelay: options.retryDelay,
      });

  const observer = client.observeQuery<TData, TError, TSelected>(
    resolveObserverOptions(options, query),
  );

  const state = useIO(observer);
  const data = useIOSelector(observer, (value) => value.data);

  onScopeDispose(() => {
    if (options.cancelOnDispose) {
      observer.cancel();
    }
    observer.dispose();
  });

  return {
    state,
    data,
    fetch: () => query.fetch(false),
    refetch: () => query.fetch(true),
    prefetch: () => query.prefetch(),
    invalidate: (refetch = true) => query.invalidate(refetch),
    cancel: () => query.cancel(),
    query,
    observer,
  };
}
