# @iostore/solid

IO 的 Solid 适配层（hooks）。

## Exports

- `useIO`
- `useQuery`
- `useResource`

## Query quick start

```tsx
import { useQuery } from '@iostore/solid';

export function UserName(props: { id: number }) {
  const user = useQuery({
    key: ['user', props.id],
    queryFn: async () => fetch(`/api/users/${props.id}`).then((r) => r.json()),
  });
  return <span>{user.data()?.name ?? 'loading'}</span>;
}
```
