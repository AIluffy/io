# @iostore/react

`@iostore/react` 是 io 查询与状态系统在 React 18/19 下的官方适配层。它的设计目标和 TanStack Query 类似：把「请求状态管理、缓存、重试、失效、观察者订阅」封装成声明式 API；同时保留 io 的细粒度响应式能力，使你可以在同一个组件内同时管理本地状态单元（`io` / `unit`）与远程数据（`query` / `mutation`）。

## 安装

```bash
npm i @iostore/store @iostore/react react
```

> peerDependencies：`react: ^18.2.0 || ^19.0.0`。

## Quick Start（< 30 行）

```tsx
import { useQuery } from '@iostore/react';

type User = { id: number; name: string };

export function UserName({ id }: { id: number }) {
  const q = useQuery<User>({
    key: ['user', id],
    queryFn: async ({ signal }) =>
      fetch(`/api/users/${id}`, { signal }).then((r) => r.json() as Promise<User>),
  });

  if (q.status === 'pending') return <span>Loading...</span>;
  if (q.status === 'error') return <span>{String(q.error)}</span>;
  return <span>{q.data?.name}</span>;
}
```

## API 参考

### `useIO<T>(source, options?) => T`

把 io 可订阅对象桥接到 React 渲染。`source` 需提供 `snapshot/get` 与 `subscribe` 能力。`options.schedule` 支持 `sync` / `microtask` 等调度策略。

### `useIOSelector<TSource, TSelected>(source, selector, options?) => TSelected`

带选择器的订阅 Hook，支持 `isEqual(prev, next)` 进行结果级去抖与比较，适合大对象中只取子字段场景。

### `useQuery<TData, TError, TSelected>(options) => UseQueryResult`

查询主 Hook。`options` 支持两种模式：

1. **Definition 模式**：传 `key + queryFn`，内部自动定义或复用 query。
2. **Handle 模式**：直接传 `query`（`IoQueryHandle`），适合跨组件共享 handle。

关键能力：`enabled`、`placeholderData`、`select`、`refetchOnMount`、`refetchOnWindowFocus`、`refetchOnReconnect`、`onSuccess/onError/onSettled`、`cancelOnUnmount`。

返回值除观察者状态外，还提供：`fetch`、`refetch`、`prefetch`、`invalidate`、`cancel`、`query`、`observer`。

### `useSuspenseQuery<TData, TError, TSelected>(options, suspenseOptions?)`

Suspense 版本的查询 Hook。错误态抛错；pending 时抛出 Promise（或可选 `use` 兼容模式）。返回值保证 `data` 为已解析类型。

### `useMutation<TData, TVariables, TError, TContext>(options)`

写操作 Hook。支持 `mutationFn`、重试、`onMutate`、`onSuccess`、`onError`、`onSettled`。返回状态与派生 flags，并暴露 `mutate` / `mutateAsync` / `reset` / `cancel`。

### `useInfiniteQuery<TData, TError, TPageParam, TSelected>(options)`

无限列表查询。定义模式下需提供：`initialPageParam`、`getNextPageParam`、`getPreviousPageParam`（可选）、`queryFn`。返回：`fetchNextPage`、`fetchPreviousPage`、`refetch`（全页）、`prefetch`、`invalidate`、`cancel`。

### `useSuspenseInfiniteQuery<TData, ...>(options, suspenseOptions?)`

Suspense 版本无限查询，`data` 保证存在，配合 React Suspense 边界使用。

### 导出类型

- `UseQueryOptions` / `UseQueryResult` / `UseSuspenseQueryResult`
- `UseMutationResult`
- `UseInfiniteQueryOptions` / `UseInfiniteQueryResult` / `UseSuspenseInfiniteQueryResult`

这些类型可直接用于二次封装自定义 Hook。

## 高级用法

### 1) 以 Query Handle 作为跨组件共享边界

```tsx
import { createQueryClient } from '@iostore/store/query';
import { useQuery } from '@iostore/react';

const client = createQueryClient();
const userQuery = client.defineQuery<{ id: number; name: string }, Error>({
  key: ['user', 1],
  queryFn: async () => ({ id: 1, name: 'Ada' }),
});

export function UserCard() {
  const q = useQuery({ query: userQuery, client, select: (u) => u.name });
  return <div>{q.data}</div>;
}
```

### 2) 组件卸载时取消请求

```tsx
const q = useQuery({
  key: ['search', keyword],
  queryFn: ({ signal }) => fetch(`/api?q=${keyword}`, { signal }).then((r) => r.json()),
  cancelOnUnmount: true,
});
```

### 3) 对接 io 局部状态

`useIO` 与 `useQuery` 可以混用：`useIO` 管本地交互态，`useQuery` 管远程一致性态。

## 迁移指南（TanStack Query -> @iostore/react）

| TanStack Query | @iostore/react 对应 |
|---|---|
| `useQuery` | `useQuery` |
| `useSuspenseQuery` | `useSuspenseQuery` |
| `useMutation` | `useMutation` |
| `useInfiniteQuery` | `useInfiniteQuery` |
| `useSuspenseInfiniteQuery` | `useSuspenseInfiniteQuery` |
| `queryClient.prefetchQuery` | `result.prefetch()` 或 `query.prefetch()` |
| `invalidateQueries` | `result.invalidate()` / `query.invalidate()` |
| `cancelQueries` | `result.cancel()` / `query.cancel()` |

主要差异：io 允许你直接拿到 `query/observer` 句柄，适合底层封装；同时可与 io 的响应式单元无缝共用。

## 框架差异说明

- React/Lynx 适配层是 Hook + 外部存储订阅模型。
- Vue/Solid 返回的是 `Ref/Accessor` 风格结果。
- Svelte 返回标准 store。
- 语义一致：`fetch/refetch/prefetch/invalidate/cancel` 在各框架命名尽量对齐。

## API 覆盖度清单

| 导出 API | 已覆盖 |
|---|---|
| `useIO` | ✅ |
| `useIOSelector` | ✅ |
| `useQuery` | ✅ |
| `useSuspenseQuery` | ✅ |
| `useMutation` | ✅ |
| `useInfiniteQuery` | ✅ |
| `useSuspenseInfiniteQuery` | ✅ |
| `UseQueryOptions` | ✅ |
| `UseQueryResult` | ✅ |
| `UseSuspenseQueryResult` | ✅ |
| `UseMutationResult` | ✅ |
| `UseInfiniteQueryOptions` | ✅ |
| `UseInfiniteQueryResult` | ✅ |
| `UseSuspenseInfiniteQueryResult` | ✅ |
