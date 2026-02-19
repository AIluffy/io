# @iostore/vue

IO 的 Vue 适配层（Composition API utilities）。

## Exports

- `useIO`
- `ioRef`
- `useQuery`
- `useResource`

## Query quick start

```ts
import { useQuery } from '@iostore/vue';

const user = useQuery({
  key: ['user', id],
  queryFn: async () => fetch(`/api/users/${id}`).then((r) => r.json()),
});
```
