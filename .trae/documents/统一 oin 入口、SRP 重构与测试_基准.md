## 约束（按你的最新要求）
- 移除 `oinShallow`：不再导出、不再保留兼容包装；浅层模式统一改为 `oin(value, { shallow: true })`。
- `devtools` 不通过 `oin` 控制：仍仅由 `oinTree` 的既有机制（环境/全局开关）决定。
- `oinTree` 的 scope/array 与外部 `createScope/createArrayUnit` 做“可合并复用”：抽参数化容器底座，两边共用同一套容器核心逻辑。

## 1) 合并入口：仅保留 `oin`
- 修改 [oin.ts](file:///Users/zhangxueai/Projects/idea/oin/packages/oin/src/lib/oin.ts#L25-L55)
  - 删除 `export function oinShallow...`。
  - 扩展 `oin` 的 options：`{ shallow?: boolean; silent?: boolean }`。
  - 行为：
    - `shallow:true`：array→`createArrayUnit`，plain object→`createScope`，其他→`createUnit`。
    - 默认（`shallow:false/undefined`）：array/plain object→`oinTree(...,{silent})`；非 plain object 的 object：`silent:true`→`createUnit`，否则抛错。
  - TS 重载：
    - `oin<T(target: T, options?: { shallow?: false; silent?: boolean }): OinResult<T>`
    - `oin<T(target: T, options: { shallow: true; silent?: boolean }): OinNode<T>`

## 2) 同步移除对外导出与文档引用
- 源码导出：更新 [index.ts](file:///Users/zhangxueai/Projects/idea/oin/packages/oin/src/index.ts#L1-L34) 移除 `oinShallow` re-export。
- 全仓把 `oinShallow` 文档/示例改为 `oin(...,{shallow:true})`（涉及：根 README、packages/oin README、docs 中 intro/getting-started/reference 等）。

## 3) 抽共享模块（去重 + 支撑 Tree/Shallow 合并）
- 新增/调整小模块（每个模块只做一件事）：
  - `internal-symbol.ts`：统一导出 `INTERNAL`。
  - `plain-object.ts`：统一导出 `isPlainObject`（替换 `oin.ts` 与 `oin-tree.ts` 两处重复实现）。
  - `internal-access.ts`：统一 internal 读取 + kind 校验（替换 `scope.ts/array-unit.ts/oin-tree.ts` 各自实现）。
  - `patch-path.ts`：纯函数 `prependPatchPath/ prependUpdatePath`（替换 scope/array/tree 里的“path 前置”重复逻辑）。

## 4) 让 `createScope/createArrayUnit` 与 `oinTree` scope/array 共享同一容器底座（合并点）
- 新建 `lib/container/`（或同级目录）提供两类容器核心：
  - `createKeyedContainer`：对象容器（snapshot 缓存、subscribe/subscribeUpdate、commit/applySet 模板、子节点订阅管理）。
  - `createIndexedContainer`：数组容器（含 push/pop/splice/sort、commit/applySplice/applySortOrder、Proxy/indexer 支持所需的最小接口）。
- 通过“策略/适配器”区分 shallow vs tree：
  - shallow：child=Unit；结构变更只处理本层 units 与订阅。
  - tree：child=TreeNode；结构变更额外触发 path→node registry 的 register/unregister/rebuild（Trie/WeakMap 逻辑仍归 tree 层独立模块负责）。

## 5) SRP 重构四个核心函数
- `createUnit`（[unit.ts](file:///Users/zhangxueai/Projects/idea/oin/packages/oin/src/lib/unit.ts)）：拆为 state 初始化、缓存读取、set 应用（patch/update 生成）、函数外观组装。
- `createScope`（[scope.ts](file:///Users/zhangxueai/Projects/idea/oin/packages/oin/src/lib/scope.ts)）：改为 shallow 适配器（调用 `createKeyedContainer` + Unit child 策略）。
- `createArrayUnit`（[array-unit.ts](file:///Users/zhangxueai/Projects/idea/oin/packages/oin/src/lib/array-unit.ts)）：改为 shallow 适配器（调用 `createIndexedContainer` + Unit child 策略），保持 reduce/iterator/Proxy 行为不变。
- `oinTree`（[oin-tree.ts](file:///Users/zhangxueai/Projects/idea/oin/packages/oin/src/lib/oin-tree.ts)）：
  - 保持 devtools 机制不变。
  - scope/array 节点实现切换为 tree 适配器（同样复用 container core）。
  - Trie 注册、WeakMap 循环引用、结构变更 rebuild 继续作为 tree 专属职责模块。

## 6) 单元测试（Vitest）
- 更新 [oin.test.ts](file:///Users/zhangxueai/Projects/idea/oin/packages/oin/src/lib/oin.test.ts)：
  - 保证默认 deep 现有用例全部继续通过。
  - 新增 shallow 用例：`oin(...,{shallow:true})` 的 object/array 不深递归。
  - deep 模式非 plain object 的 object：`silent:false` 抛错、`silent:true` 退化 unit。
  - 冒泡 patch path 在 set/splice/sort/commit 下仍正确。

## 7) 性能验证（不退化）
- 运行现有基准：
  - [clone-perf.bench.ts](file:///Users/zhangxueai/Projects/idea/oin/packages/oin/src/lib/clone-perf.bench.ts)
  - [oin.bench.js](file:///Users/zhangxueai/Projects/idea/oin/packages/oin/oin.bench.js)
- 如容器 core 引入额外开销：补一个针对 `oin()` 构建与 `snapshot()` 热路径的基准，并设定与现有阈值一致的 gate。

## 8) 执行时验证方式
- 跑 Nx 的 test target（`nx run <project>:test`）确保所有测试通过。
- 跑 bench 脚本并确认阈值仍满足（ms 与 heapGrowthRatio 不超标）。