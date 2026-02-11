## 补充要求：TS 类型需支持深层嵌套（对齐方案）

* 现状：`OinTreeNode<T, MaxDepth = 8>` / `UnwrapOin<T, MaxDepth = 8>` / `OinPathOf<T, MaxDepth = 5>` 都有最大深度限制，且 `DepthTable` 目前只覆盖到 12 左右（见 [types.ts](file:///Users/zhangxueai/Projects/idea/oin/packages/oin/src/lib/types.ts)）。

* 计划改造：把深度表扩到 32（或 64），并把新的默认 MaxDepth 提升到 16/20，使“深层嵌套结构”在大多数业务对象上能得到正确推导，同时仍保留 MaxDepth 以避免 TS 递归爆栈。

## 统一入口设计（不变）

* `oin` 作为唯一推荐入口：primitive → Unit；array → 深递归；object → 默认 deep（等价旧 `oinTree/oinDeep`）。

* 为迁移保底：提供 `oinShallow`（保持旧 `oin(object)` 的浅层 Scope 行为），并在 README 标注；否则必然是 breaking change。

## 类型系统完善（重点：深层嵌套）

1. 新增导出类型

   * `export type Primitive = string | number | boolean | bigint | symbol | null | undefined;`

   * `export type OinResult<T, MaxDepth extends number = 16> = OinTreeNode<T, MaxDepth>;`

     * 解释：新 `oin` 的 deep 默认等价“树节点”，因此直接复用 `OinTreeNode` 的条件分发；primitive 仍会落到 `OinUnit`。
2. `oin` 的重载签名

   * 提供按输入类型分派的重载，并暴露可选深度参数（类型层，不影响运行时）：

     * `oin<T extends Primitive>(target: T, options?): OinResult<T, 0>`（或直接 `OinUnit<T>`）

     * `oin<T extends readonly unknown[], D extends number = 16>(target: T, options?): OinResult<T, D>`

     * `oin<T extends Record<PropertyKey, unknown>, D extends number = 16>(target: T, options?): OinResult<T, D>`
3. 扩展深度表

   * 扩展 `DepthTable` 到 32/64，保证 `PrevDepth` 可在更深层仍可正确递减。
4. 若继续支持 symbol 键路径（按原需求）

   * 把 `OinPath` 从 `string | number` 扩到 `PropertyKey`，并同步更新 `OinPatch/OinPathOf/OinPathValue` 的 key 提取逻辑（`Extract<keyof T, string | symbol>`），确保 symbol 键也能参与深层推导。

## 深度递归与循环引用（实现策略不变）

* 使用 `WeakMap<object, TreeNode>`：首次创建节点即写入，递归时复用同一节点引用，避免死循环且保持引用一致。

* object 用 `Reflect.ownKeys`，array 按 length 遍历并把 hole 归一化为显式 `undefined` 子节点。

* `silent`：`oin(x, { silent: true })` 遇到不可 deep 的对象/函数时退化为叶子 Unit。

## 开发环境内建 oinTree 能力（不变）

* 开发默认启用 PathTrie/副作用收集；生产默认关闭；提供 `globalThis.__OIN_DEVTOOLS__ = false` 显式关闭。

## 测试、基准、文档（不变）

* 新增 `oin.test.ts`（Vitest 快照）、`oin.bench.js`（Node 18 perf/memory gate）。

* README/Docs：声明 `oinTree` deprecated，迁移到新 `oin`；浅层需求改用 `oinShallow`。

## 文件级修改范围（不变 + types.ts）

* `packages/oin/src/lib/oin.ts`：新入口 + JSDoc + 重载。

* `packages/oin/src/lib/oin-tree.ts`：抽取构造器、WeakMap、ownKeys、devtools 开关。

* `packages/oin/src/lib/types.ts`：新增 `OinResult`、扩深度表、（可选）路径段支持 symbol。

* 新增：`packages/oin/src/lib/oin.test.ts`、`packages/oin/oin.bench.js`。

## 兼容性说明（不变）

* `oin(object)` 默认 deep 属于 breaking behavior；计划用 `oinShallow` 兜底并标注需 major 升级。

