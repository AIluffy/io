# @oin/store

OIN 核心状态库：Unit / ArrayUnit / Scope / Derived（formula）/ Snapshot，并支持更新追踪、合并与回放。

## 深层对象

- `oin()` 对对象是浅层 Scope（只把第一层 key 变成 Unit）。
- 需要 `scope.user.name(...)` 这种深层属性级 Unit 时用 `oinDeep()`（语义等同 `oinTree()`）。
