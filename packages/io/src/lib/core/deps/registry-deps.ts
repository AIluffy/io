import type { TreeContext, TreeNode } from '../io-tree-types.js';
import type { NodePath } from '../path-trie.js';

export type RegistryDeps = {
  registerSubtree: (ctx: TreeContext, path: NodePath, node: TreeNode) => void;
  unregisterSubtree: (ctx: TreeContext, path: NodePath, node: TreeNode) => void;
  rebuildSubtreeMapping: (
    state: { ctx: TreeContext; path: NodePath },
    node: TreeNode,
  ) => void;
  setPathNode: (ctx: TreeContext, path: NodePath, node: TreeNode) => void;
  getPathNode: (ctx: TreeContext, path: NodePath) => TreeNode | undefined;
};
