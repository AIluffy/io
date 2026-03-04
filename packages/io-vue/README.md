# @iostore/vue

`@iostore/vue` 提供 io 在 Vue 3 Composition API 语境下的完整适配：本地响应式桥接（`useIO` / `useIOSelector` / `ioRef`）与远程数据能力（`useQuery` / `useMutation` / `useInfiniteQuery` 及其 Suspense 变体）。如果你熟悉 TanStack Query 的“声明式查询 + 缓存失效”模型，这里会非常接近，但 API 返回形态更贴近 Vue：核心状态放在 `ShallowRef` 中。

## 安装

```bash
npm i @iostore/store @iostore/vue vue
```

> peerDependencies：`vue >=3`。

## Quick Start（< 30 行）

```ts
import { computed } from 'vue';
import { useQuery } from '@iostore/vue';

type Todo = { id: number; title: string };

export function useTodo(id: number) {
  const q = useQuery<Todo>({
    key: ['todo', id],
    queryFn: async ({ signal }) =>
      fetch(`/api/todos/${id}`, { signal }).then((r) => r.json() as Promise<Todo>),
  });

  const title = computed(() => q.data.value?.title ?? 'Loading...');
  return { q, title };
}
```

## API 参考

### 状态桥接

#### `useIO<T>(source, options?) => ShallowRef<T>`

将 io 可订阅 source 映射为 Vue `ShallowRef`。`schedule` 控制写入时机（默认 `microtask`）。

#### `useIOSelector<TSource, TSelected>(source, selector, options?) => ShallowRef<TSelected>`

只订阅 source 的派生切片，支持 `isEqual` 进行精细比较。

#### `ioRef<T>(unit, options?) => Ref<T>`

把 io `unit` 双向映射为 Vue `Ref`：读取走 `track`，写入调用 `unit.set`。

### 查询

#### `useQuery<TData, TError, TSelected>(options) => IoVueQueryResult`

支持 definition 模式（`key/queryFn`）与 handle 模式（`query`）。返回：

- `state: ShallowRef<IoQueryObserverResult<...>>`
- `data: ShallowRef<TSelected | undefined>`
- `fetch/refetch/prefetch/invalidate/cancel`
- `query` 与 `observer`

额外支持：`cancelOnDispose`，在作用域销毁时取消正在进行中的请求。

#### `useSuspenseQuery<TData, ...>(options) => IoVueSuspenseQueryResult`

Suspense 版本，内部保证 `enabled: true`；pending 抛 Promise，error 抛异常；返回 `data: ShallowRef<TSelected>`。

### 变更

#### `useMutation<TData, TVariables, TError, TContext>(options) => IoVueMutationResult`

返回：

- `state: ShallowRef<IoMutationState<...>>`
- `flags: ShallowRef<IoMutationDerivedFlags>`
- `mutate/mutateAsync/reset/cancel`
- `mutation` 句柄

### 无限查询

#### `useInfiniteQuery<TData, TError, TPageParam, TSelected>(options)`

支持 `initialPageParam`、`getNextPageParam`、`getPreviousPageParam`、`maxPages`。返回 `state/data` 两个 Ref 与 `fetchNextPage/fetchPreviousPage/refetch/prefetch/invalidate/cancel`。

#### `useSuspenseInfiniteQuery<TData, ...>(options)`

Suspense 版本，`data` 为非空 `ShallowRef<TSelected>`。

### 导出类型

- `IoVueQueryResult`
- `IoVueSuspenseQueryResult`
- `IoVueMutationResult`
- `IoVueInfiniteQueryResult`
- `IoVueSuspenseInfiniteQueryResult`

## 高级模式

### 1) `select` + `useIOSelector` 组合

对于大型响应对象，建议优先在 query 层使用 `select` 做一次结构裁剪，再在组件内按需组合 computed，减少不必要 watch 触发。

### 2) 可取消页面切换请求

```ts
const q = useQuery({
  key: ['users', page],
  queryFn: ({ signal }) => fetch(`/api/users?page=${page}`, { signal }).then((r) => r.json()),
  cancelOnDispose: true,
});
```

### 3) 查询句柄复用

你可以在模块作用域定义 query handle，再在多个组合式函数中通过 `useQuery({ query })` 复用缓存和状态。

## 迁移指南（TanStack Query -> @iostore/vue）

| TanStack Query | @iostore/vue 对应 |
|---|---|
| `useQuery` | `useQuery` |
| `useMutation` | `useMutation` |
| `useInfiniteQuery` | `useInfiniteQuery` |
| `useSuspenseQuery` | `useSuspenseQuery` |
| `useSuspenseInfiniteQuery` | `useSuspenseInfiniteQuery` |
| `queryClient.invalidateQueries` | `result.invalidate()` / `query.invalidate()` |
| `queryClient.cancelQueries` | `result.cancel()` / `query.cancel()` |

差异点：Vue 版本以 `ShallowRef` 为核心返回形态，调用端建议通过 `.value` 与 `computed` 消费。

## 框架差异说明

- Vue/Solid 都强调响应式值容器，但 Vue 用 `Ref`，Solid 用 `Accessor`。
- React/Lynx 直接返回普通对象结果并依靠渲染触发。
- Svelte 返回 Store，语义一致但消费方式是 `$store`。

## API 覆盖度清单

| 导出 API | 已覆盖 |
|---|---|
| `ioRef` | ✅ |
| `useIO` | ✅ |
| `useIOSelector` | ✅ |
| `useQuery` | ✅ |
| `useSuspenseQuery` | ✅ |
| `useMutation` | ✅ |
| `useInfiniteQuery` | ✅ |
| `useSuspenseInfiniteQuery` | ✅ |
| `IoVueQueryResult` | ✅ |
| `IoVueSuspenseQueryResult` | ✅ |
| `IoVueMutationResult` | ✅ |
| `IoVueInfiniteQueryResult` | ✅ |
| `IoVueSuspenseInfiniteQueryResult` | ✅ |
