# Io - 细粒度响应式状态管理库

<a alt="Nx logo" href="https://nx.dev" target="_blank" rel="noreferrer"><img src="https://raw.githubusercontent.com/nrwl/nx/master/images/nx-logo.png" width="45"></a>

✨ 基于 Nx 的 TypeScript monorepo，提供细粒度响应式状态管理 ✨

## 📦 项目概述

本仓库包含以下 6 个包：

- **核心包**
  - `io-store` - 细粒度响应式状态管理核心库

- **框架集成包**
  - `io-react` - React 集成（Hooks）
  - `io-svelte` - Svelte 集成（Stores）
  - `io-vue` - Vue 集成（Refs）

- **DevTools**
  - `io-devtools` - 运行时观察与导出能力
  - `io-devtools-react` - React 面板组件

## 🚀 快速开始

```bash
# 安装依赖
npm install

# 构建所有包
nx run-many -t build

# 运行测试
nx run-many -t test

# 检查所有项目
nx run-many -t lint

# 并行运行所有任务
nx run-many -t lint test build --parallel=3

# 可视化项目依赖图
nx graph
```

## 💡 核心功能

### 1. 细粒度响应式

```typescript
import { derived, io } from 'io-store';

// 基础单元
const count = io(0);
count.set(10); // 设置值
count.set((v) => v + 1); // 更新

// 对象作用域
const user = io({ name: 'Alice', age: 25 });
user.name.set('Bob'); // 仅触发 name 相关订阅

// 深度树形结构（默认）
const app = io({
  user: { profile: { name: 'Alice' } },
  items: [{ id: 1, count: 0 }],
});
app.items[0].count.set((v) => v + 1); // 精确的叶子节点更新

// 仅第一层变成 Unit（同一 Tree 引擎，深度限制为 1）
const shallow = io({ name: 'Alice', age: 25 }, { shallow: true });
shallow.name.set('Bob');
// shallow.commit(...) 不允许新增未知 key
```

### 2. 数组操作

```typescript
const list = io([1, 2, 3]);
list.push(4);
list.splice(1, 1, 9);
list.sort((a, b) => a - b);
```

### 3. 计算属性

```typescript
const double = derived([count], (c) => c * 2);
```

### 4. 更新历史与回放

```typescript
import { applyUpdate, replay, undoUpdate } from 'io-store';

const updates: IoUpdate[] = [];
state.subscribeUpdate((u) => updates.push(u));

// 回放更新
replay(newState, updates);

// 撤销
applyUpdate(state, undoUpdate(update));
```

## 🔧 框架集成

### React

```typescript
import { useIO } from 'io-react';

function Counter({ count }) {
  const value = useIO(count);
  return <button onClick={() => count.set((v) => v + 1)}>{value}</button>;
}
```

### Svelte

```typescript
import { toReadable, toWritable } from 'io-svelte';

// 只读 store
const store = toReadable(state);

// 可写 store
const writable = toWritable(unit);
```

### Vue

```typescript
import { useIO, ioRef } from 'io-vue';

// 组合式函数
const state = useIO(source);

// 双向绑定 ref
const ref = ioRef(unit);
```

## 📁 项目结构

```
├── packages/
│   ├── io/           [scope:io]       核心响应式库
│   ├── io-react/     [scope:io-react] React 集成
│   ├── io-svelte/    [scope:io-svelte] Svelte 集成
│   └── io-vue/       [scope:io-vue]   Vue 集成
├── nx.json            - Nx 配置
├── tsconfig.json      - TypeScript 配置
└── eslint.config.mjs  - ESLint 模块边界规则
```

## 🏷️ 模块边界

本项目使用标签强制模块边界：

| 包                  | 标签                      | 可依赖的包          |
| ------------------- | ------------------------- | ------------------- |
| `io-store`          | `scope:io`                | 无（基础库）        |
| `io-react`          | `scope:io-react`          | `scope:io`          |
| `io-svelte`         | `scope:io-svelte`         | `scope:io`          |
| `io-vue`            | `scope:io-vue`            | `scope:io`          |
| `io-devtools`       | `scope:io-devtools`       | `scope:io`          |
| `io-devtools-react` | `scope:io-devtools-react` | `scope:io-devtools` |

ESLint 配置会自动阻止循环依赖和错误的模块依赖。

## 📚 常用命令

```bash
# 项目探索
npm exec nx graph                           # 交互式依赖图
npm exec nx list                            # 列出已安装插件
npm exec nx show project io-store --web     # 查看项目详情

# 开发
npm exec nx build io-store                 # 构建特定包
npm exec nx test io-store                  # 测试特定包
npm exec nx lint io-react                  # 检查特定包

# 批量任务
npm exec nx run-many -t build              # 构建所有项目
npm exec nx run-many -t test --parallel=3  # 并行测试
npm exec nx affected -t build              # 仅构建受影响项目

# 发布管理
npm exec nx release --dry-run              # 预览发布变更
npm exec nx release                        # 创建新发布
```

## 📦 发布流程

