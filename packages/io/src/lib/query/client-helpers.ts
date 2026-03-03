/**
 * Shared helpers for query client internals.
 */
import type { IoQueryHandle, IoQueryInput } from './types.js';

export function isHandle<TData, TError>(
  value: IoQueryInput<TData, TError>,
): value is IoQueryHandle<TData, TError> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'keyHash' in value &&
    'fetch' in value &&
    typeof (value as { fetch?: unknown }).fetch === 'function'
  );
}

export function createSeededQueryFn(keyHash: string): (context: {
  signal: AbortSignal;
}) => Promise<never> {
  return async () => {
    throw new Error(
      `query.fetch: queryFn is not available for key ${keyHash}. Call defineQuery(...) first.`,
    );
  };
}

export function createSeededInfiniteQueryFn<TPageParam>(keyHash: string): (context: {
  signal: AbortSignal;
  pageParam: TPageParam;
}) => Promise<never> {
  return async () => {
    throw new Error(
      `infiniteQuery.fetch: queryFn is not available for key ${keyHash}. Call defineInfiniteQuery(...) first.`,
    );
  };
}

export function isInfiniteHandle(value: unknown): value is { fetchNextPage: unknown } {
  return typeof value === 'object' && value !== null && 'fetchNextPage' in value;
}
