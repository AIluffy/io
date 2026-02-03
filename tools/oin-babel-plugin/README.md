# OIN Babel Plugin (access-chain)

Transforms `oin()` access chains into a runtime helper to avoid proxy/deep tracking overhead.

## What it does

Input:

```ts
import { oin } from '@oin/store';

const s = oin({ user: { profile: { age: 1 } }, items: [{ count: 0 }] });
s.user.profile.age();
s.items[0].count((v) => v + 1);
```

Output (conceptual):

```ts
const s = oin(...);
__oin_get(s, ['user', 'profile', 'age'])();
__oin_get(s, ['items', 0, 'count'])((v) => v + 1);
```

The helper uses OIN internals (`Symbol.for('@oin/store/internal')`) to resolve children without proxy access.

## Usage

Add to your Babel config:

```js
import oinAccessPlugin from './tools/oin-babel-plugin/index.mjs';

export default {
  plugins: [oinAccessPlugin],
};
```

## Limits (by design)

- Only rewrites chains rooted at `oin(...)` or variables assigned from `oin(...)`.
- Only supports static paths:
  - `obj.foo.bar`
  - `obj['foo']`
  - `obj[0]`
- Skips optional chaining and dynamic computed properties.
