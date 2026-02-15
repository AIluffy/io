import type { NodeCreationDeps } from '../../deps/node-creation-deps.js';
import type { NodePath } from '../../tree/path-trie.js';
import type {
  TreeArrayState,
  TreeContext,
  TreeNode,
} from '../../tree/io-tree-types.js';

export type CreateArrayMutationsOptions = {
  deps: NodeCreationDeps;
  ctx: TreeContext;
  path: NodePath;
  state: TreeArrayState;
  createTreeNode: (
    ctx: TreeContext,
    path: NodePath,
    initial: unknown,
  ) => TreeNode;
  resolvePatchValue: (value: unknown) => unknown;
  snapshot: () => unknown[];
  rebuildMapping: () => void;
  getNode: () => TreeNode;
};
