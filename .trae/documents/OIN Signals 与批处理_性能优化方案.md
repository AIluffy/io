## 现状与差距
- 当前 `@org/oin` 的细粒度能力主要来自 `oinTree`：它会把深层对象/数组拆成递归节点，叶子是 `OinUnit`，因此天然支持 `tree.user.name('x')` 这种“属性级更新”。但派生值仍依赖显式 `formula(deps)`，且写入是同步逐次通知。
- 目前不存在“自动依赖追踪 + Computed/effect 调度 + batch 合并”的信号内核；`snapshot()`/`cloneValue()` 与 `oinTree` 的 `pathToNode: Map<string,...>` 也存在明显性能/内存热点。

## 1.1 细粒度响应式（Signals）
- 目标 API：新增 TC39 Signals 风格最小子集：`Signal.State`、`Signal.Computed`、`effect`、`untrack`（命名按你给的 `Signal.State/Signal.Computed`）。
- 打通方式（关键点）：让现有 `OinUnit` 的“读”(即 `unit()` 调用)在存在活跃计算上下文时自动登记依赖，从而做到：
  - `computed(() => tree.user.name())` 自动追踪 `name`；
  - `effect(() => tree.user.name())` 只在 `name` 变化时触发；
  - 取代显式 `formula(deps)` 的主要场景（`formula` 保留兼容）。
- 实现要点（新增一个内部 signals-core 模块）：
  - 全局 `activeContext` 栈：进入 Computed/effect 执行时压栈，退出时做依赖 diff（新增订阅/取消订阅）。
  - `Signal.State<T>`：可独立使用；同时提供 `fromUnit(unit)` 之类内部桥接，使 `OinUnit` 也能被 tracking。
  - `Signal.Computed<T>`：惰性 + 缓存；依赖变更只标记 dirty；当被读取或被 effect 订阅时再计算。
  - `effect(fn)`：自动追踪 + cleanup（fn 返回清理函数）；依赖变更时进入调度队列（与 batch 统一）。
- 代码落点（主要修改/新增）：
  - 新增 `packages/oin/src/lib/signals.ts`（或 `signals-core.ts` + `signals.ts`），导出 `Signal`/`effect`/`untrack`。
  - 修改 [unit.ts](file:///Users/zhangxueai/Projects/idea/oin/packages/oin/src/lib/unit.ts) 的 getter 路径：在返回值前调用 `trackRead(...)`。
  - 现有 [formula.ts](file:///Users/zhangxueai/Projects/idea/oin/packages/oin/src/lib/formula.ts) 保留，同时新增 `computed(fn)` 作为自动追踪版本（可选：用 `Signal.Computed` 实现）。

## 1.2 批量更新优化（batch）
- 目标 API：`import { batch } from '@org/oin'`，在 batch 内多次 set 只产生一次“通知波次”。
- 统一调度器（新增内部 scheduler 模块）：
  - 维护 `batchDepth`、待通知队列（value/update 监听与 effect 队列分开或统一抽象）。
  - `batch(fn)`：`batchDepth++` 执行 fn，finally `batchDepth--`；最外层退出时 flush。
  - 去重规则：同一 listener/effect 在一次 flush 周期只执行一次；更新顺序优先 flush “标记/入队”后再跑 effect（避免抖动）。
- 改造点（把“同步 emit”变成“可入队 emit”）：
  - [unit.ts](file:///Users/zhangxueai/Projects/idea/oin/packages/oin/src/lib/unit.ts#L45-L70) 的 `emitValue/emitUpdate` 路径改为调用 scheduler。
  - scope/array/tree 的 `emitScopeValue/emitArrayValue` 与 update 冒泡也走 scheduler（保证 batch 能覆盖结构节点）。
  - 保持 `commit()` 的现有“单次聚合更新”语义不变，但它内部触发的子节点 `emitValue` 也应受 batch 控制。

## 1.3 内存与性能优化
- Snapshot 缓存（高收益、低风险）：
  - 为 `OinUnit.snapshot()` 与 `readValue()` 引入“按 revision 缓存”：同一 revision 重复 snapshot 不再 `structuredClone + deepFreeze`。
  - scope/array/tree 的 `emit*Value()` 也引入按 revision 缓存，避免频繁重建整对象/整数组快照。
- 降低 cloneValue 热点：
  - 对 patch 的 `prev/next`：在叶子值为原始类型时不 clone；对对象类型按策略（默认维持现有安全语义，另提供 opt-in 轻量模式/延迟克隆）。
  - 优先通过 `oinTree` 的细粒度拆分减少“大对象作为 unit 值”的场景，从根本上降低 clone 规模。
- `oinTree` 路径 Map 内存：
  - 将 `pathToNode: Map<string,...>` 从 `JSON.stringify(path)` key 改为更轻的结构（路径 trie / 逐段 map），或改为“按 path 从根遍历 children”替代全局 map（O(depth)，但显著降内存）。
- 订阅者通知结构：
  - 先不强推链表；优先通过 batch 去重/队列化减少遍历频率。若仍是热点，再把 `Set`/遍历优化为更稳定的链表结构。

## 兼容性与迁移策略
- 保持现有 `oin / oinTree / formula / subscribe / subscribeUpdate / applyUpdate` API 行为兼容；Signals 与 batch 为新增导出。
- 推荐用法迁移：
  - 深层对象想要 `scope.user.name('x')` 这种体验：直接用 `oinTree`（它的类型已经是递归节点）。
  - 想要自动依赖追踪：用 `computed(() => ...)`/`effect(() => ...)` 读取 `OinUnit`（含 tree 叶子）。

## 测试与验证（实现后会做）
- 单测：
  - `batch`：多次 `unit(x)` 只触发一次订阅回调；嵌套 batch 正确。
  - `computed/effect`：自动追踪、依赖增删、cleanup、去重调度。
  - `oinTree`：订阅 `user.name` 只在 name 变更触发；root subscribe 仍在任意变更触发。
  - snapshot 缓存：同 revision 多次 snapshot 不重复 clone。
- 轻量基准：对比 batch 前后 N 次 set 的回调次数与耗时；对比 snapshot 缓存命中率。

## 交付物（代码层面）
- 新增导出：`Signal`/`effect`/`untrack`/`batch`/（可选）`computed`。
- 修改现有节点的读/写/通知路径以接入 tracking 与 scheduler（优先从 `OinUnit` 打通，再扩展到 scope/array/tree）。