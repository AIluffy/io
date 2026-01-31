## 现状诊断
- `oin()` 对对象是浅层 Scope（仅第一层 key -
- 深层属性级 Unit 的正确运行时模型是 `oinTree()`；因此要实现你示例里的 `scope.user.name(123)` 这种 DX，需要提供一个“深层创建”的入口。

## 2.2 TypeScript DX 增强
### 2.2.1 新增 `oinDeep()`（深层创建，语义=oinTree）
- 新增导出：`export function oinDeep<T>(initial: T): OinTreeNode<T>`，内部直接调用/复用 `oinTree()`。
- 示例统一改为：
  - `const scope = oinDeep({ user: { name: '', age: 0 } })`
  - 此时 `scope.user.name(123)` 在 TS 层会是编译错误（因为 `name` 是 `OinUnit<string>`）。
- 兼容策略：`oin()` 保持浅层不变（避免破坏已有用户对 shallow Scope 的预期）；文档明确“深层用 oinDeep”。

### 2.2.2 类型安全的派生：`derive(node, selector)`（无括号读取）
- 新增 `derive(node, selector)`：
  - `selector` 的入参 `s` 为“解包后的值视图”，允许写 `s.user.name`（而不是 `s.user.name()`）。
  - 类型：在 `types.ts` 增加 `UnwrapOin<T>`（递归把 T 解包为纯值结构），函数签名：
    - `derive<T, R>(node: OinNode<T> | OinTreeNode<T>, selector: (s: UnwrapOin<T>) => R): OinDerived<R>`
- 运行时：
  - 通过 Proxy 把属性访问映射到实际 node 的 `unit()` 读取（触发 Signals 自动依赖追踪），数组支持 `[i]`。
  - 内部使用 `Signal.Computed`/`computed()` 计算 + `effect()` 驱动订阅，产出与 `formula()` 一致的 `OinDerived` 形态（`() + snapshot + subscribe`）。

### 2.2.3 导出与文档
- `packages/oin/src/index.ts` 增加 `oinDeep`、`derive` 导出。
- README 增加迁移/对比：`oin()`（浅层） vs `oinDeep()`（深层）。

## 2.3 错误处理与调试
### 2.3.1 `onMutation(node, handler)`
- 新增 `onMutation(root, (patch, path) => ...)`：基于 `root.subscribeUpdate()` 把每个 `OinUpdate` 拆成单个 patch 回调，方便打印。
- 兼容旧语义：不改现有 subscribeUpdate 行为。
- 对 `applyUpdate/replay`：为了保持“回放不产生二次 update”的既有语义，新增可选调试 API：
  - `applyUpdate(target, update, { emitUpdate?: boolean })` 默认 `false`，调试时可设 `true` 让 onMutation 也能看到回放。

### 2.3.2 `onError(root, handler)`
- 新增 `onError(root, (error, path, operation) => ...)`：
  - 在关键 mutation 点（`set/commit/splice/sort/applySet/setIndex/applyUpdate`）包 try/catch。
  - 捕获后根据节点类型组装 path：
    - `oinDeep/oinTree` 用 state.path + 相对段；
    - 浅层 `oin` 用 `[key]`/`[index]`/`[]`。
  - 调用 handler 后继续抛错（不吞异常）。

## 测试与验证
- 新增/更新 vitest：
  - `oinDeep()` 深层节点运行时正确；
  - `derive()` 依赖追踪正确（改 age 不触发，改 name 触发）；
  - `onMutation()` 单 patch 回调与 path 正确；
  - `onError()` 在非法 key/index/applyUpdate path 时能收到事件。

## 变更落点（文件）
- 新增：`packages/oin/src/lib/derive.ts`、`packages/oin/src/lib/debug.ts`。
- 修改：`packages/oin/src/lib/types.ts`、`packages/oin/src/index.ts`、以及 `unit.ts/scope.ts/array-unit.ts/oin-tree.ts/updates.ts` 以接入 onError 与可选回放事件。