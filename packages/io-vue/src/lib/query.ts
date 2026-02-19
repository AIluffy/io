import type {
  IoQueryState,
  IoResource,
  IoResourceOptions,
  IoResourceRequestOptions,
} from '@iostore/query';
import type { ShallowRef } from 'vue';

import { createResource } from '@iostore/query';
import { onScopeDispose, shallowRef } from 'vue';

type IoUseResourceOptions = {
  enabled?: boolean;
  cancelOnDispose?: boolean;
};

type IoUseQueryOptions<TData> = IoResourceOptions<TData> & IoUseResourceOptions;

export type IoVueQueryResult<TData> = {
  state: ShallowRef<IoQueryState<TData>>;
  data: ShallowRef<TData | undefined>;
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

export function useResource<TData>(
  resource: IoResource<TData>,
  options?: IoUseResourceOptions,
): IoVueQueryResult<TData> {
  const enabled = options?.enabled ?? true;
  const cancelOnDispose = options?.cancelOnDispose ?? false;

  const state = shallowRef(resource.getState()) as ShallowRef<IoQueryState<TData>>;
  const data = shallowRef(state.value.data);

  const unsubscribe = resource.subscribe(() => {
    state.value = resource.getState();
    data.value = state.value.data ?? resource.read();
  });

  if (enabled && shouldAutoFetch(state.value)) {
    void resource.fetch().catch((error: unknown) => {
      if (isAbortError(error)) {
        return;
      }
    });
  }

  onScopeDispose(() => {
    unsubscribe();
    if (cancelOnDispose) {
      resource.cancel();
    }
  });

  return {
    state,
    data,
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
): IoVueQueryResult<TData> {
  const {
    enabled,
    cancelOnDispose,
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

  const resource = createResource<TData>({
    client,
    key,
    queryFn,
    staleTime,
    gcTime,
    retry,
    retryDelay,
    action,
    meta,
  });

  return useResource(resource, {
    enabled,
    cancelOnDispose,
  });
}
