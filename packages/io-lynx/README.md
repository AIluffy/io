# @iostore/lynx

IO 的 Lynx 适配层（hooks）。

## Exports

- `useIO`
- `useIOSelector`
- `useQuery`
- `useResource`

## Query quick start

```tsx
import { useQuery } from '@iostore/lynx';

function UserName(props: { id: number }) {
  const user = useQuery({
    key: ['user', props.id],
    queryFn: async () => {
      'background only';
      return fetch(`/api/users/${props.id}`).then((r) => r.json());
    },
  });
  return <text>{user.data?.name ?? 'loading'}</text>;
}
```
