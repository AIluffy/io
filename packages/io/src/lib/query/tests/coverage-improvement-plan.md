# @iostore/store Coverage Improvement Plan

| File | 当前覆盖率(Branches) | 目标覆盖率(Branches) | 新增测试数 |
|---|---:|---:|---:|
| src/lib/query/infinite-query-observer.ts | 44.31% | 55% | 3 |
| src/lib/query/query-cache.ts | 58.94% | 68% | 2 |
| src/lib/query/infinite-query-record.ts | 79.36% | 82% | 2 |
| src/lib/query/query-observer.ts | 71.08% | 75% | 2 |
| src/lib/query/utils.ts | 74.72% | 80% | 2 |
| src/lib/query/query-record.ts | 72.85% | 78% | 2 |
| src/lib/query/client-hydration.ts | 61.11% | 85% | 4 |
| src/lib/query/focus-manager.ts | 75.00% | 90% | 1 |
| src/lib/query/online-manager.ts | 75.00% | 90% | 1 |
| src/lib/query/client-helpers.ts | 75.00% | 95% | 1 |

## Notes

- 本次已完成 `client-hydration.ts`、`utils.ts`、`focus-manager.ts`、`online-manager.ts`、`client-helpers.ts` 的高价值分支补测。
- 部分分支（如 `infinite-query-observer.ts` 的复杂异步回调顺序、`query-cache.ts` 的 GC 触发时序）需要更细粒度的测试驱动桩对象，后续可通过测试专用 fake record 扩展进一步覆盖。
