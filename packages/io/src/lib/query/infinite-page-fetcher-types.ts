import type { KeyHash } from './types.js';

export type InfiniteFetcherDefinition<TData, TPageParam> = {
  keyHash: KeyHash;
  maxPages?: number;
  retry: number;
  retryDelay: (attempt: number) => number;
  canFetch: boolean;
  initialPageParam: TPageParam;
  queryFn: (context: { signal: AbortSignal; pageParam: TPageParam }) => Promise<TData>;
  getNextPageParam: (
    lastPage: TData,
    allPages: readonly TData[],
    lastPageParam: TPageParam,
    allPageParams: readonly TPageParam[],
  ) => TPageParam | undefined | null;
  getPreviousPageParam?: (
    firstPage: TData,
    allPages: readonly TData[],
    firstPageParam: TPageParam,
    allPageParams: readonly TPageParam[],
  ) => TPageParam | undefined | null;
};
