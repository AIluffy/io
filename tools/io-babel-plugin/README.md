# IO Babel Plugin (access-chain)

Transforms `io()` access chains into a runtime helper to avoid proxy/deep tracking overhead.

## What it does

Input:

```ts
import { io } from 'io-store';

const s = io({ user: { profile: { age: 1 } }, items: [{ count: 0 }] });
s.user.profile.age();
s.items[0].count((v) => v + 1);
```

Output (conceptual):

```ts
const s = io(...);
__oin_get(s, ['user', 'profile', 'age'])();
__oin_get(s, ['items', 0, 'count'])((v) => v + 1);
```

The helper uses IO internals (`Symbol.for('io-store/internal')`) to resolve children without proxy access.

## Usage

Add to your Babel config:

```js
import ioAccessPlugin from './tools/io-babel-plugin/index.mjs';

export default {
  plugins: [ioAccessPlugin],
};
```

## Limits (by design)

- Only rewrites chains rooted at `io(...)` or variables assigned from `io(...)`.
- Only supports static paths:
  - `obj.foo.bar`
  - `obj['foo']`
  - `obj[0]`
- Skips optional chaining and dynamic computed properties.
