import {
  createQueryClient,
  type IoFetchQueryOptions,
  type IoQueryClient,
  type IoQueryFn,
  type IoQueryKey,
  type IoQueryState,
  type IoRetryDelayValue,
  type IoRetryValue,
  type Unsubscribe,
} from './query-client.js';

export type IoResourceOptions<TData> = {
  key: IoQueryKey;
  queryFn: IoQueryFn<TData>;
  client?: IoQueryClient;
  staleTime?: number;
  gcTime?: number;
  retry?: IoRetryValue;
  retryDelay?: IoRetryDelayValue;
  action?: string;
  meta?: Record<string, unknown>;
};

export type IoResourceRequestOptions = {
  force?: boolean;
  staleTime?: number;
  gcTime?: number;
  retry?: IoRetryValue;
  retryDelay?: IoRetryDelayValue;
  action?: string;
  meta?: Record<string, unknown>;
};

export type IoResource<TData> = {
  key: IoQueryKey;
  read: () => TData | undefined;
  getState: () => IoQueryState<TData>;
  fetch: (options?: IoResourceRequestOptions) => Promise<TData>;
  prefetch: (options?: IoResourceRequestOptions) => Promise<void>;
  invalidate: (options?: {
    action?: string;
    meta?: Record<string, unknown>;
  }) => number;
  cancel: () => number;
  subscribe: (listener: (state: IoQueryState<TData>) => void) => Unsubscribe;
};

let defaultClient: IoQueryClient | undefined;

function resolveDefaultClient(): IoQueryClient {
  if (!defaultClient) {
    defaultClient = createQueryClient();
  }
  return defaultClient;
}

function createIdleState<TData>(): IoQueryState<TData> {
  return {
    status: 'idle',
    fetchStatus: 'idle',
    updatedAt: 0,
    invalidated: false,
  };
}

function mergeMeta(
  base?: Record<string, unknown>,
  override?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!base && !override) {
    return undefined;
  }
  if (!base) {
    return override;
  }
  if (!override) {
    return base;
  }
  return {
    ...base,
    ...override,
  };
}

function toFetchOptions<TData>(
  options: IoResourceOptions<TData>,
  requestOptions?: IoResourceRequestOptions,
): IoFetchQueryOptions<TData> {
  return {
    key: options.key,
    queryFn: options.queryFn,
    staleTime: requestOptions?.staleTime ?? options.staleTime,
    gcTime: requestOptions?.gcTime ?? options.gcTime,
    retry: requestOptions?.retry ?? options.retry,
    retryDelay: requestOptions?.retryDelay ?? options.retryDelay,
    force: requestOptions?.force,
    action: requestOptions?.action ?? options.action,
    meta: mergeMeta(options.meta, requestOptions?.meta),
  };
}

export function createResource<TData>(
  options: IoResourceOptions<TData>,
): IoResource<TData> {
  const client = options.client ?? resolveDefaultClient();

  const getState = (): IoQueryState<TData> =>
    client.getQueryState<TData>(options.key) ?? createIdleState<TData>();

  const read = (): TData | undefined => client.getQueryData<TData>(options.key);

  const fetch = (requestOptions?: IoResourceRequestOptions): Promise<TData> =>
    client.fetchQuery(toFetchOptions(options, requestOptions));

  const prefetch = async (
    requestOptions?: IoResourceRequestOptions,
  ): Promise<void> => {
    await client.prefetchQuery(toFetchOptions(options, requestOptions));
  };

  const invalidate = (invalidateOptions?: {
    action?: string;
    meta?: Record<string, unknown>;
  }): number =>
    client.invalidateQueries(
      {
        key: options.key,
        exact: true,
      },
      {
        action: invalidateOptions?.action ?? options.action,
        meta: mergeMeta(options.meta, invalidateOptions?.meta),
      },
    );

  const cancel = (): number =>
    client.cancelQueries({
      key: options.key,
      exact: true,
    });

  const subscribe = (
    listener: (state: IoQueryState<TData>) => void,
  ): Unsubscribe =>
    client.subscribe(
      () => {
        listener(getState());
      },
      {
        key: options.key,
        exact: true,
      },
    );

  return {
    key: options.key,
    read,
    getState,
    fetch,
    prefetch,
    invalidate,
    cancel,
    subscribe,
  };
}
