import type {
  IoQueryState,
  IoResource,
  IoResourceOptions,
  IoResourceRequestOptions,
} from '@iostore/query';

import { createResource } from '@iostore/query';
import { useEffect, useMemo, useSyncExternalStore } from 'react';

type IoUseResourceOptions = {
  enabled?: boolean;
  cancelOnUnmount?: boolean;
};

type IoUseQueryOptions<TData> = IoResourceOptions<TData> & IoUseResourceOptions;

export type IoQueryResult<TData> = {
  state: IoQueryState<TData>;
  data: TData | undefined;
  error: unknown;
  status: IoQueryState<TData>['status'];
  fetchStatus: IoQueryState<TData>['fetchStatus'];
  invalidated: boolean;
  updatedAt: number;
  fetch: (options?: IoResourceRequestOptions) => Promise<TData>;
  refetch: () => Promise<TData>;
  prefetch: (options?: IoResourceRequestOptions) => Promise<void>;
  invalidate: (options?: {
    action?: string;
    meta?: Record<string, unknown>;
  }) => number;
  cancel: () => number;
};

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function shouldAutoFetch<TData>(state: IoQueryState<TData>): boolean {
  if (state.fetchStatus === 'fetching') {
    return false;
  }
  return state.status === 'idle' || state.invalidated;
}

function areStatesEqual<TData>(
  left: IoQueryState<TData>,
  right: IoQueryState<TData>,
): boolean {
  return (
    left.status === right.status &&
    left.fetchStatus === right.fetchStatus &&
    left.updatedAt === right.updatedAt &&
    left.invalidated === right.invalidated &&
    Object.is(left.data, right.data) &&
    Object.is(left.error, right.error)
  );
}

export function useResource<TData>(
  resource: IoResource<TData>,
  options?: IoUseResourceOptions,
): IoQueryResult<TData> {
  const enabled = options?.enabled ?? true;
  const cancelOnUnmount = options?.cancelOnUnmount ?? false;

  const getSnapshot = useMemo(() => {
    let cache = resource.getState();
    return (): IoQueryState<TData> => {
      const next = resource.getState();
      if (areStatesEqual(cache, next)) {
        return cache;
      }
      cache = next;
      return cache;
    };
  }, [resource]);
  const state = useSyncExternalStore(
    (onStoreChange) => resource.subscribe(() => onStoreChange()),
    getSnapshot,
    getSnapshot,
  );

  useEffect(() => {
    if (!enabled || !shouldAutoFetch(state)) {
      return;
    }
    void resource.fetch().catch((error: unknown) => {
      if (isAbortError(error)) {
        return;
      }
    });
  }, [enabled, resource, state.fetchStatus, state.invalidated, state.status]);

  useEffect(
    () => () => {
      if (cancelOnUnmount) {
        resource.cancel();
      }
    },
    [cancelOnUnmount, resource],
  );

  return {
    state,
    data: state.data ?? resource.read(),
    error: state.error,
    status: state.status,
    fetchStatus: state.fetchStatus,
    invalidated: state.invalidated,
    updatedAt: state.updatedAt,
    fetch: (requestOptions?: IoResourceRequestOptions) =>
      resource.fetch(requestOptions),
    refetch: () => resource.fetch({ force: true }),
    prefetch: (requestOptions?: IoResourceRequestOptions) =>
      resource.prefetch(requestOptions),
    invalidate: (invalidateOptions?: {
      action?: string;
      meta?: Record<string, unknown>;
    }) => resource.invalidate(invalidateOptions),
    cancel: () => resource.cancel(),
  };
}

export function useQuery<TData>(
  options: IoUseQueryOptions<TData>,
): IoQueryResult<TData> {
  const {
    enabled,
    cancelOnUnmount,
    client,
    key,
    queryFn,
    staleTime,
    gcTime,
    retry,
    retryDelay,
    action,
    meta,
  } = options;

  const resource = useMemo(
    () =>
      createResource<TData>({
        client,
        key,
        queryFn,
        staleTime,
        gcTime,
        retry,
        retryDelay,
        action,
        meta,
      }),
    [action, client, gcTime, key, meta, queryFn, retry, retryDelay, staleTime],
  );

  return useResource(resource, { enabled, cancelOnUnmount });
}
