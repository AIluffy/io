import type { TreeContext, TreeNode } from '../tree/io-tree-types.js';
import type { NodePath } from '../tree/path-trie.js';

import {
  getPathNode as getPathNodeWithAccess,
  rebuildSubtreeMapping as rebuildSubtreeMappingWithAccess,
  registerSubtree as registerSubtreeWithAccess,
  setPathNode as setPathNodeWithAccess,
  unregisterSubtree as unregisterSubtreeWithAccess,
} from '../tree/path-trie.js';
import {
  getTreeInternal,
  isArrayInternal,
  isScopeInternal,
} from '../snapshot/snapshot-scope.js';

type SubtreeState = { path: NodePath };

export type RegistryLayer = {
  registerSubtree: (path: NodePath, node: TreeNode) => void;
  unregisterSubtree: (path: NodePath, node: TreeNode) => void;
  rebuildSubtreeMapping: (state: SubtreeState, node: TreeNode) => void;
  setPathNode: (path: NodePath, node: TreeNode) => void;
  getPathNode: (path: NodePath) => TreeNode | undefined;
};

const subtreeAccess = {
  getScopeChildren(node: TreeNode) {
    const internal = getTreeInternal(node);
    if (!isScopeInternal(internal)) return undefined;
    return internal.getState().children.entries();
  },
  getArrayChildren(node: TreeNode) {
    const internal = getTreeInternal(node);
    if (!isArrayInternal(internal)) return undefined;
    return internal.getState().children;
  },
};

export function createRegistryLayer(ctx: TreeContext): RegistryLayer {
  const registerSubtree = (path: NodePath, node: TreeNode): void => {
    registerSubtreeWithAccess(ctx, path, node, subtreeAccess);
  };

  const unregisterSubtree = (path: NodePath, node: TreeNode): void => {
    unregisterSubtreeWithAccess(ctx, path, node, subtreeAccess);
  };

  const rebuildSubtreeMapping = (state: SubtreeState, node: TreeNode): void => {
    rebuildSubtreeMappingWithAccess(
      { ctx, path: state.path },
      node,
      subtreeAccess,
    );
  };

  const setPathNode = (path: NodePath, node: TreeNode): void => {
    setPathNodeWithAccess(ctx, path, node);
  };

  const getPathNode = (path: NodePath): TreeNode | undefined =>
    getPathNodeWithAccess(ctx, path);

  return {
    registerSubtree,
    unregisterSubtree,
    rebuildSubtreeMapping,
    setPathNode,
    getPathNode,
  };
}
