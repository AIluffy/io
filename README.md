# Oin - 细粒度响应式状态管理库

<a alt="Nx logo" href="https://nx.dev" target="_blank" rel="noreferrer"><img src="https://raw.githubusercontent.com/nrwl/nx/master/images/nx-logo.png" width="45"></a>

✨ 基于 Nx 的 TypeScript monorepo，提供细粒度响应式状态管理 ✨

## 📦 项目概述

本仓库包含以下 4 个包：

- **核心包**

  - `@org/oin` - 细粒度响应式状态管理核心库

- **框架集成包**
  - `@org/oin-react` - React 集成（Hooks）
  - `@org/oin-svelte` - Svelte 集成（Stores）
  - `@org/oin-vue` - Vue 集成（Refs）

## 🚀 快速开始

```bash
# 安装依赖
npm install

# 构建所有包
npx nx run-many -t build

# 运行测试
npx nx run-many -t test

# 检查所有项目
npx nx run-many -t lint

# 并行运行所有任务
npx nx run-many -t lint test build --parallel=3

# 可视化项目依赖图
npx nx graph
```

## 💡 核心功能

### 1. 细粒度响应式

```typescript
import { oin, oinTree, formula } from '@org/oin';

// 基础单元
const count = oin(0);
count(10); // 设置值
count((v) => v + 1); // 函数式更新

// 对象作用域
const user = oin({ name: 'Alice', age: 25 });
user.name('Bob'); // 仅触发 name 相关订阅

// 深度树形结构
const app = oinTree({
  user: { profile: { name: 'Alice' } },
  items: [{ id: 1, count: 0 }],
});
app.items[0].count((v) => v + 1); // 精确的叶子节点更新
```

### 2. 数组操作

```typescript
const list = oin([1, 2, 3]);
list.push(4);
list.splice(1, 1, 9);
list.sort((a, b) => a - b);
```

### 3. 计算属性

```typescript
const double = formula([count], (c) => c * 2);
```

### 4. 更新历史与回放

```typescript
import { applyUpdate, invertUpdate, replay } from '@org/oin';

const updates: OinUpdate[] = [];
state.subscribeUpdate((u) => updates.push(u));

// 回放更新
replay(newState, updates);

// 撤销
applyUpdate(state, invertUpdate(update));
```

### 5. TC39 信号兼容

```typescript
import { Signal, computed, effect } from '@org/oin';

const count = new Signal.State(1);
const double = computed(() => count.get() * 2);
effect(() => console.log(double.get()));
```

## 🔧 框架集成

### React

```typescript
import { useOin } from '@org/oin-react';

function Counter({ count }) {
  const value = useOin(count);
  return <button onClick={() => count((v) => v + 1)}>{value}</button>;
}
```

### Svelte

```typescript
import { toReadable, toWritable } from '@org/oin-svelte';

// 只读 store
const store = toReadable(state);

// 可写 store
const writable = toWritable(unit);
```

### Vue

```typescript
import { useOin, oinRef } from '@org/oin-vue';

// 组合式函数
const state = useOin(source);

// 双向绑定 ref
const ref = oinRef(unit);
```

## 📁 项目结构

```
├── packages/
│   ├── oin/           [scope:oin]       核心响应式库
│   ├── oin-react/     [scope:oin-react] React 集成
│   ├── oin-svelte/    [scope:oin-svelte] Svelte 集成
│   └── oin-vue/       [scope:oin-vue]   Vue 集成
├── nx.json            - Nx 配置
├── tsconfig.json      - TypeScript 配置
└── eslint.config.mjs  - ESLint 模块边界规则
```

## 🏷️ 模块边界

本项目使用标签强制模块边界：

| 包                | 标签               | 可依赖的包   |
| ----------------- | ------------------ | ------------ |
| `@org/oin`        | `scope:oin`        | 无（基础库） |
| `@org/oin-react`  | `scope:oin-react`  | `scope:oin`  |
| `@org/oin-svelte` | `scope:oin-svelte` | `scope:oin`  |
| `@org/oin-vue`    | `scope:oin-vue`    | `scope:oin`  |

ESLint 配置会自动阻止循环依赖和错误的模块依赖。

## 📚 常用命令

```bash
# 项目探索
npx nx graph                                    # 交互式依赖图
npx nx list                                     # 列出已安装插件
npx nx show project oin --web                  # 查看项目详情

# 开发
npx nx build oin                               # 构建特定包
npx nx test oin                                # 测试特定包
npx nx lint oin-react                          # 检查特定包

# 批量任务
npx nx run-many -t build                       # 构建所有项目
npx nx run-many -t test --parallel=3          # 并行测试
npx nx affected -t build                       # 仅构建受影响项目

# 发布管理
npx nx release --dry-run                       # 预览发布变更
npx nx release                                 # 创建新发布
```

## 🧪 测试模块边界

尝试在 `@org/oin-react` 中导入 `@org/oin-svelte`：

```typescript
import { toReadable } from '@org/oin-svelte'; // 错误！
```

运行 `npx nx lint oin-react` 会报错：违反模块边界规则。

## 🔗 了解更多

- [Nx 文档](https://nx.dev)
- [模块边界](https://nx.dev/features/enforce-module-boundaries)
- [发布包](https://nx.dev/features/manage-releases)
