import type { TreeArrayState } from '../tree/io-tree-types.js';
import type { SnapshotCache } from './snapshot-scope.js';
import type { GetNodeValue } from './snapshot-scope.js';

import { clearDirtyIndices } from '../mutation/dirty-indices.js';
import { createSnapshotReader } from './create-snapshot-reader.js';

type ArraySnapshotReader = (
  state: TreeArrayState,
  cache?: SnapshotCache,
) => unknown[];

export function createArraySnapshotReader(deps: {
  getNodeValue: GetNodeValue;
}): ArraySnapshotReader {
  const buildFullSnapshot = (
    state: TreeArrayState,
    getNodeValue: GetNodeValue,
    cache: SnapshotCache,
  ): unknown[] => {
    const total = state.children.length;
    const values = new Array(total);
    cache.set(state.node as object, values);
    for (let i = 0; i < total; i += 1) {
      values[i] = getNodeValue(state.children[i], cache);
    }
    return values;
  };

  const readArraySnapshot = createSnapshotReader<TreeArrayState, unknown[]>({
    hasDirtySegments: (state) => state.dirtyIndices.items.length > 0,
    buildFull: buildFullSnapshot,
    buildIncremental: (state, prev, getNodeValue, cache) => {
      const total = state.children.length;
      if (prev.length !== total) {
        return buildFullSnapshot(state, getNodeValue, cache);
      }

      let validDirty = 0;
      for (const index of state.dirtyIndices.items) {
        if (index >= 0 && index < total) validDirty += 1;
      }
      if (validDirty === 0) return prev;

      const values = new Array(total);
      cache.set(state.node as object, values);
      const marks = state.dirtyIndices.marks;
      const version = state.dirtyIndices.version;
      for (let i = 0; i < total; i += 1) {
        if (marks[i] === version) {
          values[i] = getNodeValue(state.children[i], cache);
        } else {
          values[i] = prev[i];
        }
      }
      return values;
    },
    clearDirty: (state) => {
      clearDirtyIndices(state.dirtyIndices);
    },
  });

  return (state: TreeArrayState, cache?: SnapshotCache): unknown[] =>
    readArraySnapshot(state, deps.getNodeValue, cache);
}
