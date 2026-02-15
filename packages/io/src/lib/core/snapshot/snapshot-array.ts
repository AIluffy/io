import type { TreeArrayState } from '../tree/io-tree-types.js';
import type { GetNodeValue, SnapshotCache } from './snapshot-scope.js';

import { freezeRootShallow } from '../../utils/snapshot.js';
import {
  CACHE_MISS,
  readCachedByVersion,
  updateCachedByVersion,
} from '../../container/cache.js';
import { clearDirtyIndices } from '../mutation/dirty-indices.js';
import { createSnapshotCache } from './snapshot-cache.js';

type ArraySnapshotReader = (
  state: TreeArrayState,
  cache?: SnapshotCache,
) => unknown[];

export function createArraySnapshotReader(deps: {
  getNodeValue: GetNodeValue;
}): ArraySnapshotReader {
  return (state: TreeArrayState, cache?: SnapshotCache): unknown[] => {
    const snapshot = readCachedByVersion(state.snapshotCache, state.valueEpoch);
    if (snapshot !== CACHE_MISS) return snapshot as unknown[];

    const local = cache ?? createSnapshotCache();
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
    if (
      prev &&
      !state.dirtyStructure &&
      prev.length === state.children.length
    ) {
      const total = state.children.length;
      let validDirty = 0;
      for (const index of state.dirtyIndices.items) {
        if (index >= 0 && index < total) validDirty += 1;
      }
      if (validDirty === 0) {
        clearDirtyIndices(state.dirtyIndices);
        local.set(state.node as object, prev);
        return prev;
      }

      values = new Array(total);
      local.set(state.node as object, values);
      const marks = state.dirtyIndices.marks;
      const version = state.dirtyIndices.version;
      for (let i = 0; i < total; i += 1) {
        if (marks[i] === version) {
          values[i] = deps.getNodeValue(state.children[i], local);
        } else {
          values[i] = prev[i];
        }
      }
    } else {
      values = new Array(state.children.length);
      local.set(state.node as object, values);
      for (let i = 0; i < state.children.length; i += 1) {
        values[i] = deps.getNodeValue(state.children[i], local);
      }
    }
    clearDirtyIndices(state.dirtyIndices);
    state.dirtyStructure = false;
    const frozen = freezeRootShallow(values) as unknown[];
    local.set(state.node as object, frozen);
    return updateCachedByVersion(state.snapshotCache, state.valueEpoch, frozen);
  };
}
