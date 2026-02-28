import type { IoUnit, IoUpdate } from '../utils/types/types.js';

export type IoUnsubscribe = () => void;

export type IoQueryKey = readonly unknown[];

export type IoDataStatus = 'pending' | 'success' | 'error';

export type IoFetchStatus = 'idle' | 'fetching' | 'paused';

export type IoRefetchOnMount = false | 'stale' | 'always';

export type IoQueryState<TData = unknown, TError = Error> = {
  readonly status: IoDataStatus;
  readonly fetchStatus: IoFetchStatus;
  readonly data: TData | undefined;
  readonly error: TError | null;
  readonly dataUpdatedAt: number;
  readonly errorUpdatedAt: number;
  readonly failureCount: number;
  readonly failureReason: TError | null;
  readonly isInvalidated: boolean;
  readonly isPlaceholderData: boolean;
};

export type IoMutationStatus = 'idle' | 'pending' | 'success' | 'error';

export type IoMutationState<TData = unknown, TError = Error> = {
  readonly status: IoMutationStatus;
  readonly data: TData | undefined;
  readonly error: TError | null;
  readonly variables: unknown | undefined;
  readonly submittedAt: number;
};

export type IoQueryDerivedFlags = {
  readonly isPending: boolean;
  readonly isSuccess: boolean;
  readonly isError: boolean;
  readonly isFetching: boolean;
  readonly isLoading: boolean;
  readonly isRefetching: boolean;
  readonly isStale: boolean;
  readonly hasData: boolean;
  readonly isFetched: boolean;
  readonly isFetchedAfterMount: boolean;
};

