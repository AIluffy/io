# @iostore/react

IO 的 React 适配层（hooks）。

## Exports

- `useIO`
- `useIOSelector`
- `useQuery`
- `useResource`

## Query quick start

```tsx
import { useQuery } from '@iostore/react';

export function UserName({ id }: { id: number }) {
  const user = useQuery({
    key: ['user', id],
    queryFn: async () => fetch(`/api/users/${id}`).then((r) => r.json()),
  });
  return <span>{user.data?.name ?? 'loading'}</span>;
}
```
