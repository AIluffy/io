# @iostore/svelte

`@iostore/svelte` 把 io 的响应式状态与 query 运行时包装成标准 Svelte Store 接口，目标是“框架无侵入 + 语义统一”。你可以把它看作 Svelte 版 TanStack Query + io state bridge：既支持查询、无限查询、变更，也支持把 io source/unit 转成 `readable/writable`。

## 安装

```bash
npm i @iostore/store @iostore/svelte svelte
```

> peerDependencies：`svelte >=4`。

## Quick Start（< 30 行）

```ts
import { createQueryStore } from '@iostore/svelte';

type User = { id: number; name: string };

export const userStore = createQueryStore<User>({
  key: ['user', 1],
  queryFn: async ({ signal }) =>
    fetch('/api/users/1', { signal }).then((r) => r.json() as Promise<User>),
});
```

```svelte
<script lang="ts">
  import { userStore } from './stores';
</script>

{#if $userStore.status === 'pending'}Loading...{:else}{$userStore.data?.name}{/if}
```

## API 参考

### 基础桥接

#### `toReadable<T>(source, options?) => Readable<T>`

把 io 可订阅 source 变成 Svelte readable。

#### `toWritable<T>(unit, options?) => Writable<T>`

把 io unit 变成 Svelte writable，支持 `set` / `update` 回写。

#### `toReadableSelector<TSource, TSelected>(source, selector, options?) => Readable<TSelected>`

带选择器的 readable，支持 `isEqual` 防抖比较。

### Query Store

#### `toQueryStore(observer, query, options?) => IoQueryStore`

将已有 query observer + handle 转成标准 Query Store。

#### `createQueryStore(options) => IoQueryStore`

一站式创建 query + observer + store。支持 definition/handle 两种模式。

`IoQueryStore` 扩展了 `Readable<IoQueryObserverResult>`，额外包含：`getState`、`fetch`、`refetch`、`prefetch`、`invalidate`、`cancel`、`query`、`observer`。

### Infinite Query Store

#### `toInfiniteQueryStore(observer, query, options?) => IoInfiniteQueryStore`

把无限查询 observer 转成 store。

#### `createInfiniteQueryStore(options) => IoInfiniteQueryStore`

创建无限查询 store。支持：`initialPageParam`、`getNextPageParam`、`getPreviousPageParam`、`maxPages`。

`IoInfiniteQueryStore` 在 `Readable<IoInfiniteQueryObserverResult>` 基础上增加：`fetchNextPage`、`fetchPreviousPage`、`refetch`、`prefetch`、`invalidate`、`cancel`。

### Mutation Store

#### `createMutationStore(options) => IoMutationStore`

创建 mutation store，返回 `state`、`flags`、`mutate`、`mutateAsync`、`reset`、`cancel`、`mutation`。

### Suspense 风格 Store

#### `createSuspenseQueryStore(options) => IoSuspenseQueryStore`

创建“读取即保证有数据”的 query store（内部语义对齐 suspense）。

#### `createSuspenseInfiniteQueryStore(options) => IoSuspenseInfiniteQueryStore`

无限查询的 suspense 版本。

### 导出类型

- `IoQueryStore`
- `IoInfiniteQueryStore`
- `IoMutationStore`
- `IoSuspenseQueryStore`
- `IoSuspenseInfiniteQueryStore`

## 高级用法

### 1) 自动取消最后一个订阅者退出后的请求

`toQueryStore` / `toInfiniteQueryStore` / create*Store 均可通过 `cancelOnUnsubscribe` 在订阅数归零时执行 `query.cancel()`，适合页面临时挂载场景。

### 2) 组合 derived store

Svelte 下推荐使用 `derived` 再次投影 query 结果：

```ts
import { derived } from 'svelte/store';
import { createQueryStore } from '@iostore/svelte';

const q = createQueryStore<{ list: string[] }>({
  key: ['list'],
  queryFn: async () => ({ list: ['a', 'b'] }),
});

export const count = derived(q, ($q) => $q.data?.list.length ?? 0);
```

### 3) 手动失效与预取

你可以在路由切换前调用 `store.prefetch()`，在写操作后调用 `store.invalidate()`，形成“写后读一致性”。

## 迁移指南（TanStack Query -> @iostore/svelte）

| TanStack Query | @iostore/svelte 对应 |
|---|---|
| `useQuery` | `createQueryStore` |
| `useInfiniteQuery` | `createInfiniteQueryStore` |
| `useMutation` | `createMutationStore` |
| `useSuspenseQuery` | `createSuspenseQueryStore` |
| `useSuspenseInfiniteQuery` | `createSuspenseInfiniteQueryStore` |
| `queryClient.invalidateQueries` | `store.invalidate()` |
| `queryClient.cancelQueries` | `store.cancel()` |

差异点：Svelte 版本围绕 Store 设计，而不是 Hook。

## 框架差异说明

- React/Lynx/Solid/Vue 更偏“运行时函数调用 + 组件框架生命周期”。
- Svelte 版本将能力压到 store 对象上，便于在组件外共享。
- 命名维持统一：`fetch/refetch/prefetch/invalidate/cancel` 全家桶保持一致。

## API 覆盖度清单

| 导出 API | 已覆盖 |
|---|---|
| `toReadable` | ✅ |
| `toWritable` | ✅ |
| `toReadableSelector` | ✅ |
| `toQueryStore` | ✅ |
| `createQueryStore` | ✅ |
| `toInfiniteQueryStore` | ✅ |
| `createInfiniteQueryStore` | ✅ |
| `createMutationStore` | ✅ |
| `createSuspenseQueryStore` | ✅ |
| `createSuspenseInfiniteQueryStore` | ✅ |
| `IoQueryStore` | ✅ |
| `IoInfiniteQueryStore` | ✅ |
| `IoMutationStore` | ✅ |
| `IoSuspenseQueryStore` | ✅ |
| `IoSuspenseInfiniteQueryStore` | ✅ |