export type IoMutationDerivedFlags = {
  readonly isIdle: boolean;
  readonly isPending: boolean;
  readonly isSuccess: boolean;
  readonly isError: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type IoQueryDefinition<TData = unknown, TError = Error> = {
  key: IoQueryKey;
  queryFn: (context: { signal: AbortSignal }) => Promise<TData>;
  staleTime?: number;
  gcTime?: number;
  retry?: number;
  retryDelay?: (attempt: number) => number;
};

export type IoQueryObserverCallbacks<TData = unknown, TError = Error> = {
  onSuccess?: (data: TData) => void;
  onError?: (error: TError) => void;
  onSettled?: (data: TData | undefined, error: TError | null) => void;
};

export type IoQueryObserverOptions<
  TData = unknown,
  TError = Error,
  TSelected = TData,
> = IoQueryObserverCallbacks<TSelected, TError> & {
  query: IoQueryDefinition<TData, TError> | IoQueryHandle<TData, TError>;
  enabled?: boolean;
  placeholderData?: TSelected | (() => TSelected);
  select?: (data: TData | undefined) => TSelected;
  refetchOnMount?: IoRefetchOnMount;
  refetchOnWindowFocus?: boolean;
  refetchOnReconnect?: boolean;
};

export type IoQueryObserverResult<TData = unknown, TError = Error> =
  IoQueryState<TData, TError> & IoQueryDerivedFlags;

export type IoQueryHandle<TData = unknown, TError = Error> = {
  readonly key: IoQueryKey;
  readonly keyHash: string;
  fetch(force?: boolean): Promise<TData>;
  prefetch(): Promise<void>;
  ensureData(): Promise<TData>;
  invalidate(refetch?: boolean): void;
  cancel(): void;
  reset(): void;
  setData(updater: TData | ((prev: TData | undefined) => TData)): void;
  getData(): TData | undefined;
  getState(): IoQueryState<TData, TError>;
  getFlags(): IoQueryDerivedFlags;
  readonly isActive: boolean;
  readonly observerCount: number;
  subscribe(fn: (state: IoQueryState<TData, TError>) => void): IoUnsubscribe;
  subscribeUpdate(fn: (update: IoUpdate) => void): IoUnsubscribe;
};

export type IoQueryObserver<TData = unknown, TError = Error> =
  IoUnit<IoQueryObserverResult<TData, TError>> & {
    readonly key: IoQueryKey;
    readonly keyHash: string;
    readonly query: IoQueryHandle<unknown, TError>;
    fetch(): Promise<unknown>;
    refetch(): Promise<unknown>;
    prefetch(): Promise<void>;
    invalidate(refetch?: boolean): void;
    cancel(): void;
    read(): TData;
    dispose(): void;
    setOptions(
      options: Partial<IoQueryObserverOptions<TData, TError, TData>>,
    ): void;
  };

export type IoMutation<
  TData = unknown,
  TVariables = void,
  TError = Error,
> = IoUnit<IoMutationState<TData, TError>> & {
  mutate(variables: TVariables): void;
  mutateAsync(variables: TVariables): Promise<TData>;
  reset(): void;
  cancel(): void;
  readonly flags: IoMutationDerivedFlags;
};

export type IoMutationOptions<
  TData = unknown,
  TVariables = void,
  TError = Error,
  TContext = unknown,
> = {
  mutationFn: (
    variables: TVariables,
    context: { signal: AbortSignal },
  ) => Promise<TData>;
  retry?: number;
  retryDelay?: (attempt: number) => number;
  onMutate?: (variables: TVariables) => TContext | Promise<TContext>;
  onSuccess?: (data: TData, variables: TVariables, context: TContext) => void;
  onError?: (error: TError, variables: TVariables, context: TContext) => void;
  onSettled?: (
    data: TData | undefined,
    error: TError | null,
    variables: TVariables,
    context: TContext,
  ) => void;
};

export type IoQueryClientOptions = {
  defaultStaleTime?: number;
  defaultGcTime?: number;
  defaultRetry?: number;
  defaultRetryDelay?: (attempt: number) => number;
  defaultRefetchOnMount?: IoRefetchOnMount;
  defaultRefetchOnWindowFocus?: boolean;
  defaultRefetchOnReconnect?: boolean;
};

export type IoQueryFilter = {
  key?: IoQueryKey;
  exact?: boolean;
  active?: boolean;
  stale?: boolean;
  fetching?: boolean;
  predicate?: (query: IoQueryHandle<unknown, unknown>) => boolean;
};

export type IoQueryCacheEvent = {
  type: 'query-added' | 'query-updated' | 'query-removed';
  query: IoQueryHandle<unknown, unknown>;
};

export type IoQueryInput<TData = unknown, TError = Error> =
  | IoQueryDefinition<TData, TError>
  | IoQueryHandle<TData, TError>;

export type IoDehydratedQuery = {
  key: IoQueryKey;
  keyHash: string;
  state: IoQueryState<unknown, unknown>;
};

export type IoDehydratedState = {
  queries: IoDehydratedQuery[];
};

export type IoDehydrateOptions = {
  shouldDehydrateQuery?: (query: IoQueryHandle<unknown, unknown>) => boolean;
};

export type IoHydrateOptions = {
  shouldHydrateQuery?: (query: IoDehydratedQuery) => boolean;
};

export type IoQueryClient = {
  defineQuery<TData = unknown, TError = Error>(
    definition: IoQueryDefinition<TData, TError>,
  ): IoQueryHandle<TData, TError>;
  observeQuery<TData = unknown, TError = Error, TSelected = TData>(
    options: IoQueryObserverOptions<TData, TError, TSelected>,
  ): IoQueryObserver<TSelected, TError>;
  fetchQuery<TData = unknown, TError = Error>(
    input: IoQueryInput<TData, TError>,
  ): Promise<TData>;
  prefetchQuery<TData = unknown, TError = Error>(
    input: IoQueryInput<TData, TError>,
  ): Promise<void>;
  ensureQueryData<TData = unknown, TError = Error>(
    input: IoQueryInput<TData, TError>,
  ): Promise<TData>;
  mutation<
    TData = unknown,
    TVariables = void,
    TError = Error,
    TContext = unknown,
  >(
    options: IoMutationOptions<TData, TVariables, TError, TContext>,
  ): IoMutation<TData, TVariables, TError>;
  invalidateQueries(filter?: IoQueryFilter, refetch?: boolean): void;
  refetchQueries(filter?: IoQueryFilter): Promise<void>;
  cancelQueries(filter?: IoQueryFilter): void;
  resetQueries(filter?: IoQueryFilter): void;
  removeQueries(filter?: IoQueryFilter): void;
  getQueryData<TData = unknown>(key: IoQueryKey): TData | undefined;
  setQueryData<TData = unknown>(
    key: IoQueryKey,
    updater: TData | ((prev: TData | undefined) => TData),
  ): void;
  setQueriesData<TData = unknown>(
    filter: IoQueryFilter,
    updater: (prev: TData | undefined) => TData,
  ): void;
  getQueryState<TData = unknown, TError = Error>(
    key: IoQueryKey,
  ): IoQueryState<TData, TError> | undefined;
  getQuery<TData = unknown, TError = Error>(
    key: IoQueryKey,
  ): IoQueryHandle<TData, TError> | undefined;
  getQueries(filter?: IoQueryFilter): IoQueryHandle<unknown, unknown>[];
  dehydrate(options?: IoDehydrateOptions): IoDehydratedState;
  hydrate(state: IoDehydratedState, options?: IoHydrateOptions): void;
  clear(): void;
  subscribe(fn: (event: IoQueryCacheEvent) => void): IoUnsubscribe;
};
