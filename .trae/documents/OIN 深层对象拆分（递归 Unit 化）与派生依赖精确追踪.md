## 目标与约束
- 让 `oin({...})` 在“定义阶段”递归拆分嵌套对象为叶子 `Unit<T>`，并保持 DX：`user.profile.age()` / `user.profile.age(v => v+1)`。
- 默认不可变；仅在 `commit` 回调内允许临时可变 draft；commit 结束后生成新的冻结快照。
- `formula([user.profile.age], a => a * 2)` 仅在该 Unit 变化时重算，并支持订阅的“按需建立/释放”避免泄漏。
- 提供完整 TS 推导：嵌套路径访问与 Unit 类型一一对应，`formula` 参数类型编译期校验。
- 单测覆盖：拆分、读写、commit 不可变、派生缓存、依赖订阅/释放、O(1) Unit 级通知。

## 现状评估（基于当前实现）
- 目前 `oin()` 只对第一层对象做 `Scope`，嵌套对象会被当作叶子值存进 `Unit<obj>`（见 [oin.ts](file:///Users/zhangxueai/Projects/idea/oin/packages/oin/src/lib/oin.ts)、[scope.ts](file:///Users/zhangxueai/Projects/idea/oin/packages/oin/src/lib/scope.ts)）。
- `oinTree` 已具备“递归建树 + 深路径 update 泡泡”能力（见 [oin-tree.ts](file:///Users/zhangxueai/Projects/idea/oin/packages/oin/src/lib/oin-tree.ts)），但与 `OinArrayUnit/OinScope` 类型/实现体系尚未统一（数组 index 类型、applyUpdate 内部接口等）。
- `formula` 当前是“创建即订阅 deps”，没有按需释放机制（见 [formula.ts](file:///Users/zhangxueai/Projects/idea/oin/packages/oin/src/lib/formula.ts)）。

## 设计方案（核心）
### 1) 引入统一的递归 Node 类型（类型系统）
- 在 [types.ts](file:///Users/zhangxueai/Projects/idea/oin/packages/oin/src/lib/types.ts) 中定义：
  - `OinNode<T>`：递归条件类型：
    - `T extends readonly U[]` → `OinArrayNode<U>`（下标返回 `OinNode<U>`）
    - `T extends Record<string, unknown>` → `OinScopeNode<T>`（属性返回 `OinNode<T[K]>`）
    - 否则 → `OinUnit<T>`
  - `OinArrayNode<T>` / `OinScopeNode<T>`：与现有 API 对齐（push/splice/commit/snapshot/subscribe/subscribeUpdate），但 index/property 指向递归 node。
- 保持对外 API 名称不变：`oin()` 返回 `OinNode<T>`；原 `OinArrayUnit/OinScope` 可保留为别名或升级为递归版本（按兼容成本选择）。

### 2) 递归建树：把“oinTree 的能力”下沉到核心实现
- 将 `createScope` / `createArrayUnit` 泛化为“节点容器”，child 不再限制为 `OinUnit`，而是 `OinNode`：
  - `ScopeState.children: Map<string, OinNode<unknown>>`
  - `ArrayState.children: OinNode<unknown>[]`
- 新增内部辅助：
  - `createNode(initial: unknown): OinNode<unknown>`：array → array node；plain object → scope node；其他 → unit。
  - `replaceChild(path, nextValue)`：当写入把对象变成原始值/或相反时，正确 detach 旧 child 的订阅并 attach 新 child。
- 建立“父子路径映射表”（需求#1）：
  - 在根节点 INTERNAL 中维护：
    - `pathToNode: Map<string, OinNode<unknown>>`（key 为序列化路径，如 JSON.stringify(path) 或自定义 join 规则）
    - 可选 `nodeToPath: WeakMap<object, readonly (string|number)[]>`（便于调试与校验）
  - 在创建/替换/结构变更（splice/sort）时增量更新映射表。

### 3) 更新与不可变策略：默认不可变、commit 内局部可变
- 读取：继续返回冻结快照（现状 `snapshotValue`），并确保同一 revision 下快照引用稳定（建议增加按 revision 缓存；实现阶段会评估是否必须做）。
- 写入（非 commit）：只更新对应叶子 unit，不引入可变对象。
- commit：
  - 对 scope/array node：`before = snapshot()`（冻结），`draft = cloneValue(before)`（可变），执行用户回调。
  - commit 结束：通过“结构对齐递归应用”把 draft 的变化写回到既有叶子 unit：
    - 如果某 key 对应 child 为 scope/array 且 draft 对应值仍为 object/array → 递归 apply
    - 否则（类型变化或原始值变化）→ 走 replaceChild 或 leaf set
  - 生成 patches：以叶子差异生成 `set`/`splice`/`sort`，并正确携带深路径；
  - commit 完成后 emit：
    - 更新 listeners：仅触发受影响节点的 update/value（叶子 O(1)；父级 subscribe/value 仍可能为 O(children) 计算快照，这是可接受且与 API 语义一致）。

### 4) 派生系统：Unit 级依赖 + 订阅释放
- 在 [formula.ts](file:///Users/zhangxueai/Projects/idea/oin/packages/oin/src/lib/formula.ts) 做两点改造：
  - **精确依赖**：继续要求显式 deps 列表；当 deps 为 `OinUnit<T>` 时 compute 入参为 `T`，从类型上保证 `formula([user.profile.age], (a)=>a*2)`。
  - **按需订阅/释放**：
    - 没有 derived 订阅者时不订阅 deps；
    - 第一个 subscribe 建立 deps 订阅；最后一个 unsubscribe 时释放 deps 订阅；
    - `derived()` 在未订阅情况下按需计算/或返回缓存（实现阶段选择一致语义并写入测试）。
- 单测用 INTERNAL 暴露的 state 统计（listener 数量）验证“无泄漏”。

### 5) 更新回放系统适配（applyUpdate/replay）
- 扩展 scope/array INTERNAL 以支持 `getChild(pathSegment)`，让 [updates.ts](file:///Users/zhangxueai/Projects/idea/oin/packages/oin/src/lib/updates.ts) 的 `resolveNode` 在深树下无需依赖 `current[segment]` 的结构偶然性。
- 保持 `applyUpdate` 的行为：对 deep set/splice/sort 能准确命中叶子 unit 或容器操作。

## 单元测试计划（Vitest）
在 [oin.spec.ts](file:///Users/zhangxueai/Projects/idea/oin/packages/oin/src/lib/oin.spec.ts) 扩展/新增用例：
1. **嵌套拆分**：`const user = oin({ profile: { age: 1 } })`，断言 `user.profile.age` 为可调用 unit，读写正常。
2. **深路径 update**：订阅 `subscribeUpdate`，对 `user.profile.age(v=>v+1)` 产生 patch.path = ['profile','age']。
3. **commit 不可变快照**：`const snap1 = user.snapshot()` 冻结；commit 内修改 draft 深字段；commit 后 `snap2 !== snap1` 且 `Object.isFrozen(snap2)===true`。
4. **派生缓存与精确触发**：`let calls=0; const d = formula([user.profile.age], a=>{calls++; return a*2})`；改 sibling 不触发；改 age 触发；验证 calls 计数。
5. **依赖订阅释放**：对 derived subscribe/unsubscribe，利用 INTERNAL state 的 listener 计数验证订阅建立与释放；保证不泄漏。
6. **O(1) Unit 通知**：仅订阅 leaf unit，更新 leaf 时只触发该 unit 的监听（通过计数验证）；不要求 root subscribe 的 O(1)。

## 交付物形式（不新增文档文件）
- 源码与类型：直接在现有 `packages/oin/src/lib/*` 内完成改造。
- API 使用示例：放在单测与最终回复中给出（不创建 README/额外 md）。
- 性能/正确性报告：
  - 正确性：以 Nx/Vitest 运行结果与关键断言覆盖说明形式输出在最终回复。
  - 性能：提供可复现的基准测试脚本/target 方案（实现阶段根据你接受的“是否新增文件”决定落地方式；若严格不新增文件，则用 vitest 测试内的基准用例输出）。

## 实施步骤（确认后执行）
1. 调整类型定义：引入递归 `OinNode/OinArrayNode/OinScopeNode`，同步更新对外导出。
2. 重构 runtime：把 scope/array 改为 child=递归 node，接入 path 映射表，支持替换/结构变更。
3. 更新 updates/applyUpdate：增加 getChild 支持，保证深路径回放正确。
4. 改造 formula：按需订阅/释放 + 类型推导严格化。
5. 增补单测：覆盖需求列出的所有场景，并用 `nx run @org/oin:{lint,typecheck,test}` 验证。

确认后我会按以上步骤逐文件落地，并在最后给出：关键 API 示例、测试与性能输出、以及改动点的架构说明。