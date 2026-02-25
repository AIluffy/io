import { io } from '../core/api/io.js';
import { batch } from '../utils/reactive/batch.js';
import type { IoUnit } from '../utils/types/types.js';

import type {
  IoMutation,
  IoMutationDerivedFlags,
  IoMutationOptions,
  IoMutationState,
} from './types.js';
import {
  DEFAULT_RETRY_ATTEMPTS,
  createAbortError,
  defaultRetryDelay,
  isAbortError,
  reportBackgroundError,
  shouldRetry,
  sleep,
} from './utils.js';

type MutationUnitBox<TData, TError> = {
  value: IoUnit<IoMutationState<TData, TError>>;
};

function createInitialState<TData, TError>(): IoMutationState<TData, TError> {
  return {
    status: 'idle',
    data: undefined,
    error: null,
    variables: undefined,
    submittedAt: 0,
  };
}

export function deriveMutationFlags<TData, TError>(
  state: IoMutationState<TData, TError>,
): IoMutationDerivedFlags {
  return {
    isIdle: state.status === 'idle',
    isPending: state.status === 'pending',
    isSuccess: state.status === 'success',
    isError: state.status === 'error',
  };
}

export function createMutation<
  TData = unknown,
  TVariables = void,
  TError = Error,
  TContext = unknown,
>(
  options: IoMutationOptions<TData, TVariables, TError, TContext>,
): IoMutation<TData, TVariables, TError> {
  const holder = io(
    { value: createInitialState<TData, TError>() },
    { shallow: true },
  ) as unknown as MutationUnitBox<TData, TError>;
  const unit = holder.value;

  let abortController: AbortController | null = null;
  let inFlightPromise: Promise<TData> | null = null;
  let runId = 0;

  const mutateAsync = async (variables: TVariables): Promise<TData> => {
    runId += 1;
    const currentRunId = runId;

    abortController?.abort();
    const controller = new AbortController();
    const { signal } = controller;
    abortController = controller;

    const previousState = unit.snapshot();

    let context = undefined as TContext;
    if (options.onMutate) {
      context = await options.onMutate(variables);
    }

    batch(() => {
      unit.set({
        status: 'pending',
        data: previousState.data,
        error: null,
        variables,
        submittedAt: Date.now(),
      });
    });

    const promise = (async () => {
      let failureCount = 0;

      while (true) {
        try {
          if (signal.aborted || currentRunId !== runId) {
            throw createAbortError();
          }

          const data = await options.mutationFn(variables);

          if (signal.aborted || currentRunId !== runId) {
            throw createAbortError();
          }

          batch(() => {
            unit.set({
              status: 'success',
              data,
              error: null,
              variables,
              submittedAt: Date.now(),
            });
          });

          options.onSuccess?.(data, variables, context);
          options.onSettled?.(data, null, variables, context);
          return data;
        } catch (error) {
          if (isAbortError(error) || signal.aborted || currentRunId !== runId) {
            batch(() => {
              unit.set(previousState);
            });
            throw createAbortError();
          }

          failureCount += 1;
          const retry = options.retry ?? DEFAULT_RETRY_ATTEMPTS;
          if (!shouldRetry(failureCount, retry, error)) {
            batch(() => {
              unit.set({
                status: 'error',
                data: previousState.data,
                error: error as TError,
                variables,
                submittedAt: Date.now(),
              });
            });

            options.onError?.(error as TError, variables, context);
            options.onSettled?.(undefined, error as TError, variables, context);
            throw error;
          }

          const retryDelay = options.retryDelay ?? defaultRetryDelay;
          await sleep(retryDelay(failureCount - 1), signal);
        }
      }
    })();

    inFlightPromise = promise;

    try {
      return await promise;
    } finally {
      if (inFlightPromise === promise) {
        inFlightPromise = null;
      }
      if (abortController?.signal === signal) {
        abortController = null;
      }
    }
  };

  const mutation: IoMutation<TData, TVariables, TError> = {
    get: () => unit.get(),
    set: (next) => unit.set(next),
    snapshot: () => unit.snapshot(),
    subscribe: (fn) => unit.subscribe(fn),
    subscribeUpdate: (fn) => unit.subscribeUpdate(fn),
    reset: () => {
      abortController?.abort();
      batch(() => {
        unit.reset();
      });
    },
    mutate: (variables) => {
      void mutateAsync(variables).catch((error: unknown) => {
        reportBackgroundError('mutation.mutate()', error);
      });
    },
    mutateAsync,
    cancel: () => {
      abortController?.abort();
    },
    get flags() {
      return deriveMutationFlags(unit.get());
    },
  };

  return mutation;
}
