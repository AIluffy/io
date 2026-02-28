import { describe, expect, it, vi } from 'vitest';

import { createMutation } from '../query/mutation.js';
import { onError } from '../utils/debug/debug.js';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('@iostore/query createMutation', () => {
  it('runs onMutate -> onSuccess -> onSettled with context', async () => {
    const onMutate = vi.fn(async (value: number) => ({ previous: value - 1 }));
    const onSuccess = vi.fn();
    const onSettled = vi.fn();

    const mutation = createMutation<number, number, Error, { previous: number }>({
      mutationFn: async (value) => value * 2,
      onMutate,
      onSuccess,
      onSettled,
    });

    const result = await mutation.mutateAsync(4);

    expect(result).toBe(8);
    expect(onMutate).toHaveBeenCalledWith(4);
    expect(onSuccess).toHaveBeenCalledWith(8, 4, { previous: 3 });
    expect(onSettled).toHaveBeenCalledWith(8, null, 4, { previous: 3 });

    const state = mutation.snapshot();
    expect(state.status).toBe('success');
    expect(state.data).toBe(8);
    expect(mutation.flags.isSuccess).toBe(true);
  });

  it('runs onMutate -> onError -> onSettled on failures', async () => {
    const failure = new Error('mutation failed');
    const onError = vi.fn();
    const onSettled = vi.fn();

    const mutation = createMutation<number, number, Error, { previous: number }>({
      mutationFn: async () => {
        throw failure;
      },
      retry: 0,
      onMutate: async (value) => ({ previous: value }),
      onError,
      onSettled,
    });

    await expect(mutation.mutateAsync(3)).rejects.toBe(failure);

    expect(onError).toHaveBeenCalledWith(failure, 3, { previous: 3 });
    expect(onSettled).toHaveBeenCalledWith(undefined, failure, 3, {
      previous: 3,
    });

    const state = mutation.snapshot();
    expect(state.status).toBe('error');
    expect(state.error).toMatchObject({ message: 'mutation failed' });
    expect(mutation.flags.isError).toBe(true);
  });

  it('retries failed mutation before succeeding', async () => {
    let attempts = 0;
    const mutation = createMutation<number, number>({
      mutationFn: async (value) => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error('retry');
        }
        return value;
      },
      retry: 2,
      retryDelay: () => 0,
    });

    const result = await mutation.mutateAsync(5);

    expect(result).toBe(5);
    expect(attempts).toBe(3);
  });

  it('supports cancellation for an in-flight mutation by aborting signal', async () => {
    const deferred = createDeferred<number>();
    const seenSignals: AbortSignal[] = [];

    const mutation = createMutation<number, number>({
      mutationFn: async (_value, context) => {
        seenSignals.push(context.signal);
        return deferred.promise;
      },
    });

    const pending = mutation.mutateAsync(1);
    mutation.cancel();
    deferred.resolve(1);

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(mutation.snapshot().status).toBe('idle');
    expect(seenSignals).toHaveLength(1);
    expect(seenSignals[0]?.aborted).toBe(true);
  });

  it('mutate() is fire-and-forget wrapper', async () => {
    const mutation = createMutation<number, number>({
      mutationFn: async (value) => value + 1,
    });

    mutation.mutate(2);
    await Promise.resolve();
    await Promise.resolve();

    expect(mutation.snapshot().data).toBe(3);
    expect(mutation.flags.isSuccess).toBe(true);
  });

  it('isolates callback errors from mutateAsync result', async () => {
    const successMutation = createMutation<number, number>({
      mutationFn: async (value) => value * 2,
      onSuccess: () => {
        throw new Error('onSuccess-callback');
      },
      onSettled: () => {
        throw new Error('onSettled-callback');
      },
    });

    await expect(successMutation.mutateAsync(3)).resolves.toBe(6);
    expect(successMutation.snapshot().status).toBe('success');

    const sourceError = new Error('source-error');
    const errorMutation = createMutation<number, number>({
      mutationFn: async () => {
        throw sourceError;
      },
      retry: 0,
      onError: () => {
        throw new Error('onError-callback');
      },
      onSettled: () => {
        throw new Error('onSettled-callback');
      },
    });

    await expect(errorMutation.mutateAsync(1)).rejects.toBe(sourceError);
    expect(errorMutation.snapshot().status).toBe('error');
    expect(errorMutation.snapshot().error).toMatchObject({ message: 'source-error' });
  });

  it('annotates mutation updates with action/meta', async () => {
    const mutation = createMutation<number, number>({
      mutationFn: async (value) => value + 1,
    });

    const updates: Array<{ action?: string; meta?: unknown }> = [];
    const unsub = mutation.subscribeUpdate((update) => {
      updates.push({
        action: update.action,
        meta: update.meta,
      });
    });

    await expect(mutation.mutateAsync(2)).resolves.toBe(3);
    unsub();

    const start = updates.find((update) => update.action === 'mutation.execute.start');
    const success = updates.find((update) => update.action === 'mutation.execute.success');

    expect(start).toBeDefined();
    expect(success).toBeDefined();
    expect(start?.meta).toMatchObject({ runId: 1 });
    expect(success?.meta).toMatchObject({ runId: 1 });
  });

  it('routes mutate() background errors to IO onError listeners', async () => {
    const mutation = createMutation<number, number>({
      mutationFn: async () => {
        throw new Error('mutation-background-error');
      },
      retry: 0,
    });

    const events: Array<{ error: unknown; operation: string }> = [];
    const unsub = onError(mutation, (error, _path, operation) => {
      events.push({
        error,
        operation,
      });
    });

    mutation.mutate(1);
    await vi.waitFor(() => {
      expect(events).toHaveLength(1);
    });
    expect(events[0].error).toMatchObject({
      message: 'mutation-background-error',
    });
    expect(events[0].operation).toBe('applyUpdate');

    unsub();
  });
});
