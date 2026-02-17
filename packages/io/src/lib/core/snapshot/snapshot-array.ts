import type { TreeArrayState } from '../tree/io-tree-types.js';
import type { SnapshotCache } from './snapshot-scope.js';
import type { GetNodeValue } from './snapshot-scope.js';

import { freezeRootShallow } from '../../utils/immutable/immutable.js';
import { clearDirtyIndices } from '../mutation/dirty-indices.js';
import { createSnapshotCache } from './snapshot-cache.js';
import {
  CACHE_MISS,
  readCachedByVersion,
  updateCachedByVersion,
} from './versioned-cache.js';

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

    const prev = state.snapshotCache.hasValue ? state.snapshotCache.value : undefined;
    const hasDirtyIndices = state.dirtyIndices.items.length > 0;

    if (prev && !state.dirtyStructure && !hasDirtyIndices) {
      local.set(state.node as object, prev);
      return prev;
    }

    const total = state.children.length;
    let next: unknown[];
    const canIncremental =
      prev !== undefined && !state.dirtyStructure && prev.length === total;

    if (!canIncremental) {
      const values = new Array(total);
      local.set(state.node as object, values);
      for (let i = 0; i < total; i += 1) {
        values[i] = deps.getNodeValue(state.children[i], local);
      }
      next = values;
    } else {
      let validDirty = 0;
      for (const index of state.dirtyIndices.items) {
        if (index >= 0 && index < total) validDirty += 1;
      }
      if (validDirty === 0) {
        local.set(state.node as object, prev);
        next = prev;
      } else {
        const values = new Array(total);
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
        next = values;
      }
    }

    clearDirtyIndices(state.dirtyIndices);
    state.dirtyStructure = false;

    const value = freezeRootShallow(next);
    local.set(state.node as object, value);
    return updateCachedByVersion(state.snapshotCache, state.valueEpoch, value);
  };
}
