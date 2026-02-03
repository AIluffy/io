# @oin/store

OIN 核心状态库：Unit / ArrayUnit / Scope / Derived（formula）/ Snapshot，并支持更新追踪、合并与回放。

## 深层对象

- `oin()` 对 object / array 默认进行 deep 处理（等价旧 `oinTree()` / `oinDeep()`）。
- 需要“仅第一层变成 Unit”的行为时使用 `oin(value, { shallow: true })`。
- `oinTree()` / `oinDeep()` 仍可用，但已弃用，建议迁移到 `oin()`。
