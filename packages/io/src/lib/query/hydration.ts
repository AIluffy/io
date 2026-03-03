import type {
  IoDehydrateOptions,
  IoDehydratedInfiniteQuery,
  IoDehydratedState,
  IoHydrateOptions,
  IoInfiniteQueryHandle,
  IoQueryHandle,
} from './types.js';

export function dehydrateQueries(
  queries: IoQueryHandle<unknown, unknown>[],
  infiniteQueries: IoInfiniteQueryHandle<unknown, unknown, unknown>[],
  options?: IoDehydrateOptions,
): IoDehydratedState {
  const shouldDehydrateQuery = options?.shouldDehydrateQuery;

  const dehydratedInfinite: IoDehydratedInfiniteQuery[] = infiniteQueries
    .filter((query) => {
      if (!shouldDehydrateQuery) {
        return true;
      }
      return shouldDehydrateQuery(query as unknown as IoQueryHandle<unknown, unknown>);
    })
    .map((query) => ({
      key: query.key,
      keyHash: query.keyHash,
      state: query.getState(),
    }));

  return {
    queries: queries
      .filter((query) => {
        if (!shouldDehydrateQuery) {
          return true;
        }
        return shouldDehydrateQuery(query);
      })
      .map((query) => ({
        key: query.key,
        keyHash: query.keyHash,
        state: query.getState(),
      })),
    ...(dehydratedInfinite.length > 0
      ? { infiniteQueries: dehydratedInfinite }
      : {}),
  };
}

export function filterHydrationQueries(
  state: IoDehydratedState,
  options?: IoHydrateOptions,
): IoDehydratedState {
  const shouldHydrateQuery = options?.shouldHydrateQuery;
  const shouldHydrateInfiniteQuery = options?.shouldHydrateInfiniteQuery;

  return {
    queries: shouldHydrateQuery
      ? state.queries.filter((query) => shouldHydrateQuery(query))
      : state.queries,
    infiniteQueries: shouldHydrateInfiniteQuery
      ? (state.infiniteQueries ?? []).filter((query) =>
          shouldHydrateInfiniteQuery(query),
        )
      : (state.infiniteQueries ?? []),
  };
}
