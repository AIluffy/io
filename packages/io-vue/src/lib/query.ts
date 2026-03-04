import type {
  IoMutation,
  IoMutationDerivedFlags,
  IoMutationOptions,
  IoMutationState,
  IoQueryClient,
  IoQueryDefinition,
  IoQueryHandle,
  IoQueryObserver,
  IoQueryObserverOptions,
  IoQueryObserverResult,
} from '@iostore/store/query';
import type { ShallowRef } from 'vue';

import {
  createMutation,
  deriveMutationFlags,
  getDefaultClient,
} from '@iostore/store/query';
import { onScopeDispose } from 'vue';

import { useIO, useIOSelector } from './adapters.js';

type IoUseQueryDefinitionOptions<TData, TError, TSelected> = IoQueryDefinition<
  TData,
  TError
> &
  Omit<IoQueryObserverOptions<TData, TError, TSelected>, 'query'> & {
    client?: IoQueryClient;
    cancelOnDispose?: boolean;
  };

type IoUseQueryHandleOptions<TData, TError, TSelected> = Omit<
  IoQueryObserverOptions<TData, TError, TSelected>,
  'query'
> & {
  query: IoQueryHandle<TData, TError>;
  client?: IoQueryClient;
  cancelOnDispose?: boolean;
};

type IoUseQueryOptions<TData, TError = Error, TSelected = TData> =
  | IoUseQueryDefinitionOptions<TData, TError, TSelected>
  | IoUseQueryHandleOptions<TData, TError, TSelected>;

type IoUseSuspenseQueryOptions<TData, TError = Error, TSelected = TData> =
  | Omit<
      IoUseQueryDefinitionOptions<TData, TError, TSelected>,
      'enabled' | 'placeholderData'
    >
  | Omit<
      IoUseQueryHandleOptions<TData, TError, TSelected>,
      'enabled' | 'placeholderData'
    >;

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

export type IoVueSuspenseQueryResult<
  TData,
  TError = Error,
  TSelected = TData,
> = IoVueQueryResult<TData, TError, TSelected> & {
  data: ShallowRef<TSelected>;
};

export type IoVueMutationResult<TData, TVariables, TError = Error> = {
  state: ShallowRef<IoMutationState<TData, TError>>;
  flags: ShallowRef<IoMutationDerivedFlags>;
  mutate: (variables: TVariables) => void;
  mutateAsync: (variables: TVariables) => Promise<TData>;
  reset: () => void;
  cancel: () => void;
  mutation: IoMutation<TData, TVariables, TError>;
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
    : (client.getQuery<TData, TError>(options.key) ??
      client.defineQuery<TData, TError>({
        key: options.key,
        queryFn: options.queryFn,
        staleTime: options.staleTime,
        gcTime: options.gcTime,
        retry: options.retry,
        retryDelay: options.retryDelay,
      }));

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

export function useSuspenseQuery<TData, TError = Error, TSelected = TData>(
  options: IoUseSuspenseQueryOptions<TData, TError, TSelected>,
): IoVueSuspenseQueryResult<TData, TError, TSelected> {
  const result = useQuery<TData, TError, TSelected>({
    ...options,
    enabled: true,
  } as IoUseQueryOptions<TData, TError, TSelected>);

  if (
    result.state.value.status === 'error' &&
    result.state.value.error !== null
  ) {
    throw result.state.value.error;
  }

  if (result.state.value.status === 'pending') {
    throw result.observer.read();
  }

  return result as IoVueSuspenseQueryResult<TData, TError, TSelected>;
}

export function useMutation<
  TData,
  TVariables,
  TError = Error,
  TContext = unknown,
>(
  options: IoMutationOptions<TData, TVariables, TError, TContext>,
): IoVueMutationResult<TData, TVariables, TError> {
  const mutation = createMutation<TData, TVariables, TError, TContext>(options);
  const state = useIO(mutation);
  const flags = useIOSelector(mutation, (value) => deriveMutationFlags(value));

  return {
    state,
    flags,
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    reset: mutation.reset,
    cancel: mutation.cancel,
    mutation,
  };
}
