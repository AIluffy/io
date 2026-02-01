## 现状结论（基于代码与站点）
- 仓库包含 4 个包：`@org/oin`（核心）+ `@org/oin-react/@org/oin-vue/@org/oin-svelte`（框架适配）。核心对外导出集中在 [packages/oin/src/index.ts](file:///Users/zhangxueai/Projects/idea/oin/packages/oin/src/index.ts#L1-L29)。
- 文档站点已存在：`apps/docs`（Astro + Starlight，静态输出），已启用多语言（en/zh-cn）与 Pagefind 搜索，侧边栏为 Guides + Reference（Reference 目录支持自动生成）[astro.config.mjs](file:///Users/zhangxueai/Projects/idea/oin/apps/docs/astro.config.mjs#L11-L37)。
- 现有文档内容与实际 API 已出现不一致（例如 doc 中 `signal/useSignal`，而代码实际为 `state/computed/effect/untrack` 等），需要以源码为准回填。
- 当前 docs 部署工作流仅在 `apps/docs/**` 变更时触发 [deploy-docs.yml](file:///Users/zhangxueai/Projects/idea/oin/.github/workflows/deploy-docs.yml#L3-L8)，若 API 文档由源码驱动生成，需要调整触发/生成策略以保证同步。

## 目标拆解（对齐你的 7 条要求）
1) 架构文档：提供整体架构图、模块划分、核心组件说明、技术栈依据。
2) API 文档：覆盖所有“对外接口”（导出的函数/类型/适配器），包含参数/返回/错误/鉴权（库场景下“鉴权不适用”需明确说明）。
3) 示例：覆盖核心/深层树/派生/批处理/更新回放/React/Vue/Svelte，给可运行项目或可直接运行片段。
4) 站点支持导航与搜索：复用 Starlight 侧边栏 + Pagefind。
5) 同步与版本管理：生成机制 + CI 校验 + 可选的版本快照策略。
6) 交互式测试：提供可在线运行的 Playground（不引入不安全的浏览器 eval）。
7) 访问权限与更新流程：用仓库权限/分支保护/代码所有权确保质量与安全。

## 实施方案（我会按“最小可行+可扩展”落地）
### A. 文档信息源与生成策略（确保同步）
- 建立“单一事实来源”：以每个包的 `src/index.ts` 导出表为准，结合 `packages/oin/src/lib/types.ts` 补充类型/结构。
- 新增一个**API 参考生成脚本**（使用 TypeScript Compiler API，避免引入 TypeDoc 依赖），输入：导出符号与其类型签名；输出：Starlight 可读的 `.mdx` 页面。
- 生成落点：
  - `apps/docs/src/content/docs/en/reference/**`
  - `apps/docs/src/content/docs/zh-cn/reference/**`
  这样 sidebar 的 `autogenerate: { directory: 'reference' }` 会自动导航。

### B. 架构设计文档（含架构图）
- 新增 `guides/architecture.mdx`（中英文各一份），内容包含：
  - 系统整体架构图：以“数据模型（Unit/Scope/Array/Tree）→ 更新系统（Patch/Update）→ 派生（derive/formula/signals）→ 集成层（react/vue/svelte）”为主线。
  - 模块划分与职责：对应 `lib/*`（unit/scope/array-unit/oin-tree/updates/signals/batch/debug/snapshot/types）。
  - 技术栈依据：为何选择函数式节点 API、冻结快照、显式 Patch/Update、内部 signals、以及 Starlight + Pagefind。
- 图的落地方式：
  - 首选：Markdown 里的 Mermaid（需要增加 remark/rehype 插件）；
  - 备选：提交静态 SVG（无需新依赖）。
  我会优先选“备选（SVG）”保证零依赖、构建稳定；如你希望可编辑图，再切换 Mermaid。

### C. API 接口文档（按包分组、可搜索）
- 为每个包生成 `reference/<package>/index.mdx` + 分页：
  - `@org/oin`：oin/oinTree/oinDeep、Unit/Scope/ArrayUnit/TreeNode、snapshot/subscribe/commit/reset、batch、formula/derive、signals、updates（merge/apply/invert/replay）、debug hooks。
  - `@org/oin-react`：useOin。
  - `@org/oin-vue`：useOin/oinRef。
  - `@org/oin-svelte`：toReadable/toWritable。
- 文档字段（映射你的“请求/响应/错误码/鉴权”要求到库 API 语义）：
  - 请求参数：函数参数/泛型参数/必要前置条件。
  - 响应格式：返回类型 + 运行时行为（是否冻结、是否缓存、订阅语义）。
  - 错误码定义：库内无标准 error code 时，给出“错误类型/失败场景/通过 onError 上报的 operation/path/value”规范。
  - 鉴权方式：明确“不涉及鉴权；作为纯前端/本地库调用”。

### D. 示例与可运行代码（覆盖常见场景）
- 新增 `guides/examples/*.mdx`：每个场景一页，给“复制即用”的片段。
- 另提供可运行示例工程（用于交互/调试与真实运行）：
  - `examples/core-node`（Node/TS，演示 update 录制/回放）
  - `examples/react`、`examples/vue`、`examples/svelte`（最小应用）
  这些示例工程既服务文档，也服务 Playground。

### E. 交互式 API 测试（Playground）
- 在文档中嵌入 StackBlitz（或 CodeSandbox）iframe：
  - 每个示例工程提供“打开在线运行”的链接/嵌入。
  - 不在站点内做任意代码 eval，降低安全风险。

### F. 版本管理机制（同步 + 历史）
- 同步机制：
  - CI 增加一个“生成 API docs 并校验无差异”的步骤（生成后 `git diff --exit-code`）。
  - `deploy-docs` 在构建前执行生成脚本，且触发路径扩展为 `apps/docs/**` + `packages/**` + `tools/docs/**`（避免 API 变更但 docs 不更新）。
- 版本化策略（两档）：
  - 基础档（推荐先上）：站点始终展示 `latest`，并在每页显示“对应包版本”（读取 `packages/*/package.json`）。
  - 扩展档：提供 `reference/versions/vX.Y.Z/**` 的快照目录，通过 release 流程生成并提交（或在 GH Pages artifact 中同时发布）。

### G. 文档访问权限与更新流程（质量与安全）
- 访问权限：GitHub Pages 本身难以做可靠鉴权；采用“仓库权限 + 分支保护”控制写入。
- 更新流程（落到仓库机制）：
  - `CODEOWNERS` 约束 docs/reference 由指定 owners 审核。
  - PR 模板要求同步更新：API 改动必须包含 docs 变更或生成物更新。
  - 必须通过 CI：lint/test/typecheck + docs build + docs-sync check。

## 交付物（你确认后我会直接落地）
- 新增/更新：`apps/docs/src/content/docs/**`（架构、API reference、示例、跨语言一致性修订）。
- 新增：`tools/docs/generate-api-docs.ts`（或同等位置）+ Nx target（可选）用于生成与校验。
- 更新：`deploy-docs.yml`（触发范围与生成步骤）与 `ci.yml`（docs-sync 校验）。
- 新增：`examples/**`（可运行示例工程）与文档内的 Playground 嵌入。

确认后我会开始按以上方案写入文档、补齐生成脚本与 CI，并在本地构建 docs 进行验证。