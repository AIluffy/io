/**
 * Query client hydration/dehydration helpers.
 */
import type { QueryCache } from './query-cache.js';
import type {
  IoDehydrateOptions,
  IoDehydratedInfiniteQuery,
  IoDehydratedQuery,
  IoDehydratedState,
  IoHydrateOptions,
  IoQueryHandle,
} from './types.js';
import { dehydrateQueries, filterHydrationQueries } from './hydration.js';
import {
  createSeededInfiniteQueryFn,
  createSeededQueryFn,
} from './client-helpers.js';
import {
  type QueryDefaults,
  normalizeDefinition,
  normalizeInfiniteDefinition,
} from './client-defaults.js';

type HydrationDeps = {
  cache: QueryCache;
  defaults: QueryDefaults;
  getQueries: () => IoQueryHandle<unknown, unknown>[];
};

export function createClientHydration({ cache, defaults, getQueries }: HydrationDeps) {
  const dehydrate = (dehydrateOptions?: IoDehydrateOptions): IoDehydratedState =>
    dehydrateQueries(getQueries(), cache.getAllInfinite(), dehydrateOptions);

  const hydrate = (state: IoDehydratedState, hydrateOptions?: IoHydrateOptions): void => {
    const filtered = filterHydrationQueries(state, hydrateOptions);

    for (const query of filtered.queries) {
      const existing = cache.getRecord<unknown, unknown>(query.key);
      if (existing) {
        existing.hydrate(query.state);
        continue;
      }
      cache.seed(
        normalizeDefinition<unknown, Error>(
          defaults,
          { key: query.key, queryFn: createSeededQueryFn(query.keyHash) },
          false,
        ),
        query.state,
      );
    }

    for (const query of filtered.infiniteQueries ?? []) {
      const existing = cache.getInfiniteRecord<unknown, unknown, unknown>(query.key);
      if (existing) {
        existing.hydrate(query.state);
        continue;
      }
      cache.seedInfinite(
        normalizeInfiniteDefinition<unknown, Error, unknown>(
          defaults,
          {
            key: query.key,
            queryFn: createSeededInfiniteQueryFn<unknown>(query.keyHash),
            initialPageParam: undefined,
            getNextPageParam: () => null,
          },
          false,
        ),
        query.state,
      );
    }
  };

  return { dehydrate, hydrate };
}

export function isDehydratedQuery(value: unknown): value is IoDehydratedQuery {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return 'key' in value && 'keyHash' in value && 'state' in value;
}

export function isDehydratedInfiniteQuery(value: unknown): value is IoDehydratedInfiniteQuery {
  if (!isDehydratedQuery(value)) {
    return false;
  }

  const state = (value as { state: unknown }).state;
  return typeof state === 'object' && state !== null && 'fetchDirection' in state;
}
