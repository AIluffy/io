# @iostore/lynx

`@iostore/lynx` 是 io 在 Lynx 生态中的官方适配层。它提供与 React 版本高度一致的 Hook 体验（`useIO`、`useQuery`、`useMutation`、`useInfiniteQuery`），并针对移动端/小程序式运行环境保留可取消请求、重试、分页抓取、缓存失效等核心能力。对于已经使用 TanStack Query 的团队，迁移成本非常低。

## 安装

```bash
npm i @iostore/store @iostore/lynx @lynx-js/react
```

> peerDependencies：`@lynx-js/react >=0.0.0`。

## Quick Start（< 30 行）

```tsx
import { useQuery } from '@iostore/lynx';

type Profile = { id: string; nickname: string };

export function ProfileName(props: { id: string }) {
  const q = useQuery<Profile>({
    key: ['profile', props.id],
    queryFn: async ({ signal }) => {
      'background only';
      return fetch(`/api/profile/${props.id}`, { signal }).then(
        (r) => r.json() as Promise<Profile>,
      );
    },
  });

  return <text>{q.data?.nickname ?? 'Loading...'}</text>;
}
```

## API 参考

### `useIO<T>(source, options?) => T`

订阅 io source 的快照并驱动组件更新。`options.schedule` 可配置更新调度策略。

### `useIOSelector<TSource, TSelected>(source, selector, options?) => TSelected`

选择器订阅，支持 `isEqual` 比较，适合大对象拆分读取。

### `useQuery<TData, TError, TSelected>(options) => IoLynxQueryResult`

支持：

- Definition：`key + queryFn`
- Handle：`query`

并兼容 `enabled`、`placeholderData`、`select`、`refetchOn*`、生命周期回调、`cancelOnUnmount`。返回值包含查询状态、`fetch/refetch/prefetch/invalidate/cancel`、`query`、`observer`。

### `useSuspenseQuery<TData, ...>(options) => IoLynxSuspenseQueryResult`

Suspense 语义：error 直接抛错，pending 抛 promise；返回 `data` 保证存在。

### `useMutation<TData, TVariables, TError, TContext>(options) => IoLynxMutationResult`

Mutation Hook，返回 `mutate/mutateAsync/reset/cancel` 和派生 flags，适合提交表单、点赞、批量写入等场景。

### `useInfiniteQuery<TData, TError, TPageParam, TSelected>(options)`

无限查询 Hook，支持游标或页码模型。返回 `fetchNextPage` / `fetchPreviousPage` / `refetch` 等控制函数。

### `useSuspenseInfiniteQuery<TData, ...>(options)`

Suspense 版本无限查询，返回 `data` 非空。

### 导出类型

- `IoLynxQueryResult`
- `IoLynxSuspenseQueryResult`
- `IoLynxMutationResult`
- `IoLynxInfiniteQueryResult`
- `IoLynxSuspenseInfiniteQueryResult`

## 高级用法

### 1) 页面离开自动取消

```tsx
const q = useQuery({
  key: ['feed', tab],
  queryFn: ({ signal }) => fetch(`/api/feed?tab=${tab}`, { signal }).then((r) => r.json()),
  cancelOnUnmount: true,
});
```

### 2) 无限滚动（游标分页）

```tsx
const feed = useInfiniteQuery<{ items: string[]; next: string | null }, Error, string | null>({
  key: ['feed'],
  initialPageParam: null,
  queryFn: async ({ pageParam, signal }) =>
    fetch(`/api/feed?cursor=${pageParam ?? ''}`, { signal }).then((r) => r.json()),
  getNextPageParam: (lastPage) => lastPage.next,
});
```

### 3) select 做投影，减少渲染负担

对大型 payload 建议在 query 层 `select` 成轻量结构，组件只渲染必要字段。

## 迁移指南（TanStack Query -> @iostore/lynx）

| TanStack Query | @iostore/lynx 对应 |
|---|---|
| `useQuery` | `useQuery` |
| `useSuspenseQuery` | `useSuspenseQuery` |
| `useMutation` | `useMutation` |
| `useInfiniteQuery` | `useInfiniteQuery` |
| `useSuspenseInfiniteQuery` | `useSuspenseInfiniteQuery` |
| `invalidateQueries` | `result.invalidate()` / `query.invalidate()` |
| `cancelQueries` | `result.cancel()` / `query.cancel()` |

迁移建议：先平移查询层 API，再逐步把本地状态整合到 `useIO`，降低双状态源复杂度。

## 框架差异说明

- Lynx 版本 API 形态几乎与 React 版一致，便于跨端共享业务 Hook。
- 相比 Vue/Solid/Svelte，不返回 Ref/Store，而是直接返回状态对象。
- 在 Lynx 环境中，建议 queryFn 始终尊重 `AbortSignal`，确保页面切换时请求可安全中断。

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
| `IoLynxQueryResult` | ✅ |
| `IoLynxSuspenseQueryResult` | ✅ |
| `IoLynxMutationResult` | ✅ |
| `IoLynxInfiniteQueryResult` | ✅ |
| `IoLynxSuspenseInfiniteQueryResult` | ✅ |
