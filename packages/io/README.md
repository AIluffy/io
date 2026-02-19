# @iostore/store

IO 核心状态库：Unit / ArrayUnit / Scope / Derived / Snapshot，并支持更新追踪、合并与回放。

## 深层对象

- `io()` 对 object / array 默认进行 deep 处理。
- 需要“仅第一层变成 Unit”的行为时使用 `io(value, { shallow: true })`。

## Behavior 扩展

本包提供最小行为扩展层，支持对读/写/订阅行为进行组合增强。

```ts
import { io } from '@iostore/store';
import {
  withBehaviors,
  schedule,
  throttle,
  effect,
  persist,
} from '@iostore/store/behavior';

const count = io(0);
const view = withBehaviors(count, [
  schedule('microtask'),
  throttle(50),
  effect((value) => {
    console.log('effect', value);
  }),
  persist({ key: 'count' }),
]);

view.subscribe((v) => console.log(v));
view.set?.(1);
```

也可在树形结构中按路径构造视图：

```ts
import { io } from '@iostore/store';
import { relocate } from '@iostore/store/extensions';

const state = io({ user: { age: 1 } });
const age = relocate<number>(state, ['user', 'age']);
age(2);
```

DevTools 示例（按需引入）：

```ts
import { createIoDevtools } from '@iostore/devtools';
import { io } from '@iostore/store';
import { devtools, withBehaviors } from '@iostore/store/behavior';

const count = io(0);
const view = withBehaviors(count, [
  devtools({ target: count, create: createIoDevtools }),
]);

const dt = view.extensions?.devtools;
```
