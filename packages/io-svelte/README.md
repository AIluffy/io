# @iostore/svelte

IO 的 Svelte 适配层（stores）。

## Exports

- `toReadable`
- `toReadableSelector`
- `toWritable`
- `toQueryStore`
- `createQueryStore`

## Query quick start

```ts
import { createQueryStore } from '@iostore/svelte';

const userStore = createQueryStore({
  key: ['user', id],
  queryFn: async () => fetch(`/api/users/${id}`).then((r) => r.json()),
});
```
