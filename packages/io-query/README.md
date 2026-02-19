# @iostore/query

`@iostore/query` provides query caching primitives for IO ecosystem:

- Cache with `staleTime`
- In-flight dedupe
- Invalidation
- Retry with configurable backoff
- Cancellation via `AbortSignal`
- Prefetch utilities

## Quick start

```ts
import { createQueryClient, createResource } from '@iostore/query';

const client = createQueryClient({
  defaultStaleTime: 5_000,
});

const userResource = createResource({
  client,
  key: ['user', 1],
  queryFn: async ({ signal }) => {
    const response = await fetch('/api/user/1', { signal });
    return response.json() as Promise<{ id: number; name: string }>;
  },
});

await userResource.prefetch();
const user = userResource.read();
```

## Framework adapters

- React: `@iostore/react` (`useQuery`, `useResource`)
- Lynx: `@iostore/lynx` (`useQuery`, `useResource`)
- Vue: `@iostore/vue` (`useQuery`, `useResource`)
- Solid: `@iostore/solid` (`useQuery`, `useResource`)
- Svelte: `@iostore/svelte` (`createQueryStore`, `toQueryStore`)
