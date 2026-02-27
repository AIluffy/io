import type {
  IoMutation,
  IoMutationDerivedFlags,
  IoMutationOptions,
  IoMutationState,
  IoQuery,
  IoQueryClient,
  IoQueryDerivedFlags,
  IoQueryOptions,
  IoQueryState,
} from '@iostore/store/query';

import {
  createMutation,
  deriveMutationFlags,
  deriveQueryFlags,
  getDefaultClient,
} from '@iostore/store/query';
import { useEffect, useMemo, useRef } from 'react';

import { useIO } from './use-io.js';

function forceRefetch<TData, TError>(
  query: IoQuery<TData, TError>,
): Promise<TData> {
  return query.refetch();
}

export type UseQueryOptions<TData, TError = Error> =
  IoQueryOptions<TData, TError> & {
    client?: IoQueryClient;
    enabled?: boolean;
    cancelOnUnmount?: boolean;
  };

export type UseQueryResult<TData, TError = Error> =
  IoQueryState<TData, TError> &
    IoQueryDerivedFlags & {
      refetch: () => Promise<TData>;
      query: IoQuery<TData, TError>;
    };

export type UseMutationResult<
  TData,
  TVariables,
  TError = Error,
> = IoMutationState<TData, TError> &
  IoMutationDerivedFlags & {
    mutate: (variables: TVariables) => void;
    mutateAsync: (variables: TVariables) => Promise<TData>;
    reset: () => void;
    cancel: () => void;
    mutation: IoMutation<TData, TVariables, TError>;
  };

export type UseSuspenseQueryResult<TData, TError = Error> =
  IoQueryState<TData, TError> &
    IoQueryDerivedFlags & {
      data: TData;
      refetch: () => Promise<TData>;
      query: IoQuery<TData, TError>;
    };

export function useQuery<TData, TError = Error>(
  options: UseQueryOptions<TData, TError>,
): UseQueryResult<TData, TError> {
  const {
    client: providedClient,
    enabled = true,
    cancelOnUnmount = false,
    ...queryOptions
  } = options;

  const client = providedClient ?? getDefaultClient();
  const query = client.query<TData, TError>(
    queryOptions as IoQueryOptions<TData, TError>,
  );
  const state = useIO(query);

  useEffect(() => {
    if (!enabled || queryOptions.autoFetch === true) {
      return;
    }
    query.fetchQuietly();
  }, [enabled, query, queryOptions.autoFetch]);

  useEffect(
    () => () => {
      if (cancelOnUnmount) {
        query.cancel();
      }
    },
    [cancelOnUnmount, query],
  );

  return {
    ...state,
    ...deriveQueryFlags(state),
    refetch: () => forceRefetch(query),
    query,
  };
}

export function useMutation<
  TData,
  TVariables,
  TError = Error,
  TContext = unknown,
>(
  options: IoMutationOptions<TData, TVariables, TError, TContext>,
): UseMutationResult<TData, TVariables, TError> {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const mutation = useMemo(
    () =>
      createMutation<TData, TVariables, TError, TContext>({
        get mutationFn() {
          return optionsRef.current.mutationFn;
        },
        get retry() {
          return optionsRef.current.retry;
        },
        get retryDelay() {
          return optionsRef.current.retryDelay;
        },
        get onMutate() {
          return optionsRef.current.onMutate;
        },
        get onSuccess() {
          return optionsRef.current.onSuccess;
        },
        get onError() {
          return optionsRef.current.onError;
        },
        get onSettled() {
          return optionsRef.current.onSettled;
        },
      }),
    [],
  );
  const state = useIO(mutation);

  return {
    ...state,
    ...deriveMutationFlags(state),
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    reset: mutation.reset,
    cancel: mutation.cancel,
    mutation,
  };
}

export function useSuspenseQuery<TData, TError = Error>(
  options: UseQueryOptions<TData, TError>,
): UseSuspenseQueryResult<TData, TError> {
  const {
    client: providedClient,
    enabled = true,
    cancelOnUnmount = false,
    ...queryOptions
  } = options;

  const client = providedClient ?? getDefaultClient();
  const query = client.query<TData, TError>(
    queryOptions as IoQueryOptions<TData, TError>,
  );
  const state = useIO(query);

  useEffect(
    () => () => {
      if (cancelOnUnmount) {
        query.cancel();
      }
    },
    [cancelOnUnmount, query],
  );

  if (!enabled) {
    if (state.data === undefined) {
      throw new Error('useSuspenseQuery: enabled=false requires existing data');
    }
    return {
      ...state,
      ...deriveQueryFlags(state),
      data: state.data,
      refetch: () => forceRefetch(query),
      query,
    };
  }

  const data = query.read();

  return {
    ...state,
    ...deriveQueryFlags(state),
    data,
    refetch: () => forceRefetch(query),
    query,
  };
}
