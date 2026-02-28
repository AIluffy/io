## 0.0.3 (2026-02-28)

### 🚀 Features

- update publish workflow to include registry URL and improve npm token handling ([f112379](https://github.com/AIluffy/oin/commit/f112379))
- update CI workflow to use npm exec for Nx commands ([c79263c](https://github.com/AIluffy/oin/commit/c79263c))
- add Vercel configuration for deployment ([3b5a252](https://github.com/AIluffy/oin/commit/3b5a252))
- update lint:affected script to specify base and head for improved accuracy ([d080559](https://github.com/AIluffy/oin/commit/d080559))
- 为 IoUpdate 添加 action 和 meta 字段以支持更新注解 ([55cab3b](https://github.com/AIluffy/oin/commit/55cab3b))
- 为所有框架适配器添加查询和资源支持 ([7dde592](https://github.com/AIluffy/oin/commit/7dde592))
- **bench-docs:** 重构文档结构为标签页布局并添加核心指标概览 ([be6fd52](https://github.com/AIluffy/oin/commit/be6fd52))
- **core:** 修复数组操作越界问题并优化路径管理 ([b17d798](https://github.com/AIluffy/oin/commit/b17d798))
- **docs:** 为行为文档添加实时演示组件 ([6719f65](https://github.com/AIluffy/oin/commit/6719f65))
- **history:** 支持分组撤销与自定义过滤策略 ([5940e4b](https://github.com/AIluffy/oin/commit/5940e4b))
- **io:** 为查询和变更添加错误处理与注解更新 ([3f195cb](https://github.com/AIluffy/oin/commit/3f195cb))
- **io-solid:** 新增 Solid 框架适配器与示例 ([d03c126](https://github.com/AIluffy/oin/commit/d03c126))
- **io-solid/io-vue/io-svelte:** 添加 selector 钩子/工具以优化性能 ([4a66a61](https://github.com/AIluffy/oin/commit/4a66a61))
- **lynx:** 添加 Lynx 适配层和示例 ([32de148](https://github.com/AIluffy/oin/commit/32de148))
- **nx-cloud:** setup nx cloud workspace ([81b204d](https://github.com/AIluffy/oin/commit/81b204d))
- **nx-cloud:** setup nx cloud workspace ([c925cf8](https://github.com/AIluffy/oin/commit/c925cf8))
- **persist:** 支持异步存储、版本策略、部分字段持久化等功能 ([4f67345](https://github.com/AIluffy/oin/commit/4f67345))
- **query:** 新增 refetch 和 fetchQuietly 方法，重构执行路径并收窄公开导出 ([b723c49](https://github.com/AIluffy/oin/commit/b723c49))
- **react/lynx:** 添加 useIOSelector 钩子以支持选择性订阅 ([9bf5f05](https://github.com/AIluffy/oin/commit/9bf5f05))
- **store:** 导出 createScheduledDispatcher 并重构 UI 适配器 ([b3c1274](https://github.com/AIluffy/oin/commit/b3c1274))
- **store:** 添加子路径导出以支持更好的 tree shaking ([b8d6e44](https://github.com/AIluffy/oin/commit/b8d6e44))

### 🩹 Fixes

- 添加防御性检查防止已处置effect和无效路径删除 ([0fde922](https://github.com/AIluffy/oin/commit/0fde922))
- **core:** 修复提交差异计算中的路径稳定性问题 ([3d34ed4](https://github.com/AIluffy/oin/commit/3d34ed4))

### 🔥 Performance

- 优化提交性能和内存使用 ([259c102](https://github.com/AIluffy/oin/commit/259c102))
- 移除性能分析代码并优化不可变克隆和反应式系统 ([ab59b7a](https://github.com/AIluffy/oin/commit/ab59b7a))
- 重构路径拼接以提升性能 ([987f4e1](https://github.com/AIluffy/oin/commit/987f4e1))
- 优化订阅和路径处理性能，减少内存分配 ([e5711e2](https://github.com/AIluffy/oin/commit/e5711e2))
- **array:** 优化数组长度变更时的差异计算和子节点复用 ([dc24ab0](https://github.com/AIluffy/oin/commit/dc24ab0))
- **snapshot:** 使用即时计算替换惰性属性以提升性能 ([cf01f6d](https://github.com/AIluffy/oin/commit/cf01f6d))
- **snapshot:** 优化数组快照性能并添加GC报告 ([555a9f8](https://github.com/AIluffy/oin/commit/555a9f8))

### ❤️ Thank You

- ailuffy @AIluffy
- AIluffy @AIluffy

## Unreleased

### 💥 Breaking Changes

- **query:** 收窄 `@iostore/store/query` 公开导出并移除 `@iostore/store/query/internal` 子路径，不再对包外暴露 `reportBackgroundError` 等内部符号。

### 🚀 Features

- **query:** `IoQuery` 新增 `refetch()` 和 `getData()`。
- **query:** `IoQuery` 新增 `fetchQuietly()`，统一副作用场景的静默抓取语义。
- **query:** 提取 `retry-executor`、`fetch-controller`、`gc-scheduler`，重构 query 执行路径并保留原有状态机语义。

## 0.0.2 (2026-02-25)

### 🚀 Features

- update publish workflow to include registry URL and improve npm token handling ([f112379](https://github.com/AIluffy/oin/commit/f112379))
- update CI workflow to use npm exec for Nx commands ([c79263c](https://github.com/AIluffy/oin/commit/c79263c))
- add Vercel configuration for deployment ([3b5a252](https://github.com/AIluffy/oin/commit/3b5a252))
- update lint:affected script to specify base and head for improved accuracy ([d080559](https://github.com/AIluffy/oin/commit/d080559))
- 为 IoUpdate 添加 action 和 meta 字段以支持更新注解 ([55cab3b](https://github.com/AIluffy/oin/commit/55cab3b))
- 为所有框架适配器添加查询和资源支持 ([7dde592](https://github.com/AIluffy/oin/commit/7dde592))
- **bench-docs:** 重构文档结构为标签页布局并添加核心指标概览 ([be6fd52](https://github.com/AIluffy/oin/commit/be6fd52))
- **core:** 修复数组操作越界问题并优化路径管理 ([b17d798](https://github.com/AIluffy/oin/commit/b17d798))
- **docs:** 为行为文档添加实时演示组件 ([6719f65](https://github.com/AIluffy/oin/commit/6719f65))
- **history:** 支持分组撤销与自定义过滤策略 ([5940e4b](https://github.com/AIluffy/oin/commit/5940e4b))
- **io-solid:** 新增 Solid 框架适配器与示例 ([d03c126](https://github.com/AIluffy/oin/commit/d03c126))
- **io-solid/io-vue/io-svelte:** 添加 selector 钩子/工具以优化性能 ([4a66a61](https://github.com/AIluffy/oin/commit/4a66a61))
- **lynx:** 添加 Lynx 适配层和示例 ([32de148](https://github.com/AIluffy/oin/commit/32de148))
- **nx-cloud:** setup nx cloud workspace ([81b204d](https://github.com/AIluffy/oin/commit/81b204d))
- **nx-cloud:** setup nx cloud workspace ([c925cf8](https://github.com/AIluffy/oin/commit/c925cf8))
- **persist:** 支持异步存储、版本策略、部分字段持久化等功能 ([4f67345](https://github.com/AIluffy/oin/commit/4f67345))
- **react/lynx:** 添加 useIOSelector 钩子以支持选择性订阅 ([9bf5f05](https://github.com/AIluffy/oin/commit/9bf5f05))
- **store:** 导出 createScheduledDispatcher 并重构 UI 适配器 ([b3c1274](https://github.com/AIluffy/oin/commit/b3c1274))
- **store:** 添加子路径导出以支持更好的 tree shaking ([b8d6e44](https://github.com/AIluffy/oin/commit/b8d6e44))

### 🩹 Fixes

- 添加防御性检查防止已处置effect和无效路径删除 ([0fde922](https://github.com/AIluffy/oin/commit/0fde922))
- **core:** 修复提交差异计算中的路径稳定性问题 ([3d34ed4](https://github.com/AIluffy/oin/commit/3d34ed4))

### 🔥 Performance

- 优化提交性能和内存使用 ([259c102](https://github.com/AIluffy/oin/commit/259c102))
- 移除性能分析代码并优化不可变克隆和反应式系统 ([ab59b7a](https://github.com/AIluffy/oin/commit/ab59b7a))
- 重构路径拼接以提升性能 ([987f4e1](https://github.com/AIluffy/oin/commit/987f4e1))
- 优化订阅和路径处理性能，减少内存分配 ([e5711e2](https://github.com/AIluffy/oin/commit/e5711e2))
- **array:** 优化数组长度变更时的差异计算和子节点复用 ([dc24ab0](https://github.com/AIluffy/oin/commit/dc24ab0))
- **snapshot:** 使用即时计算替换惰性属性以提升性能 ([cf01f6d](https://github.com/AIluffy/oin/commit/cf01f6d))
- **snapshot:** 优化数组快照性能并添加GC报告 ([555a9f8](https://github.com/AIluffy/oin/commit/555a9f8))

### ❤️ Thank You

- ailuffy @AIluffy
- AIluffy @AIluffy

## 0.0.1 (2026-02-13)

### 🚀 Features

- 添加文档站点、示例工程与开发工具包 ([c640865](https://github.com/AIluffy/oin/commit/c640865))
- 统一包名从 @org/* 改为 @oin/* 并更新相关配置 ([3e7ecc1](https://github.com/AIluffy/oin/commit/3e7ecc1))
- 添加 OIN Babel 插件以优化访问链性能 ([c2f499c](https://github.com/AIluffy/oin/commit/c2f499c))
- 引入行为扩展层并移除实验性信号导出 ([7d648aa](https://github.com/AIluffy/oin/commit/7d648aa))
- 统一浅层模式实现并添加集成框架调度选项 ([90987a1](https://github.com/AIluffy/oin/commit/90987a1))
- 重命名 useIo 为 useIO 以遵循命名约定 ([3dd4e12](https://github.com/AIluffy/oin/commit/3dd4e12))
- add Vue and Vanilla examples with async patterns and state management ([9c194bb](https://github.com/AIluffy/oin/commit/9c194bb))
- add set method to IoTreeArrayUnit and implement it in node factory ([55113c4](https://github.com/AIluffy/oin/commit/55113c4))
- enhance documentation with IO composition details and cautionary notes ([6bf668c](https://github.com/AIluffy/oin/commit/6bf668c))
- add multi-parent link support in @iostore/devtools ([0efdb3e](https://github.com/AIluffy/oin/commit/0efdb3e))
- add explanation for implicit auto tracking in derived documentation ([a347e9e](https://github.com/AIluffy/oin/commit/a347e9e))
- add benchmarking documentation and scripts for performance tests ([4cd2c31](https://github.com/AIluffy/oin/commit/4cd2c31))
- implement DeepTreeDashboard component with interactive controls and styles ([a04a52f](https://github.com/AIluffy/oin/commit/a04a52f))
- introduce DirtyIndexState for improved dirty index management and refactor related components ([d5ee7fa](https://github.com/AIluffy/oin/commit/d5ee7fa))
- enhance microtask handling and lazy evaluation in state management ([043f6a7](https://github.com/AIluffy/oin/commit/043f6a7))
- add edge case tests for applyUpdate and Object.is semantics ([30b0934](https://github.com/AIluffy/oin/commit/30b0934))
- add migration guides for Jotai, Redux, and Valtio to IO ([b2f207a](https://github.com/AIluffy/oin/commit/b2f207a))
- add IoDevtoolsTodoExample component and integrate into documentation ([ee95f65](https://github.com/AIluffy/oin/commit/ee95f65))
- enhance documentation and add detailed comments for core functionalities ([726aa4a](https://github.com/AIluffy/oin/commit/726aa4a))
- add snapshot handling for array and scope nodes with context management ([24c98d0](https://github.com/AIluffy/oin/commit/24c98d0))
- enhance coverage reporting with thresholds and additional reporters in vite.config.ts ([4db04fc](https://github.com/AIluffy/oin/commit/4db04fc))
- add contributing guidelines and enhance test coverage for SSR environments ([b55e080](https://github.com/AIluffy/oin/commit/b55e080))
- add @iostore/skill package with usage guide and validation script ([d02cf31](https://github.com/AIluffy/oin/commit/d02cf31))
- add example for triggering functions from multiple stores in derived ([975e329](https://github.com/AIluffy/oin/commit/975e329))
- update benchmark documentation and enhance commit functionality with valueEpoch tracking ([4cd4b29](https://github.com/AIluffy/oin/commit/4cd4b29))
- update benchmark results and environment details in documentation ([6af7c67](https://github.com/AIluffy/oin/commit/6af7c67))
- update benchmark results and environment timestamp in documentation ([2d549fd](https://github.com/AIluffy/oin/commit/2d549fd))
- update publish workflow to include registry URL and improve npm token handling ([f112379](https://github.com/AIluffy/oin/commit/f112379))
- update CI workflow to use npm exec for Nx commands ([c79263c](https://github.com/AIluffy/oin/commit/c79263c))
- add Vercel configuration for deployment ([3b5a252](https://github.com/AIluffy/oin/commit/3b5a252))
- update lint:affected script to specify base and head for improved accuracy ([d080559](https://github.com/AIluffy/oin/commit/d080559))
- **array:** implement array commit and mutation functionalities ([e55214a](https://github.com/AIluffy/oin/commit/e55214a))
- **devtools:** 新增补丁差异树结构并支持框架适配器调度选项 ([be26205](https://github.com/AIluffy/oin/commit/be26205))
- **devtools:** implement Redux bridge connector and history management ([da51957](https://github.com/AIluffy/oin/commit/da51957))
- **docs:** 添加状态管理库对比文档与演示示例 ([dad0949](https://github.com/AIluffy/oin/commit/dad0949))
- **docs:** 添加3D英雄组件并更新文档首页 ([daadd04](https://github.com/AIluffy/oin/commit/daadd04))
- **examples:** 为框架示例添加 Tailwind CSS 和完整的待办事项演示 ([ad66c1e](https://github.com/AIluffy/oin/commit/ad66c1e))
- **@iostore/solid:** 新增 Solid 框架适配器与示例 ([d03c126](https://github.com/AIluffy/oin/commit/d03c126))
- **nx:** add skills for generating code, managing plugins, running tasks, and exploring workspaces ([3647dba](https://github.com/AIluffy/oin/commit/3647dba))
- **nx-cloud:** setup nx cloud workspace from typescript template ([cfa7543](https://github.com/AIluffy/oin/commit/cfa7543))
- **nx-cloud:** setup nx cloud workspace ([81b204d](https://github.com/AIluffy/oin/commit/81b204d))
- **nx-cloud:** setup nx cloud workspace ([c925cf8](https://github.com/AIluffy/oin/commit/c925cf8))
- **oin:** 新增 OIN 核心状态库及框架适配层 ([b58fb94](https://github.com/AIluffy/oin/commit/b58fb94))
- **oin:** 新增深层创建、信号系统、批量更新与调试钩子 ([6f5f1f5](https://github.com/AIluffy/oin/commit/6f5f1f5))
- **oin:** 统一 oin 入口并默认启用深层处理 ([c8f2fa6](https://github.com/AIluffy/oin/commit/c8f2fa6))
- **oin:** 统一入口并支持浅层模式选项 ([5b0d1af](https://github.com/AIluffy/oin/commit/5b0d1af))
- **oin:** 重构派生 API 并新增实验性导出 ([56cb075](https://github.com/AIluffy/oin/commit/56cb075))
- **types:** 导出 Path 类型并改进路径推导类型 ([84587d0](https://github.com/AIluffy/oin/commit/84587d0))

### 🩹 Fixes

- **docs:** 将网站图标从SVG替换为ICO格式 ([117e4f0](https://github.com/AIluffy/oin/commit/117e4f0))
- **docs:** update function signatures and parameter types in relocate and undoUpdate documentation ([5d479fb](https://github.com/AIluffy/oin/commit/5d479fb))
- **types:** 修复条件类型推断以处理联合类型 ([5cdcd40](https://github.com/AIluffy/oin/commit/5cdcd40))

### 🔥 Performance

- **oin:** 优化快照性能，重用未变更的子树 ([9fe74a9](https://github.com/AIluffy/oin/commit/9fe74a9))

### ❤️ Thank You

- ailuffy @AIluffy
- AIluffy @AIluffy
