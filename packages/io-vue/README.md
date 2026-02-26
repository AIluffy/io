# @iostore/vue

IO 的 Vue 适配层（Composition API utilities）。

## Exports

- `useIO`
- `useIOSelector`
- `ioRef`
- `useQuery`

## Query quick start

```ts
import { useQuery } from '@iostore/vue';

const user = useQuery({
  key: ['user', id],
  queryFn: async ({ signal }) =>
    fetch(`/api/users/${id}`, { signal }).then((r) => r.json()),
});
```
