# Io

细粒度响应式状态管理库，支持 React、Lynx、Vue、Svelte、Solid。

语言: [English](./README.md) | 简体中文

## 特性

- 细粒度更新：只触发受影响节点。
- 深层对象与数组可直接操作，API 一致。
- 支持更新日志、回放与撤销。
- 一套状态模型，多框架复用。
- 内置 Query/Resource 运行时：缓存、去重、失效、重试、取消、预取。

## 安装

```bash
npm i @iostore/store
npm i @iostore/query
```

按需安装适配层：

```bash
npm i @iostore/react
npm i @iostore/lynx
npm i @iostore/vue
npm i @iostore/svelte
npm i @iostore/solid
```

## 快速开始

```ts
import { io } from '@iostore/store';
import { derived } from '@iostore/store/derived';

const state = io({ count: 0, items: [1, 2, 3] });
state.count.set((v) => v + 1);
state.items.push(4);

const doubled = derived([state.count], (count) => count * 2);
```

更新回放与撤销：

```ts
import { applyUpdate, replay, undoUpdate } from '@iostore/store/patches';

const updates = [];
state.subscribeUpdate((u) => updates.push(u));

replay(anotherState, updates);
applyUpdate(state, undoUpdate(updates[0]));
```

## 框架集成

React:

```tsx
import { useIO, useQuery } from '@iostore/react';
const value = useIO(countUnit);
const user = useQuery({
  key: ['user', id],
  queryFn: async () => fetch(`/api/users/${id}`).then((r) => r.json()),
});
```

Lynx:

```tsx
import { useIO, useQuery } from '@iostore/lynx';
const value = useIO(countUnit);
const user = useQuery({
  key: ['user', id],
  queryFn: async () => fetch(`/api/users/${id}`).then((r) => r.json()),
});
```

Vue:

```ts
import { ioRef, useIO, useQuery } from '@iostore/vue';
const stateRef = useIO(source);
const countRef = ioRef(countUnit);
const user = useQuery({
  key: ['user', id],
  queryFn: async () => fetch(`/api/users/${id}`).then((r) => r.json()),
});
```

Svelte:

```ts
import { createQueryStore, toReadable, toWritable } from '@iostore/svelte';
const readable = toReadable(state);
const writable = toWritable(unit);
const user = createQueryStore({
  key: ['user', id],
  queryFn: async () => fetch(`/api/users/${id}`).then((r) => r.json()),
});
```

Solid:

```tsx
import { useIO, useQuery } from '@iostore/solid';
const value = useIO(countUnit);
const user = useQuery({
  key: ['user', id],
  queryFn: async () => fetch(`/api/users/${id}`).then((r) => r.json()),
});
```

## 包列表

- `@iostore/store`
- `@iostore/query`
- `@iostore/react`
- `@iostore/lynx`
- `@iostore/vue`
- `@iostore/svelte`
- `@iostore/solid`
- `@iostore/devtools`
- `@iostore/devtools-react`
- `@iostore/skill`

## 文档索引

- 中文文档目录：`apps/docs/src/content/docs`
- 英文文档目录：`apps/docs/src/content/docs/en`

## License

MIT
