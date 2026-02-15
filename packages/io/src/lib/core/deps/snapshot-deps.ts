import type {
  TreeArrayState,
  TreeNode,
  TreeScopeState,
} from '../io-tree-types.js';
import type { SnapshotCache } from '../snapshot-cache.js';

export type SnapshotDeps = {
  getScopeSnapshot: (state: TreeScopeState) => Record<string, unknown>;
  getArraySnapshot: (state: TreeArrayState) => unknown[];
  getNodeValue: (node: TreeNode, cache: SnapshotCache) => unknown;
};
