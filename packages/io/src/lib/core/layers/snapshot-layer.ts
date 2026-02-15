import type { SnapshotDeps } from '../deps/snapshot-deps.js';

import { createArraySnapshotReader } from '../snapshot/snapshot-array.js';
import {
  createNodeValueReader,
  createScopeSnapshotReader,
} from '../snapshot/snapshot-scope.js';

export function createSnapshotLayer(): SnapshotDeps {
  let getNodeValue: SnapshotDeps['getNodeValue'] = () => {
    throw new Error('ioTree snapshot layer: getNodeValue not initialized');
  };

  const getScopeSnapshot = createScopeSnapshotReader({
    getNodeValue: (node, cache) => getNodeValue(node, cache),
  });

  const getArraySnapshot = createArraySnapshotReader({
    getNodeValue: (node, cache) => getNodeValue(node, cache),
  });

  getNodeValue = createNodeValueReader({
    getScopeSnapshot,
    getArraySnapshot,
  });

  return {
    getScopeSnapshot,
    getArraySnapshot,
    getNodeValue,
  };
}
