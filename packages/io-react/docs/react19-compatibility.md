# @iostore/react React 19 兼容性评估

## 影响矩阵

| React 19 特性 | io-react 模块 | 影响 | 处理策略 |
| --- | --- | --- | --- |
| `use()` hook | `useSuspenseQuery` / `useSuspenseInfiniteQuery` | 现有实现基于 throw Promise；React 19 可选择 `use()` 更直接接入 Suspense。 | 新增 `suspense-compat`，通过 `suspendWithReactUse` 提供可选 `useReactUseHook` 路径；默认保持旧行为。 |
| Server Components (RSC) | `use-*.ts` hooks | hooks 必须在 Client Component 使用；直接在 RSC 中 import hooks 不安全。 | 所有 hook 文件与根入口增加 `'use client'`，并新增 `./rsc` 子入口导出纯函数 helper。 |
| Server Actions | `use-query` / `use-infinite-query` | Server Action 通常与 RSC-side 数据预取结合，需要非 hook API。 | 提供 `resolveQueryHandle` / `ensureQueryData` / `resolveInfiniteQueryHandle` / `ensureInfiniteQueryData` 供服务端/Action 调用。 |
| 新 Suspense 行为（更严格重放） | Suspense hooks | 需要避免兼容层引入额外副作用。 | 默认仍走原 throw Promise 流程；`use()` 模式仅在显式开启并检测到 React.use 时启用。 |

## 兼容层结论

- Client Hooks：通过 `'use client'` 强制运行边界，保证 Next.js App Router / RSC 下语义正确。
- RSC-safe API：通过 `@iostore/react/rsc` 提供不依赖 React hooks 的纯函数，支持服务端预取与 handle 解析。
- `use()` 集成：作为可选能力，默认关闭，React 18/19 均可运行。

## 已知限制

- `useReactUseHook` 开启时依赖运行时 React 提供 `use`；在 React 18 下会自动回退 throw Promise。
- `@iostore/react` 根入口为 client-only；RSC 需使用 `@iostore/react/rsc`。
