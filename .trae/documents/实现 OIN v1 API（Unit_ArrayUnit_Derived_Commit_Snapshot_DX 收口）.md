## 现状结论
- 当前仓库是 Nx + TypeScript 的多包工作区（`packages/*`），但**不存在任何 `oin / formula / unit / derived / commit / snapshot` 的实现或导出**，因此需要新增包来落地你的 OIN 规范。
- 仓库里也没有 React/Vue/Svelte 相关依赖，因此框架适配必须通过**独立适配包 + peerDependencies**的方式引入，避免把框架强绑进核心库。

## 包划分（核心 + 适配）
- 新增核心包：`packages/oin`（建议包名 `@org/oin`）
  - 提供：`oin`、`formula`、`snapshot`、`subscribe`、`commit`、数组响应式、以及“更新可追踪/合并/回放”的数据模型与工具函数。
- 新增适配包（可选安装）：
  - `packages/oin-react`（`@org/oin-react`，peer: `react`）
  - `packages/oin-vue`（`@org/oin-vue`，peer: `vue`）
  - `packages/oin-svelte`（`@org/oin-svelte`，peer: `svelte`）

## 对外 API（在你 v1 基础上扩展）
### 1) 核心状态 API（保持你定义的 DX）
- Unit：
  - `u()` / `u(next)` / `u(fn)`
  - `u.snapshot()` / `u.subscribe(fn)` / `u.reset()`
- ArrayUnit：
  - `arr()`（返回数组 snapshot）
  - `arr[i]()` / `arr[i](next)`
  - `arr.push/pop/splice/sort` + `arr.snapshot()` / `arr.subscribe(fn)`
  - `arr.commit(fn)`（你已要求）
- Scope（对象 store）：
  - `scope.key()` / `scope.key(next)`
  - `scope.commit(fn)`（你已要求）
  - `scope.snapshot()`
  - `scope.subscribe(fn)`（对象内任意字段变化触发一次，回调给 scope snapshot）

### 2) 更新追踪（可追踪 / 可合并 / 可回放）
- 新增统一的“更新”抽象（Update/Patch），并做到：
  - **可追踪**：每次写入（含 commit、数组操作、元素写入）都会生成 `OinUpdate`，带 `revision`、`patches`，可被订阅。
  - **可合并**：提供 `mergeUpdates(updates)`，把一串 update 合并为一个（可做 patch 压缩：同一路径连续 set 只保留首 prev + 末 next）。
  - **可回放**：提供 `applyUpdate(target, update)` / `replay(target, updates)`，将 patch 应用到另一个同结构 store；并提供 `invertUpdate(update)` 支持 time-travel（undo/redo）。

- Patch 形态（不引入外部库，保持可序列化）：
  - `set`：`{ op: 'set', path: (string|number)[], prev, next }`
  - `splice`：`{ op: 'splice', path: (string|number)[], start, deleteCount, deleted: T[], items: T[] }`
  - `sort`：`{ op: 'sort', path: (string|number)[], order: number[] }`（记录排序后的索引映射，保证可回放）

- 暴露更新订阅（显式能力，保持 DX 收口）：
  - 为 Unit / ArrayUnit / Scope 提供 `subscribeUpdate(fn)`（与 `subscribe(value)` 分开，避免破坏你原有类型签名）
  - `subscribeUpdate` 回调签名：`(update: OinUpdate) => void`，返回取消函数

## 核心实现设计要点
- **不暴露内部结构**：对外对象上不出现 `.units/.nodes`；数组索引通过 `Proxy` 提供；内部状态用 `Symbol` 私有挂载。
- **ArrayUnit 的“全链路”**：
  - 数组结构变化和元素变化都产生 update，并通知数组订阅与派生。
  - ArrayUnit 内部会订阅每个元素 Unit 的变化并“冒泡”成数组变化事件，保证 `formula([arr], a => a.reduce((p,n)=>p+n(),0))` 仅依赖 `[arr]` 也能更新。
- **Commit 的一致性**：
  - 提供批处理上下文：commit 内读到的是 commit 开始时的值；commit 结束一次性生成 update 并触发订阅/派生（避免重复 recompute）。
- **Snapshot 只读**：
  - `snapshot()` 走 `structuredClone` + deepFreeze，供 DevTools/Agent 安全读取与回放基线。

## 框架适配（React / Vue / Svelte）
### React（`@org/oin-react`）
- 提供：
  - `useOin(source)`：返回 `source.snapshot()`（或对 Unit/Derived 返回其值），并在 `source.subscribe(...)` 触发时 re-render。
  - 具体实现优先用 `useSyncExternalStore`（React 18+）；必要时降级到 `useState + useEffect`。

### Vue（`@org/oin-vue`，Vue 3）
- 提供：
  - `useOin(source)`：返回 `shallowRef(snapshot)`，通过 `source.subscribe` 更新 `.value`。
  - `oinRef(unit)`：返回可读写 `Ref<T>`（set 时写回 unit）。

### Svelte（`@org/oin-svelte`）
- 提供：
  - `toReadable(source)`：返回 `{ subscribe }` 的 readable store。
  - `toWritable(unit)`：返回 `{ subscribe, set, update }` 的 writable store（映射到 Unit 调用写入）。

## 文件结构（拟）
### 核心包 `packages/oin`
- `src/index.ts`
- `src/lib/types.ts`
- `src/lib/oin.ts`
- `src/lib/unit.ts`
- `src/lib/array-unit.ts`
- `src/lib/scope.ts`
- `src/lib/formula.ts`
- `src/lib/batch.ts`
- `src/lib/snapshot.ts`
- `src/lib/updates.ts`（Update/Patch、merge/apply/invert/replay）

### 适配包
- `packages/oin-react/src/index.ts`（hooks）
- `packages/oin-vue/src/index.ts`（composition utilities）
- `packages/oin-svelte/src/index.ts`（stores）

## 测试（Vitest）
- 核心：
  - Unit：get/set/functional set/reset/subscribe/snapshot 只读
  - ArrayUnit：索引访问、元素 set 冒泡、push/pop/splice/sort/commit、snapshot、subscribe
  - Derived：依赖 unit/array 的 recompute、只读约束
  - Updates：每类操作产生可序列化 patch；`applyUpdate/replay` 结果一致；`invertUpdate` 可 undo
- 适配层：
  - 以“最小运行”策略验证导出与类型（不强行引入框架跑 e2e；用类型测试/轻量单测验证 contract）。

## 实现后验证方式（落地阶段再执行）
- 用 Nx 分别跑新包的 `build/test/typecheck`，确保：
  - 类型与 DX 约束一致
  - patch 可序列化、可合并、可回放
  - 核心单测通过