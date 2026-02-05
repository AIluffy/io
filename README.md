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
count(10); // 设置值
count((v) => v + 1); // 函数式更新

// 对象作用域
const user = io({ name: 'Alice', age: 25 });
user.name('Bob'); // 仅触发 name 相关订阅

// 深度树形结构（默认）
const app = io({
  user: { profile: { name: 'Alice' } },
  items: [{ id: 1, count: 0 }],
});
app.items[0].count((v) => v + 1); // 精确的叶子节点更新

// 仅第一层变成 Unit（同一 Tree 引擎，深度限制为 1）
const shallow = io({ name: 'Alice', age: 25 }, { shallow: true });
shallow.name('Bob');
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
import { applyUpdate, invertUpdate, replay } from 'io-store';

const updates: IoUpdate[] = [];
state.subscribeUpdate((u) => updates.push(u));

// 回放更新
replay(newState, updates);

// 撤销
applyUpdate(state, invertUpdate(update));
```

## 🔧 框架集成

### React

```typescript
import { useIo } from 'io-react';

function Counter({ count }) {
  const value = useIo(count);
  return <button onClick={() => count((v) => v + 1)}>{value}</button>;
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
import { useIo, ioRef } from 'io-vue';

// 组合式函数
const state = useIo(source);

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
nx graph                                    # 交互式依赖图
nx list                                     # 列出已安装插件
nx show project io-store --web                  # 查看项目详情

# 开发
nx build io-store                               # 构建特定包
nx test io-store                                # 测试特定包
nx lint io-react                          # 检查特定包

# 批量任务
nx run-many -t build                       # 构建所有项目
nx run-many -t test --parallel=3          # 并行测试
nx affected -t build                       # 仅构建受影响项目

# 发布管理
nx release --dry-run                       # 预览发布变更
nx release                                 # 创建新发布
```

## 📦 发布流程

本仓库使用 `nx release` 统一管理多包版本、变更日志和发布。

发布前检查（本地）：

```bash
git status --porcelain
nx run-many -t lint test typecheck build
```

本地发布（手动）：

```bash
nx release --dry-run        # 预览
nx release patch            # 实际发布，示例为 patch
```

只生成版本/变更日志、不发布：

```bash
nx release patch --skip-publish
```

仅发布已有版本（例如已完成版本/打 tag）：

```bash
nx release publish --access public
```

本地 Verdaccio 验证发布：

```bash
# 启动本地 registry
nx run io-source:local-registry

# 发布到本地 registry
nx release publish --registry http://localhost:4873 --tag next --access public

# 在示例项目中验证安装（示例）
npm i io-store@next --registry http://localhost:4873
```

CI 发布（GitHub Actions）：

```text
.github/workflows/release.yml   # 生成 Release PR
.github/workflows/publish.yml   # 合并到 main 后自动发布
```

1. 在 GitHub Secrets 中设置 `NPM_TOKEN`。
2. 通过 Actions -> Release PR 手动触发，输入 `specifier`（如 `patch`/`minor`/`major`/`1.2.3`）。
3. 合并 Release PR 到 `main` 后，`Publish` workflow 会自动发包。

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
