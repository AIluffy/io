import type {
  IoQuery,
  IoQueryClient,
  IoQueryOptions,
  IoQueryState,
} from '@iostore/store/query';
import type { Accessor } from 'solid-js';

import { getDefaultClient, reportBackgroundError } from '@iostore/store/query';
import { onCleanup } from 'solid-js';

import { useIO, useIOSelector } from './adapters.js';

type IoUseQueryOptions<TData, TError = Error> =
  IoQueryOptions<TData, TError> & {
    client?: IoQueryClient;
    enabled?: boolean;
    cancelOnCleanup?: boolean;
  };

export type IoSolidQueryResult<TData, TError = Error> = {
  state: Accessor<IoQueryState<TData, TError>>;
  data: Accessor<TData | undefined>;
  error: Accessor<TError | null>;
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
  query.invalidate(false);
  return query.fetch();
}

export function useQuery<TData, TError = Error>(
  options: IoUseQueryOptions<TData, TError>,
): IoSolidQueryResult<TData, TError> {
  const {
    client: providedClient,
    enabled = true,
    cancelOnCleanup = false,
    ...queryOptions
  } = options;

  const client = providedClient ?? getDefaultClient();
  const query = client.query<TData, TError>(
    queryOptions as IoQueryOptions<TData, TError>,
  );
  const state = useIO(query);
  const data = useIOSelector(query, (value) => value.data);
  const error = useIOSelector(query, (value) => value.error as TError | null);

  if (enabled && queryOptions.autoFetch !== true) {
    void query.fetch().catch((cause: unknown) => {
      reportBackgroundError('solid.useQuery(fetch)', cause);
    });
  }

  onCleanup(() => {
    if (cancelOnCleanup) {
      query.cancel();
    }
  });

  return {
    state,
    data,
    error,
    fetch: () => query.fetch(),
    refetch: () => forceRefetch(query),
    prefetch: () => query.prefetch(),
    invalidate: (refetch = true) => query.invalidate(refetch),
    cancel: () => query.cancel(),
    query,
  };
}