本仓库使用 `nx release` 统一管理多包版本、变更日志和发布。

发布前检查（本地）：

```bash
git status --porcelain
npm exec nx run-many -t lint test typecheck build
```

本地发布（手动）：

```bash
npm exec nx release --dry-run  # 预览
npm exec nx release patch      # 实际发布，示例为 patch
```

只生成版本/变更日志、不发布：

```bash
npm exec nx release patch --skip-publish
```

仅发布已有版本（例如已完成版本/打 tag）：

```bash
npm exec nx release publish --access public
```

本地 Verdaccio 验证发布：

```bash
# 启动本地 registry
npm exec nx run io-source:local-registry

# 发布到本地 registry
npm exec nx release publish --registry http://localhost:4873 --tag next --access public

# 在示例项目中验证安装（示例）
npm i io-store@next --registry http://localhost:4873
```

CI 发布（GitHub Actions）：

```text
.github/workflows/release.yml   # 生成 Release PR
.github/workflows/publish.yml   # 合并到 main 后自动发布（npm + JSR）
```

1. 在 GitHub Secrets 中设置 `NPM_TOKEN`、`JSR_TOKEN`。
2. 通过 Actions -> Release PR 手动触发，输入 `specifier`（如 `patch`/`minor`/`major`/`1.2.3`）。
3. 合并 Release PR 到 `main` 后，`Publish` workflow 会自动发包到 npm，并尝试发布到 JSR。
4. JSR 发布仅处理“本次版本变更且包含 `jsr.json` 的包”；未配置 `jsr.json` 会自动跳过。

## 🧭 开发到发包全流程（Feature -> npm）

以下流程是推荐的团队协作路径，适用于新增 feature、修复 bug、或对外发布。

1. 新建功能分支（从 `main` 拉取）。
2. 开发并补齐测试（单测/类型/文档）。
3. 本地自检通过后提交 PR。
4. 合并 feature PR 到 `main`。
5. 手动触发 `Release PR` workflow 生成版本 PR。
6. 合并版本 PR 到 `main`。
7. `Publish` workflow 自动发布 npm 包。

关键命令清单（本地开发阶段）：

```bash
# 安装依赖
npm ci

# 基础质量检查
npm exec nx run-many -t lint test typecheck build

# 文档生成检查（API/bench 文档是否需要更新）
npm run docs:check

# 仅检查受影响项目（可选，加快迭代）
npm exec nx affected -t lint test build typecheck
```

Release PR 阶段（GitHub Actions）：

```text
.github/workflows/release.yml
```

- 手动触发，输入 `specifier`（`patch` / `minor` / `major` / `1.2.3`）
- 自动创建 release 分支与版本 PR（执行 `npm exec nx release <specifier> --skip-publish`）

自动发包阶段（GitHub Actions）：

```text
.github/workflows/publish.yml
```

- 仅当检测到 `packages/*/package.json` 版本变化时执行发布
- 使用 `NPM_TOKEN` 执行 `npm exec nx release publish --access public`
- 使用 `JSR_TOKEN` 扫描并发布“本次版本变更且包含 `jsr.json`”的包到 JSR

常见故障排查：

- `Publish` 没有发包：
  - 检查 release PR 是否真的修改了 `packages/*/package.json` 的 `version`
  - 检查 `NPM_TOKEN` 是否有效、是否有 npm publish 权限
- `Publish` 没有发到 JSR：
  - 检查 `JSR_TOKEN` 是否有效
  - 检查目标包目录是否存在 `jsr.json`
  - 检查 `jsr.json` 内包名与导出配置是否有效
- `Release PR` 失败：
  - 本地先跑 `npm exec nx run-many -t lint test typecheck build`
  - 确认 `main` 最新并解决冲突后重跑 workflow
- 合并后文档未更新：
  - 检查 `.github/workflows/deploy-docs.yml` 是否触发
  - 检查 `VERCEL_TOKEN`、`VERCEL_ORG_ID`、`VERCEL_PROJECT_ID`

## 🌐 文档站部署（Vercel）

文档站由 **单一入口** workflow 负责部署：

```text
.github/workflows/deploy-docs.yml
```

- 触发条件：`push` 到 `main`（命中 `apps/docs/**`、`packages/**`、`tools/docs/**`、`package.json`）或手动 `workflow_dispatch`
- 部署方式：GitHub Actions 使用 Vercel CLI 生产部署（`vercel pull` + `vercel build --prod` + `vercel deploy --prebuilt --prod`）
- 必需 Secrets：
  - `VERCEL_TOKEN`
  - `VERCEL_ORG_ID`
  - `VERCEL_PROJECT_ID`

## 🧪 测试模块边界

尝试在 `io-react` 中导入 `io-svelte`：

```typescript
import { toReadable } from 'io-svelte'; // 错误！
```

运行 `nx lint io-react` 会报错：违反模块边界规则。

## 🔗 了解更多

- [Nx 文档](https://nx.dev)
- [模块边界](https://nx.dev/features/enforce-module-boundaries)
- [发布包](https://nx.dev/features/manage-releases)
