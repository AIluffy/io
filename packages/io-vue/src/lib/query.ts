import type {
  IoQuery,
  IoQueryClient,
  IoQueryOptions,
  IoQueryState,
} from '@iostore/store/query';
import type { ShallowRef } from 'vue';

import { getDefaultClient, reportBackgroundError } from '@iostore/store/query';
import { onScopeDispose } from 'vue';

import { useIO, useIOSelector } from './adapters.js';

type IoUseQueryOptions<TData, TError = Error> =
  IoQueryOptions<TData, TError> & {
    client?: IoQueryClient;
    enabled?: boolean;
    cancelOnDispose?: boolean;
  };

export type IoVueQueryResult<TData, TError = Error> = {
  state: ShallowRef<IoQueryState<TData, TError>>;
  data: ShallowRef<TData | undefined>;
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
): IoVueQueryResult<TData, TError> {
  const {
    client: providedClient,
    enabled = true,
    cancelOnDispose = false,
    ...queryOptions
  } = options;

  const client = providedClient ?? getDefaultClient();
  const query = client.query<TData, TError>(
    queryOptions as IoQueryOptions<TData, TError>,
  );
  const state = useIO(query);
  const data = useIOSelector(query, (value) => value.data);

  if (enabled && queryOptions.autoFetch !== true) {
    void query.fetch().catch((error: unknown) => {
      reportBackgroundError('vue.useQuery(fetch)', error);
    });
  }

  onScopeDispose(() => {
    if (cancelOnDispose) {
      query.cancel();
    }
  });

  return {
    state,
    data,
    fetch: () => query.fetch(),
    refetch: () => forceRefetch(query),
    prefetch: () => query.prefetch(),
    invalidate: (refetch = true) => query.invalidate(refetch),
    cancel: () => query.cancel(),
    query,
  };
}
