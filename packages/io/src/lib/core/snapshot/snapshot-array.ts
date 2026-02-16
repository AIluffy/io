import type { TreeArrayState } from '../tree/io-tree-types.js';
import type { SnapshotCache } from './snapshot-scope.js';
import type { GetNodeValue } from './create-snapshot-reader.js';

import { clearDirtyIndices } from '../mutation/dirty-indices.js';
import { createSnapshotReader } from './create-snapshot-reader.js';

type ArraySnapshotReader = (
  state: TreeArrayState,
  cache?: SnapshotCache,
) => unknown[];

export function createArraySnapshotReader(deps: {
  getNodeValue: GetNodeValue;
}): ArraySnapshotReader {
  const readSnapshot = createSnapshotReader<TreeArrayState, unknown[]>({
    hasDirtySegments: (state) => state.dirtyIndices.items.length > 0,
    buildFull: (state, getNodeValue, cache) => {
      const values = new Array(state.children.length);
      cache.set(state.node as object, values);
      for (let i = 0; i < state.children.length; i += 1) {
        values[i] = getNodeValue(state.children[i], cache);
      }
      return values;
    },
    buildIncremental: (state, prev, getNodeValue, cache) => {
      if (prev.length !== state.children.length) {
        const values = new Array(state.children.length);
        cache.set(state.node as object, values);
        for (let i = 0; i < state.children.length; i += 1) {
          values[i] = getNodeValue(state.children[i], cache);
        }
        return values;
      }

      const total = state.children.length;
      let validDirty = 0;
      for (const index of state.dirtyIndices.items) {
        if (index >= 0 && index < total) validDirty += 1;
      }
      if (validDirty === 0) {
        cache.set(state.node as object, prev);
        return prev;
      }

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
    readSnapshot(state, deps.getNodeValue, cache);
}
