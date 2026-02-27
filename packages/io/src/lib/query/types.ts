import type { IoUnit } from '../utils/types/types.js';

export type IoUnsubscribe = () => void;

export type IoQueryKey = readonly unknown[];

export type IoDataStatus = 'pending' | 'success' | 'error';

export type IoFetchStatus = 'idle' | 'fetching';

export type IoQueryState<TData = unknown, TError = Error> = {
  readonly status: IoDataStatus;
  readonly fetchStatus: IoFetchStatus;
  readonly data: TData | undefined;
  readonly error: TError | null;
  readonly dataUpdatedAt: number;
  readonly errorUpdatedAt: number;
  readonly failureCount: number;
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
};

export type IoMutationDerivedFlags = {
  readonly isIdle: boolean;
  readonly isPending: boolean;
  readonly isSuccess: boolean;
  readonly isError: boolean;
};

export type IoQuery<TData = unknown, TError = Error> =
  IoUnit<IoQueryState<TData, TError>> & {
    readonly key: IoQueryKey;
    readonly keyHash: string;
    fetch(): Promise<TData>;
    fetchQuietly(): void;
    refetch(): Promise<TData>;
    prefetch(): Promise<void>;
    read(): TData;
    getData(): TData | undefined;
    invalidate(refetch?: boolean): void;
    cancel(): void;
    setData(updater: TData | ((prev: TData | undefined) => TData)): void;
    readonly isActive: boolean;
    readonly observerCount: number;
    readonly flags: IoQueryDerivedFlags;
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

export type IoQueryOptions<TData = unknown, TError = Error> = {
  key: IoQueryKey;
  queryFn: (context: { signal: AbortSignal }) => Promise<TData>;
  staleTime?: number;
  gcTime?: number;
  retry?: number;
  retryDelay?: (attempt: number) => number;
  autoFetch?: boolean;
  placeholderData?: TData | (() => TData);
  onSuccess?: (data: TData) => void;
  onError?: (error: TError) => void;
  onSettled?: (data: TData | undefined, error: TError | null) => void;
};

export type IoMutationOptions<
  TData = unknown,
  TVariables = void,
  TError = Error,
  TContext = unknown,
> = {
  mutationFn: (variables: TVariables) => Promise<TData>;
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
};

export type IoQueryFilter = {
  key?: IoQueryKey;
  exact?: boolean;
  predicate?: (query: IoQuery<unknown, unknown>) => boolean;
};

export type IoQueryCacheEvent = {
  type: 'query-added' | 'query-updated' | 'query-removed';
  query: IoQuery<unknown, unknown>;
};

export type IoQueryClient = {
  query<TData = unknown, TError = Error>(
    options: IoQueryOptions<TData, TError>,
  ): IoQuery<TData, TError>;
  mutation<
    TData = unknown,
    TVariables = void,
    TError = Error,
    TContext = unknown,
  >(
    options: IoMutationOptions<TData, TVariables, TError, TContext>,
  ): IoMutation<TData, TVariables, TError>;
  invalidateQueries(filter?: IoQueryFilter, refetch?: boolean): void;
  cancelQueries(filter?: IoQueryFilter): void;
  removeQueries(filter?: IoQueryFilter): void;
  getQueryData<TData = unknown>(key: IoQueryKey): TData | undefined;
  setQueryData<TData = unknown>(
    key: IoQueryKey,
    updater: TData | ((prev: TData | undefined) => TData),
  ): void;
  getQuery<TData = unknown, TError = Error>(
    key: IoQueryKey,
  ): IoQuery<TData, TError> | undefined;
  getQueries(filter?: IoQueryFilter): IoQuery<unknown, unknown>[];
  clear(): void;
  subscribe(fn: (event: IoQueryCacheEvent) => void): IoUnsubscribe;
};
