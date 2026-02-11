import type { NodeFactoryDeps } from '../types.js';
import type { NodePath } from '../../path-trie.js';
import type {
  TreeArrayState,
  TreeContext,
  TreeNode,
} from '../../io-tree-types.js';

export type CreateArrayMutationsOptions = {
  deps: NodeFactoryDeps;
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
