# @iostore/solid

`@iostore/solid` 是 io 在 SolidJS 的适配层，目标是把 io 的响应式状态图与 query 运行时无缝带入 Solid 的信号模型。它提供 `useIO` / `useIOSelector` 管理本地可订阅源，也提供 `useQuery` / `useMutation` / `useInfiniteQuery` 管理远程数据生命周期。整体语义接近 TanStack Query，但返回值更符合 Solid 的访问器范式。

## 安装

```bash
npm i @iostore/store @iostore/solid solid-js
```

> peerDependencies：`solid-js >=1.9`。

## Quick Start（< 30 行）

```tsx
import { Show } from 'solid-js';
import { useQuery } from '@iostore/solid';

type Product = { id: number; title: string };

export function ProductTitle(props: { id: number }) {
  const q = useQuery<Product>({
    key: ['product', props.id],
    queryFn: async ({ signal }) =>
      fetch(`/api/products/${props.id}`, { signal }).then(
        (r) => r.json() as Promise<Product>,
      ),
  });

  return <Show when={q.data()} fallback={<span>Loading...</span>}>{(p) => <span>{p().title}</span>}</Show>;
}
```

## API 参考

### `useIO<T>(source, options?) => Accessor<T>`

将 io source 转为 Solid `Accessor`。source 必须可 `snapshot + subscribe`。

### `useIOSelector<TSource, TSelected>(source, selector, options?) => Accessor<TSelected>`

选择器桥接，支持 `isEqual`。

### `useQuery<TData, TError, TSelected>(options) => IoSolidQueryResult`

返回结构：

- `state: Accessor<IoQueryObserverResult<...>>`
- `data: Accessor<TSelected | undefined>`
- `fetch/refetch/prefetch/invalidate/cancel`
- `query` / `observer`

可选项覆盖 query observer 常见参数（`enabled`、`select`、`placeholderData`、`refetchOn*` 等）并支持 `cancelOnDispose`。

### `useSuspenseQuery<TData, ...>(options) => IoSolidSuspenseQueryResult`

Suspense 版本，返回 `data: Accessor<TSelected>`。

### `useMutation<TData, TVariables, TError, TContext>(options) => IoSolidMutationResult`

返回：`state`、`flags`、`mutate`、`mutateAsync`、`reset`、`cancel`、`mutation`。

### `useInfiniteQuery<TData, TError, TPageParam, TSelected>(options)`

无限查询 Hook，返回分页控制函数与 `state/data` accessors。适合列表滚动、时间线、聊天记录。

### `useSuspenseInfiniteQuery<TData, ...>(options)`

Suspense 版本无限查询，`data` 保证可读取。

### 导出类型

- `IoSolidQueryResult`
- `IoSolidSuspenseQueryResult`
- `IoSolidMutationResult`
- `IoSolidInfiniteQueryResult`
- `IoSolidSuspenseInfiniteQueryResult`

## 高级用法

### 1) 组合 Suspense 与 ErrorBoundary

推荐将 `useSuspenseQuery` 放在 Solid `Suspense` 与 `ErrorBoundary` 组合中，让 pending/error 逻辑由边界托管。

### 2) 分页并发保护

对于连续触发 `fetchNextPage` 的场景，可先读 `state().fetchStatus` 判断是否正在请求，避免重复请求。

### 3) 取消策略

当路由切换非常频繁时，建议启用 `cancelOnDispose`，避免过期响应回写。

```tsx
const q = useQuery({
  key: ['search', keyword],
  queryFn: ({ signal }) => fetch(`/api/search?q=${keyword}`, { signal }).then((r) => r.json()),
  cancelOnDispose: true,
});
```

## 迁移指南（TanStack Query -> @iostore/solid）

| TanStack Query | @iostore/solid 对应 |
|---|---|
| `useQuery` | `useQuery` |
| `useSuspenseQuery` | `useSuspenseQuery` |
| `useMutation` | `useMutation` |
| `useInfiniteQuery` | `useInfiniteQuery` |
| `useSuspenseInfiniteQuery` | `useSuspenseInfiniteQuery` |
| `prefetchQuery` | `result.prefetch()` |
| `invalidateQueries` | `result.invalidate()` / `query.invalidate()` |
| `cancelQueries` | `result.cancel()` / `query.cancel()` |

关键差异：Solid 返回 `Accessor`，读取时要调用函数（如 `q.data()`、`q.state()`）。

## 框架差异说明

- Solid 与 Vue 都返回响应式容器，但 Solid 使用函数读取，Vue 使用 `.value`。
- React/Lynx 返回扁平对象状态，Svelte 则返回 store。
- 语义一致：统一支持 fetch/refetch/prefetch/invalidate/cancel。

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
| `IoSolidQueryResult` | ✅ |
| `IoSolidSuspenseQueryResult` | ✅ |
| `IoSolidMutationResult` | ✅ |
| `IoSolidInfiniteQueryResult` | ✅ |
| `IoSolidSuspenseInfiniteQueryResult` | ✅ |
