# Oin - 细粒度响应式状态管理库

<a alt="Nx logo" href="https://nx.dev" target="_blank" rel="noreferrer"><img src="https://raw.githubusercontent.com/nrwl/nx/master/images/nx-logo.png" width="45"></a>

✨ 基于 Nx 的 TypeScript monorepo，提供细粒度响应式状态管理 ✨

## 📦 项目概述

本仓库包含以下 6 个包：

- **核心包**

  - `@oin/store` - 细粒度响应式状态管理核心库

- **框架集成包**

  - `@oin/react` - React 集成（Hooks）
  - `@oin/svelte` - Svelte 集成（Stores）
  - `@oin/vue` - Vue 集成（Refs）

- **DevTools**
  - `@oin/devtools` - 运行时观察与导出能力
  - `@oin/devtools-react` - React 面板组件

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
import { oin, oinTree, formula } from '@oin/store';

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
import { applyUpdate, invertUpdate, replay } from '@oin/store';

const updates: OinUpdate[] = [];
state.subscribeUpdate((u) => updates.push(u));

// 回放更新
replay(newState, updates);

// 撤销
applyUpdate(state, invertUpdate(update));
```

### 5. TC39 信号兼容

```typescript
import { Signal, computed, effect } from '@oin/store';

const count = new Signal.State(1);
const double = computed(() => count.get() * 2);
effect(() => console.log(double.get()));
```

## 🔧 框架集成

### React

```typescript
import { useOin } from '@oin/react';

function Counter({ count }) {
  const value = useOin(count);
  return <button onClick={() => count((v) => v + 1)}>{value}</button>;
}
```

### Svelte

```typescript
import { toReadable, toWritable } from '@oin/svelte';

// 只读 store
const store = toReadable(state);

// 可写 store
const writable = toWritable(unit);
```

### Vue

```typescript
import { useOin, oinRef } from '@oin/vue';

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

| 包                    | 标签                       | 可依赖的包           |
| --------------------- | -------------------------- | -------------------- |
| `@oin/store`          | `scope:oin`                | 无（基础库）         |
| `@oin/react`          | `scope:oin-react`          | `scope:oin`          |
| `@oin/svelte`         | `scope:oin-svelte`         | `scope:oin`          |
| `@oin/vue`            | `scope:oin-vue`            | `scope:oin`          |
| `@oin/devtools`       | `scope:oin-devtools`       | `scope:oin`          |
| `@oin/devtools-react` | `scope:oin-devtools-react` | `scope:oin-devtools` |

ESLint 配置会自动阻止循环依赖和错误的模块依赖。

## 📚 常用命令

```bash
# 项目探索
nx graph                                    # 交互式依赖图
nx list                                     # 列出已安装插件
nx show project @oin/store --web                  # 查看项目详情

# 开发
nx build @oin/store                               # 构建特定包
nx test @oin/store                                # 测试特定包
nx lint @oin/react                          # 检查特定包

# 批量任务
nx run-many -t build                       # 构建所有项目
nx run-many -t test --parallel=3          # 并行测试
nx affected -t build                       # 仅构建受影响项目

# 发布管理
nx release --dry-run                       # 预览发布变更
nx release                                 # 创建新发布
```

## 🧪 测试模块边界

尝试在 `@oin/react` 中导入 `@oin/svelte`：

```typescript
import { toReadable } from '@oin/svelte'; // 错误！
```

运行 `nx lint @oin/react` 会报错：违反模块边界规则。

## 🔗 了解更多

- [Nx 文档](https://nx.dev)
- [模块边界](https://nx.dev/features/enforce-module-boundaries)
- [发布包](https://nx.dev/features/manage-releases)
