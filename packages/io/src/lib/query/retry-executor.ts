import {
  createAbortError,
  isAbortError,
  shouldRetry,
  sleep,
} from './utils.js';

export type RetryExecutorOptions<TValue> = {
  run: () => Promise<TValue>;
  retry: number;
  retryDelay: (attempt: number) => number;
  signal?: AbortSignal;
  isCancelled?: () => boolean;
  onFailedAttempt?: (failureCount: number, error: unknown) => void;
};

export async function executeWithRetry<TValue>(
  options: RetryExecutorOptions<TValue>,
): Promise<TValue> {
  let failureCount = 0;

  while (true) {
    try {
      if (options.signal?.aborted || options.isCancelled?.()) {
        throw createAbortError();
      }

      const value = await options.run();

      if (options.signal?.aborted || options.isCancelled?.()) {
        throw createAbortError();
      }

      return value;
    } catch (error) {
      if (
        isAbortError(error) ||
        options.signal?.aborted ||
        options.isCancelled?.()
      ) {
        throw createAbortError();
      }

      failureCount += 1;
      options.onFailedAttempt?.(failureCount, error);
      if (!shouldRetry(failureCount, options.retry, error)) {
        throw error;
      }

      await sleep(options.retryDelay(failureCount - 1), options.signal);
    }
  }
}
