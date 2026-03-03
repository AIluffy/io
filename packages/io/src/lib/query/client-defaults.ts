/**
 * Query client default values and definition normalization.
 */
import type { NormalizedInfiniteQueryDefinition } from './infinite-query-record.js';
import type { NormalizedQueryDefinition } from './query-record.js';
import type {
  IoInfiniteQueryDefinition,
  IoQueryClientOptions,
  IoQueryDefinition,
} from './types.js';
import {
  DEFAULT_GC_TIME,
  DEFAULT_RETRY_ATTEMPTS,
  DEFAULT_STALE_TIME,
  defaultRetryDelay,
  hashKey,
} from './utils.js';

export type QueryDefaults = {
  staleTime: number;
  gcTime: number;
  retry: number;
  retryDelay: (attempt: number) => number;
  refetchOnMount: false | 'stale' | 'always';
  refetchOnWindowFocus: boolean;
  refetchOnReconnect: boolean;
};

export function createQueryDefaults(options: IoQueryClientOptions): QueryDefaults {
  return {
    staleTime: options.defaultStaleTime ?? DEFAULT_STALE_TIME,
    gcTime: options.defaultGcTime ?? DEFAULT_GC_TIME,
    retry: options.defaultRetry ?? DEFAULT_RETRY_ATTEMPTS,
    retryDelay: options.defaultRetryDelay ?? defaultRetryDelay,
    refetchOnMount: options.defaultRefetchOnMount ?? 'stale',
    refetchOnWindowFocus: options.defaultRefetchOnWindowFocus ?? false,
    refetchOnReconnect: options.defaultRefetchOnReconnect ?? false,
  };
}

export function normalizeDefinition<TData, TError>(
  defaults: QueryDefaults,
  definition: IoQueryDefinition<TData, TError>,
  canFetch = true,
): NormalizedQueryDefinition<TData, TError> {
  return {
    key: definition.key,
    keyHash: hashKey(definition.key),
    queryFn: definition.queryFn,
    staleTime: definition.staleTime ?? defaults.staleTime,
    gcTime: definition.gcTime ?? defaults.gcTime,
    retry: definition.retry ?? defaults.retry,
    retryDelay: definition.retryDelay ?? defaults.retryDelay,
    canFetch,
  };
}

export function normalizeInfiniteDefinition<TData, TError, TPageParam>(
  defaults: QueryDefaults,
  definition: IoInfiniteQueryDefinition<TData, TError, TPageParam>,
  canFetch = true,
): NormalizedInfiniteQueryDefinition<TData, TError, TPageParam> {
  return {
    key: definition.key,
    keyHash: hashKey(definition.key),
    queryFn: definition.queryFn,
    initialPageParam: definition.initialPageParam,
    getNextPageParam: definition.getNextPageParam,
    getPreviousPageParam: definition.getPreviousPageParam,
    maxPages: definition.maxPages,
    staleTime: definition.staleTime ?? defaults.staleTime,
    gcTime: definition.gcTime ?? defaults.gcTime,
    retry: definition.retry ?? defaults.retry,
    retryDelay: definition.retryDelay ?? defaults.retryDelay,
    canFetch,
  };
}
