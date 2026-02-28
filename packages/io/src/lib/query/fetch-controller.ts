import { createAbortError, isAbortError } from './utils.js';

export type FetchController<TData> = {
  execute: () => Promise<TData>;
  cancel: () => void;
  getInFlightPromise: () => Promise<TData> | null;
  hasInFlight: () => boolean;
};

export function createFetchController<TData>(options: {
  run: (signal: AbortSignal) => Promise<TData>;
}): FetchController<TData> {
  let inFlightPromise: Promise<TData> | null = null;
  let abortController: AbortController | null = null;
  let generation = 0;

  const cancel = (): void => {
    generation += 1;
    abortController?.abort();
    abortController = null;
    inFlightPromise = null;
  };

  const execute = (): Promise<TData> => {
    if (inFlightPromise) {
      return inFlightPromise;
    }

    generation += 1;
    const currentGeneration = generation;
    const controller = new AbortController();
    const { signal } = controller;
    abortController = controller;

    const promise = options
      .run(signal)
      .catch((error: unknown) => {
        if (
          isAbortError(error) ||
          signal.aborted ||
          currentGeneration !== generation
        ) {
          throw createAbortError();
        }
        throw error;
      })
      .finally(() => {
        if (inFlightPromise === promise) {
          inFlightPromise = null;
        }
        if (abortController?.signal === signal) {
          abortController = null;
        }
      });

    inFlightPromise = promise;
    return promise;
  };

  return {
    execute,
    cancel,
    getInFlightPromise: () => inFlightPromise,
    hasInFlight: () => inFlightPromise !== null,
  };
}
