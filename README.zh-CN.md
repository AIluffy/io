# Io

细粒度响应式状态管理库，支持 React、Lynx、Vue、Svelte、Solid。

语言: [English](./README.md) | 简体中文

## 特性

- 细粒度更新：只触发受影响节点。
- 深层对象与数组可直接操作，API 一致。
- 支持更新日志、回放与撤销。
- 一套状态模型，多框架复用。

## 安装

```bash
npm i @iostore/store
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
import { useIO } from '@iostore/react';
const value = useIO(countUnit);
```

Lynx:

```tsx
import { useIO } from '@iostore/lynx';
const value = useIO(countUnit);
```

Vue:

```ts
import { ioRef, useIO } from '@iostore/vue';
const stateRef = useIO(source);
const countRef = ioRef(countUnit);
```

Svelte:

```ts
import { toReadable, toWritable } from '@iostore/svelte';
const readable = toReadable(state);
const writable = toWritable(unit);
```

Solid:

```tsx
import { useIO } from '@iostore/solid';
const value = useIO(countUnit);
```

## 包列表

- `@iostore/store`
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
