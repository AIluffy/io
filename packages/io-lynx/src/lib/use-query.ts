import type {
  IoQuery,
  IoQueryClient,
  IoQueryDerivedFlags,
  IoQueryOptions,
  IoQueryState,
} from '@iostore/store/query';

import {
  deriveQueryFlags,
  getDefaultClient,
} from '@iostore/store/query';
import { useEffect } from '@lynx-js/react';

import { useIO } from './use-io.js';

type IoUseQueryOptions<TData, TError = Error> =
  IoQueryOptions<TData, TError> & {
    client?: IoQueryClient;
    enabled?: boolean;
    cancelOnUnmount?: boolean;
  };

export type IoLynxQueryResult<TData, TError = Error> =
  IoQueryState<TData, TError> &
    IoQueryDerivedFlags & {
      fetch: () => Promise<TData>;
      refetch: () => Promise<TData>;
      prefetch: () => Promise<void>;
      invalidate: (refetch?: boolean) => void;
      cancel: () => void;
      query: IoQuery<TData, TError>;
    };

function forceRefetch<TData, TError>(
  query: IoQuery<TData, TError>,
): Promise<TData> {
  return query.refetch();
}

export function useQuery<TData, TError = Error>(
  options: IoUseQueryOptions<TData, TError>,
): IoLynxQueryResult<TData, TError> {
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
    fetch: () => query.fetch(),
    refetch: () => forceRefetch(query),
    prefetch: () => query.prefetch(),
    invalidate: (refetch = true) => query.invalidate(refetch),
    cancel: () => query.cancel(),
    query,
  };
}
