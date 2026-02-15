import type {
  TreeArrayState,
  TreeNode,
  TreeScopeState,
} from '../io-tree-types.js';

export type SnapshotDeps = {
  getScopeSnapshot: (state: TreeScopeState) => Record<string, unknown>;
  getArraySnapshot: (state: TreeArrayState) => unknown[];
  getNodeValue: (node: TreeNode, cache: WeakMap<object, unknown>) => unknown;
};
