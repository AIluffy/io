import type { IoQueryClient, IoQueryFilter } from './types.js';

import { createQueryClient } from './client-core.js';
import {
  isDehydratedInfiniteQuery,
  isDehydratedQuery,
} from './client-hydration.js';
import { reportBackgroundError } from './utils.js';

let defaultClient: IoQueryClient | undefined;

export { createQueryClient, isDehydratedInfiniteQuery, isDehydratedQuery };

export function getDefaultClient(): IoQueryClient {
  if (!defaultClient) {
    defaultClient = createQueryClient();
  }
  return defaultClient;
}

export function resetDefaultClient(): void {
  defaultClient?.clear();
  defaultClient = undefined;
}

export function safeRefetch(
  client: IoQueryClient,
  filter?: IoQueryFilter,
): void {
  void client.refetchQueries(filter).catch((error: unknown) => {
    reportBackgroundError('queryClient.safeRefetch()', error);
  });
}
