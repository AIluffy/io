import { batch } from '../utils/reactive/batch.js';
import type { IoUnit } from '../utils/types/types.js';

import type { IoQueryState } from './types.js';
import {
  createAbortError,
  isAbortError,
  reportBackgroundError,
} from './utils.js';
import { executeWithRetry } from './retry-executor.js';

type FetchControllerOptions<TData, TError> = {
  keyHash: string;
  unit: IoUnit<IoQueryState<TData, TError>>;
  touch: () => void;
  scheduleGc: () => void;
  clearInvalidated: () => void;
  isStale: (state: IoQueryState<TData, TError>) => boolean;
  getOptions: () => {
    queryFn: (context: { signal: AbortSignal }) => Promise<TData>;
    canFetch: boolean;
    retry: number;
    retryDelay: (attempt: number) => number;
    onSuccess?: (data: TData) => void;
    onError?: (error: TError) => void;
    onSettled?: (data: TData | undefined, error: TError | null) => void;
  };
};

export type FetchController<TData> = {
  execute: (force?: boolean) => Promise<TData>;
  cancel: () => void;
  getInFlightPromise: () => Promise<TData> | null;
  hasInFlight: () => boolean;
};

function patchState<TData, TError>(
  unit: IoUnit<IoQueryState<TData, TError>>,
  patch: Partial<IoQueryState<TData, TError>>,
): void {
  batch(() => {
    unit.set({
      ...unit.snapshot(),
      ...patch,
    });
  });
}

function runQueryCallback(scope: string, fn: () => void): void {
  try {
    fn();
  } catch (error) {
    reportBackgroundError(scope, error);
  }
}

export function createFetchController<TData, TError>(
  options: FetchControllerOptions<TData, TError>,
): FetchController<TData> {
  let inFlightPromise: Promise<TData> | null = null;
  let abortController: AbortController | null = null;
  let fetchGeneration = 0;

  const cancel = (): void => {
    if (!inFlightPromise && !abortController) {
      return;
    }

    fetchGeneration += 1;
    abortController?.abort();
    abortController = null;
    inFlightPromise = null;

    const current = options.unit.snapshot();
    if (current.fetchStatus !== 'idle') {
      patchState(options.unit, {
        fetchStatus: 'idle',
      });
    }

    options.scheduleGc();
  };

  const execute = (force = false): Promise<TData> => {
    options.touch();

    const resolvedOptions = options.getOptions();
    if (!resolvedOptions.canFetch) {
      return Promise.reject(
        new Error(`query.fetch: queryFn is not available for key ${options.keyHash}`),
      );
    }

    const state = options.unit.snapshot();
    if (!force && state.status === 'success' && !options.isStale(state)) {
      return Promise.resolve(state.data as TData);
    }

    if (inFlightPromise) {
      return inFlightPromise;
    }

    fetchGeneration += 1;
    const currentGeneration = fetchGeneration;
    const controller = new AbortController();
    const { signal } = controller;
    abortController = controller;

    const nextStatus =
      state.status === 'success' ? 'success' : state.data === undefined ? 'pending' : 'success';
    patchState(options.unit, {
      status: nextStatus,
      fetchStatus: 'fetching',
      error: null,
      failureCount: 0,
    });

    let failureCount = 0;
    const promise = (async () => {
      try {
        const data = await executeWithRetry<TData>({
          run: async () => {
            const latestOptions = options.getOptions();
            return latestOptions.queryFn({ signal });
          },
          retry: resolvedOptions.retry,
          retryDelay: resolvedOptions.retryDelay,
          signal,
          isCancelled: () => currentGeneration !== fetchGeneration,
          onFailedAttempt: (count) => {
            failureCount = count;
          },
        });

        options.clearInvalidated();
        patchState(options.unit, {
          status: 'success',
          fetchStatus: 'idle',
          data,
          error: null,
          dataUpdatedAt: Date.now(),
          failureCount: 0,
        });

        const latestOptions = options.getOptions();
        if (latestOptions.onSuccess) {
          runQueryCallback('query.onSuccess', () => {
            latestOptions.onSuccess?.(data);
          });
        }
        if (latestOptions.onSettled) {
          runQueryCallback('query.onSettled', () => {
            latestOptions.onSettled?.(data, null);
          });
        }

        return data;
      } catch (error) {
        if (
          isAbortError(error) ||
          currentGeneration !== fetchGeneration ||
          signal.aborted
        ) {
          if (currentGeneration === fetchGeneration) {
            const current = options.unit.snapshot();
            if (current.fetchStatus !== 'idle') {
              patchState(options.unit, {
                fetchStatus: 'idle',
              });
            }
          }
          throw createAbortError();
        }

        patchState(options.unit, {
          status: 'error',
          fetchStatus: 'idle',
          error: error as TError,
          errorUpdatedAt: Date.now(),
          failureCount,
        });

        const latestOptions = options.getOptions();
        if (latestOptions.onError) {
          runQueryCallback('query.onError', () => {
            latestOptions.onError?.(error as TError);
          });
        }
        if (latestOptions.onSettled) {
          runQueryCallback('query.onSettled', () => {
            latestOptions.onSettled?.(undefined, error as TError);
          });
        }

        throw error;
      }
    })();

    inFlightPromise = promise;
    void promise
      .finally(() => {
        if (inFlightPromise === promise) {
          inFlightPromise = null;
        }
        if (abortController?.signal === signal) {
          abortController = null;
        }
        if (currentGeneration === fetchGeneration) {
          options.scheduleGc();
        }
      })
      .catch(() => undefined);

    return promise;
  };

  return {
    execute,
    cancel,
    getInFlightPromise: () => inFlightPromise,
    hasInFlight: () => inFlightPromise !== null,
  };
}
