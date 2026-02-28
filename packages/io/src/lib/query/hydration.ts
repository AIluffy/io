import type {
  IoDehydrateOptions,
  IoDehydratedState,
  IoHydrateOptions,
  IoQueryHandle,
} from './types.js';

export function dehydrateQueries(
  queries: IoQueryHandle<unknown, unknown>[],
  options?: IoDehydrateOptions,
): IoDehydratedState {
  const shouldDehydrateQuery = options?.shouldDehydrateQuery;

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
  };
}

export function filterHydrationQueries(
  state: IoDehydratedState,
  options?: IoHydrateOptions,
): IoDehydratedState {
  const shouldHydrateQuery = options?.shouldHydrateQuery;
  if (!shouldHydrateQuery) {
    return state;
  }

  return {
    queries: state.queries.filter((query) => shouldHydrateQuery(query)),
  };
}
