import type {
  InfiniteData,
  IoInfiniteQueryDefinition,
  IoInfiniteQueryHandle,
  IoQueryClient,
  IoQueryDefinition,
  IoQueryHandle,
} from '@iostore/store/query';

import { getDefaultClient } from '@iostore/store/query';

export type ResolveQueryInput<TData, TError = Error> =
  | IoQueryHandle<TData, TError>
  | IoQueryDefinition<TData, TError>;

export type ResolveInfiniteQueryInput<TData, TError = Error, TPageParam = unknown> =
  | IoInfiniteQueryHandle<TData, TError, TPageParam>
  | IoInfiniteQueryDefinition<TData, TError, TPageParam>;

export function resolveQueryHandle<TData, TError = Error>(options: {
  input: ResolveQueryInput<TData, TError>;
  client?: IoQueryClient;
}): IoQueryHandle<TData, TError> {
  const client = options.client ?? getDefaultClient();
  const { input } = options;

  if ('fetch' in input) {
    return input;
  }

  return client.defineQuery<TData, TError>(input);
}

export function resolveInfiniteQueryHandle<TData, TError = Error, TPageParam = unknown>(options: {
  input: ResolveInfiniteQueryInput<TData, TError, TPageParam>;
  client?: IoQueryClient;
}): IoInfiniteQueryHandle<TData, TError, TPageParam> {
  const client = options.client ?? getDefaultClient();
  const { input } = options;

  if ('fetchNextPage' in input) {
    return input;
  }

  return client.defineInfiniteQuery<TData, TError, TPageParam>(input);
}

export async function ensureQueryData<TData, TError = Error>(options: {
  input: ResolveQueryInput<TData, TError>;
  client?: IoQueryClient;
}): Promise<TData> {
  return resolveQueryHandle(options).ensureData();
}

export async function ensureInfiniteQueryData<
  TData,
  TError = Error,
  TPageParam = unknown,
>(options: {
  input: ResolveInfiniteQueryInput<TData, TError, TPageParam>;
  client?: IoQueryClient;
}): Promise<InfiniteData<TData, TPageParam>> {
  return resolveInfiniteQueryHandle(options).ensureData();
}
