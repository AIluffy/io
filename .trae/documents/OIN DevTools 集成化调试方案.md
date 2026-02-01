## 目标与范围
- 交付生产可用 DevTools 方案：录制历史、时间旅行、差异查看、性能指标、导出（JSON/Redux DevTools）、UI 面板、错误隔离、完整文档与单测。
- UI 方案采用 A：新增 packages/oin-devtools-react，提供可嵌入应用的 React DevTools 面板。

## 现状梳理（已确认）
- 现有调试入口：onMutation/onError 基于 subscribeUpdate 与 errorListeners 分发（packages/oin/src/lib/debug.ts）。
- 已有回放能力：mergeUpdates / invertUpdate / replay / applyUpdate（packages/oin/src/lib/updates.ts）可直接用于时间旅行。
- workspace 当前无 @org/oin-devtools 包，需要新增 packages/oin-devtools（以及 packages/oin-devtools-react）。

## 包结构与职责
- packages/oin-devtools（核心、无 UI 依赖）
  - 负责：事件采集、历史管理、时间旅行引擎、diff 生成、性能统计、导出、Redux DevTools 在线桥接。
- packages/oin-devtools-react（React UI，peerDependencies: react）
  - 负责：DevToolsPanel、DiffViewer、Perf 面板、ErrorBoundary、开发者友好交互。

## @org/oin-devtools：核心 API（草案）
- createOinDevtools(target, options) => devtools
- devtools.subscribe(listener) 订阅事件（mutation/error/perf/timeTravel/export/bridge）
- devtools.getState() 获取当前调试状态（history/cursor/perf/errors）
- devtools.timeTravel: undo/redo/goTo/pause/resume/clear
- devtools.export:
  - json(): string 或对象（可配置 serializer）
  - reduxDevToolsImport(): Redux DevTools 的 import-state 结构
- devtools.connectReduxDevToolsExtension(window?): 建立在线桥接
  - send：将每次 OIN update 映射为 action 并发送当前 snapshot/state
  - receive：处理 DISPATCH（JUMP_TO_STATE / JUMP_TO_ACTION / RESET / COMMIT 等）并调用 goTo/clear

## 时间旅行实现细节
- 录制：target.subscribeUpdate(u) 生成 HistoryEntry（含 timestamp、patchCount、可选 snapshotBefore/After）。
- undo：对当前 entry.update 执行 invertUpdate 并 applyUpdate(target, inv, {emitUpdate:false})。
- redo：applyUpdate(target, entry.update, {emitUpdate:false})。
- goTo：从当前 cursor 逐步 undo/redo 到目标 index（maxHistory 默认较小，O(n) 可接受）；后续可通过 captureSnapshots=checkpoints 优化大跨度跳转。
- 防回环：timeTravel/bridge 期间设置内部标记，避免把桥接引发的变更再次当作“用户变更”处理。

## 差异查看（Diff Engine）
- patch 级差异：直接基于 OinPatch（set/splice/sort）生成“可展示 diff”。
- snapshot 级差异（可选）：当启用 snapshotBefore/snapshotAfter 时，提供更易读的深度 diff（按 path 列表/树结构）。

## 性能指标（Perf）
- 记录指标：
  - patchCount、updatesPerSecond（滚动窗口）、相邻 update 间隔 deltaMs
  - DevTools 开销：snapshot 采集耗时、diff 生成耗时、导出序列化耗时（支持 sampleRate）
- 输出：聚合统计（均值/最大值/分位数）+ 实时滚动图数据。

## 导出（JSON + Redux DevTools 格式）
- JSON：导出 { meta, options, history }，支持自定义 serializer/replacer/redact。
- Redux DevTools Import State：生成 actionsById/computedStates/currentStateIndex/stagedActionIds 等结构；actionId ↔ historyIndex 映射稳定。

## 错误边界与隔离（不影响主应用）
- 核心包：任何 listener/diff/serialize/bridge 异常都被捕获并写入 devtools.errorLog，同时通过 devtools 事件上报；默认不向业务抛出。
- timeTravel 失败：默认保持应用可继续运行（不致命），并回退 devtools 内部 cursor 状态；options.strict 可切换为抛出（默认 false）。

## @org/oin-devtools-react：UI 交付内容
- 组件：
  - <OinDevtoolsPanel devtools={...} />：主面板（时间线、跳转/撤销/重做、暂停录制、清空、导出按钮）
  - <DiffViewer entry={...} />：差异详情（patch 列表 + 可选深度 diff）
  - <PerfPanel stats={...} />：性能指标（实时/汇总）
  - <DevtoolsErrorBoundary>：确保 UI 渲染错误不会影响宿主应用
- 交互：
  - 时间线点击跳转（goTo）
  - 过滤/搜索（按 path/op）
  - 导出（下载 JSON / 复制 Redux import-state）

## 文档与示例
- 自动 API Reference：现有 tools/docs/generate-api-docs.mjs 会自动为 packages/oin-devtools 与 packages/oin-devtools-react 生成 reference（en/zh-cn）。
- 新增 Guide 页面（en/zh-cn）：DevTools 接入、时间旅行、Diff、Perf、导出、Redux DevTools 在线桥接、配置项。
- 更新 Playground：用 createOinDevtools 替换当前手写 rollback，并嵌入 <OinDevtoolsPanel /> 演示完整能力。

## 单元测试（Vitest）
- packages/oin-devtools：
  - 录制与 cursor 行为（push、pause、clear）
  - undo/redo/goTo 正确性（对 oinDeep/oinTree 的 snapshot 对比）
  - diff（set/splice/sort）输出
  - export（JSON/Redux import-state）结构与稳定性
  - 容错：listener 抛错、序列化失败、bridge 输入异常不影响主流程
- packages/oin-devtools-react：
  - 基础渲染与 ErrorBoundary 行为（渲染错误隔离）

## 配置项（可扩展）
- name、enabled、maxHistory、captureSnapshots(never|always|checkpoints)、perf(enabled/sampleRate)、diff(mode)、export(serializer/redact)、bridge(reduxDevTools)、ignorePaths/filterPatches、onEvent/onError 等。

## 验证（执行阶段会做）
- Nx build/test/typecheck（oin、oin-devtools、oin-devtools-react），docs build 确保页面与示例可用。

确认后我会按该方案开始落地实现（新增两个 packages、更新 docs playground、补齐文档与测试，并跑 Nx 验证）。