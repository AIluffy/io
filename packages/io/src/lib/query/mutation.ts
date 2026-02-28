import { io } from '../core/api/io.js';
import { batch } from '../utils/reactive/batch.js';
import { getInternal, registerInternal } from '../utils/internal/internal-access.js';
import type { IoUnit } from '../utils/types/types.js';

import type {
  IoMutation,
  IoMutationDerivedFlags,
  IoMutationOptions,
  IoMutationState,
} from './types.js';
import {
  DEFAULT_RETRY_ATTEMPTS,
  defaultRetryDelay,
  isAbortError,
  reportBackgroundError,
} from './utils.js';
import { executeWithRetry } from './retry-executor.js';
import { readUnitState, setUnitState } from './unit-state.js';

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

  const runMutationCallback = (scope: string, fn: () => void): void => {
    try {
      fn();
    } catch (error) {
      reportBackgroundError(scope, error, unit);
    }
  };

  const mutateAsync = async (variables: TVariables): Promise<TData> => {
    runId += 1;
    const currentRunId = runId;

    abortController?.abort();
    const controller = new AbortController();
    const { signal } = controller;
    abortController = controller;

    const previousState = readUnitState(unit);

    let context = undefined as TContext;
    if (options.onMutate) {
      context = await options.onMutate(variables);
    }

    batch(() => {
      setUnitState(
        unit,
        {
          status: 'pending',
          data: previousState.data,
          error: null,
          variables,
          submittedAt: Date.now(),
        },
        {
          action: 'mutation.execute.start',
          meta: {
            runId: currentRunId,
          },
        },
      );
    });

    const promise = executeWithRetry<TData>({
      run: () => options.mutationFn(variables, { signal }),
      retry: options.retry ?? DEFAULT_RETRY_ATTEMPTS,
      retryDelay: options.retryDelay ?? defaultRetryDelay,
      signal,
      isCancelled: () => currentRunId !== runId,
    })
      .then((data) => {
        batch(() => {
          setUnitState(
            unit,
            {
              status: 'success',
              data,
              error: null,
              variables,
              submittedAt: Date.now(),
            },
            {
              action: 'mutation.execute.success',
              meta: {
                runId: currentRunId,
              },
            },
          );
        });

        if (options.onSuccess) {
          runMutationCallback('mutation.onSuccess', () => {
            options.onSuccess?.(data, variables, context);
          });
        }
        if (options.onSettled) {
          runMutationCallback('mutation.onSettled', () => {
            options.onSettled?.(data, null, variables, context);
          });
        }
        return data;
      })
      .catch((error: unknown) => {
        if (isAbortError(error) || signal.aborted || currentRunId !== runId) {
          batch(() => {
            setUnitState(
              unit,
              previousState,
              {
                action: 'mutation.execute.rollback',
                meta: {
                  runId: currentRunId,
                },
              },
            );
          });
          throw error;
        }

        batch(() => {
          setUnitState(
            unit,
            {
              status: 'error',
              data: previousState.data,
              error: error as TError,
              variables,
              submittedAt: Date.now(),
            },
            {
              action: 'mutation.execute.error',
              meta: {
                runId: currentRunId,
              },
            },
          );
        });

        if (options.onError) {
          runMutationCallback('mutation.onError', () => {
            options.onError?.(error as TError, variables, context);
          });
        }
        if (options.onSettled) {
          runMutationCallback('mutation.onSettled', () => {
            options.onSettled?.(undefined, error as TError, variables, context);
          });
        }

        throw error;
      });

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
        setUnitState(
          unit,
          createInitialState<TData, TError>(),
          {
            action: 'mutation.reset',
          },
        );
      });
    },
    mutate: (variables) => {
      void mutateAsync(variables).catch((error: unknown) => {
        reportBackgroundError('mutation.mutate()', error, unit);
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

  const internal = getInternal(unit);
  if (internal) {
    registerInternal(mutation as object, internal);
  }

  return mutation;
}
