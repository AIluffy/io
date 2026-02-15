import type { TreeArrayState } from './io-tree-types.js';
import type { GetNodeValue, SnapshotCache } from './snapshot-scope.js';

import { freezeRootShallow } from '../utils/snapshot.js';
import { defineLazyValue } from '../utils/lazy-property.js';
import { readCachedByVersion } from '../container/cache.js';
import { clearDirtyIndices } from './dirty-indices.js';

type ArraySnapshotReader = (
  state: TreeArrayState,
  cache?: SnapshotCache,
) => unknown[];

export function createArraySnapshotReader(deps: {
  getNodeValue: GetNodeValue;
}): ArraySnapshotReader {
  const fullRebuildThreshold = 0.5;
  return (state: TreeArrayState, cache?: SnapshotCache): unknown[] =>
    readCachedByVersion(state.snapshotCache, state.valueEpoch, () => {
      const local = cache ?? new WeakMap<object, unknown>();
      const cached = local.get(state.node as object);
      if (cached) return cached as unknown[];

      const prev = state.snapshotCache.hasValue
        ? (state.snapshotCache.value as unknown[])
        : undefined;

      if (
        prev &&
        !state.dirtyStructure &&
        state.dirtyIndices.items.length === 0 &&
        prev.length === state.children.length
      ) {
        local.set(state.node as object, prev);
        return prev;
      }

      let values: unknown[];
      let forceFullRebuild = false;
      if (
        prev &&
        !state.dirtyStructure &&
        prev.length === state.children.length
      ) {
        let validDirty = 0;
        for (const index of state.dirtyIndices.items) {
          if (index >= 0 && index < state.children.length) validDirty += 1;
        }
        if (validDirty === 0) {
          clearDirtyIndices(state.dirtyIndices);
          local.set(state.node as object, prev);
          return prev;
        }
        const fullRebuildThresholdCount = Math.ceil(
          state.children.length * fullRebuildThreshold,
        );
        if (validDirty >= fullRebuildThresholdCount) {
          values = new Array(state.children.length);
          forceFullRebuild = true;
        } else {
          values = prev.slice();
        }
      } else {
        values = new Array(state.children.length);
        forceFullRebuild = true;
      }
      local.set(state.node as object, values);

      if (
        forceFullRebuild ||
        !prev ||
        state.dirtyStructure ||
        prev.length !== state.children.length
      ) {
        for (let i = 0; i < state.children.length; i += 1) {
          defineLazyValue(values, i, () =>
            deps.getNodeValue(state.children[i], local),
          );
        }
      } else {
        for (const index of state.dirtyIndices.items) {
          if (index < 0 || index >= state.children.length) continue;
          defineLazyValue(values, index, () =>
            deps.getNodeValue(state.children[index], local),
          );
        }
      }

      for (let i = 0; i < state.children.length; i += 1) {
        if (i in values) void values[i];
      }
      clearDirtyIndices(state.dirtyIndices);
      state.dirtyStructure = false;
      const frozen = freezeRootShallow(values) as unknown[];
      local.set(state.node as object, frozen);
      return frozen;
    });
}
