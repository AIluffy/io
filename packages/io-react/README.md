# @iostore/react

IO 的 React 适配层（hooks）。

## Exports

- `useIO`
- `useIOSelector`
- `useQuery`
- `useMutation`
- `useSuspenseQuery`

## Query quick start

```tsx
import { useQuery } from '@iostore/react';

export function UserName({ id }: { id: number }) {
  const user = useQuery({
    key: ['user', id],
    queryFn: async ({ signal }) =>
      fetch(`/api/users/${id}`, { signal }).then((r) => r.json()),
  });
  return <span>{user.data?.name ?? 'loading'}</span>;
}
```
