import type {
  IoQueryState,
  IoResource,
  IoResourceOptions,
  IoResourceRequestOptions,
} from '@iostore/query';
import type { Accessor } from 'solid-js';

import { createResource } from '@iostore/query';
import { createSignal, onCleanup } from 'solid-js';

type IoUseResourceOptions = {
  enabled?: boolean;
  cancelOnCleanup?: boolean;
};

type IoUseQueryOptions<TData> = IoResourceOptions<TData> & IoUseResourceOptions;

export type IoSolidQueryResult<TData> = {
  state: Accessor<IoQueryState<TData>>;
  data: Accessor<TData | undefined>;
  error: Accessor<unknown>;
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
): IoSolidQueryResult<TData> {
  const enabled = options?.enabled ?? true;
  const cancelOnCleanup = options?.cancelOnCleanup ?? false;

  const [state, setState] = createSignal(resource.getState());
  const [data, setData] = createSignal<TData | undefined>(
    state().data ?? resource.read(),
  );

  const unsubscribe = resource.subscribe(() => {
    const nextState = resource.getState();
    setState(() => nextState);
    setData(() => nextState.data ?? resource.read());
    if (enabled && shouldAutoFetch(nextState)) {
      void resource.fetch().catch((error: unknown) => {
        if (isAbortError(error)) {
          return;
        }
      });
    }
  });

  if (enabled && shouldAutoFetch(state())) {
    void resource.fetch().catch((error: unknown) => {
      if (isAbortError(error)) {
        return;
      }
    });
  }

  onCleanup(() => {
    unsubscribe();
    if (cancelOnCleanup) {
      resource.cancel();
    }
  });

  return {
    state,
    data,
    error: () => state().error,
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
): IoSolidQueryResult<TData> {
  const {
    enabled,
    cancelOnCleanup,
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
    cancelOnCleanup,
  });
}
