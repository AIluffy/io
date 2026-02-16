import type { TreeDeps } from '../../types.js';
import type { NodePath } from '../../tree/path-trie.js';
import type {
  TreeArrayState,
  TreeContext,
  TreeInternal,
  TreeNode,
} from '../../tree/io-tree-types.js';

import { createArrayCommit } from './commit.js';
import { createArrayIndexMutation } from './index-mutation.js';
import { createArrayStructuralMutations } from './structural-mutations.js';

export type CreateArrayMutationsOptions = {
  deps: TreeDeps;
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

type CreateArrayOpsOptions = CreateArrayMutationsOptions;

export function createArrayOps(options: CreateArrayOpsOptions): {
  internal: TreeInternal;
  setIndex: (
    index: number,
    next: unknown,
    options?: { emitUpdate?: boolean; emitValue?: boolean },
  ) => void;
  set: (next: unknown[]) => void;
  push: (...items: unknown[]) => void;
  pop: () => unknown;
  splice: (start: number, deleteCount: number, ...items: unknown[]) => void;
  sort: (compareFn?: (a: unknown, b: unknown) => number) => void;
  commit: (fn: (draft: unknown[]) => void) => void;
  reduce: <R>(
    reducer: (acc: R, item: TreeNode, index: number) => R,
    initialValue: R,
  ) => R;
  iterator: () => Generator<TreeNode>;
} {
  const {
    deps,
    ctx,
    path,
    state,
    createTreeNode,
    resolvePatchValue,
    snapshot,
    rebuildMapping,
    getNode,
  } = options;

  const { setIndex } = createArrayIndexMutation({
    deps,
    ctx,
    path,
    state,
    createTreeNode,
    resolvePatchValue,
    snapshot,
    rebuildMapping,
    getNode,
  });
  const {
    applySplice,
    applySortOrder,
    set,
    push,
    pop,
    splice,
    sort,
  } = createArrayStructuralMutations({
    deps,
    ctx,
    path,
    state,
    createTreeNode,
    resolvePatchValue,
    snapshot,
    rebuildMapping,
    getNode,
  });

  const commit = createArrayCommit({
    deps,
    ctx,
    path,
    state,
    createTreeNode,
    resolvePatchValue,
    snapshot,
    getNode,
  });

  const reduce = <R>(
    reducer: (acc: R, item: TreeNode, index: number) => R,
    initialValue: R,
  ): R => {
    let acc = initialValue;
    for (let i = 0; i < state.children.length; i += 1)
      acc = reducer(acc, state.children[i], i);
    return acc;
  };

  const iterator = function* (): Generator<TreeNode> {
    for (const child of state.children) yield child;
  };

  const internal: TreeInternal = {
    kind: 'array',
    getChild: (index: number) => state.children[index],
    setIndex,
    applySplice,
    applySortOrder,
    getState: () => state,
  };

  return {
    internal,
    setIndex,
    set,
    push,
    pop,
    splice,
    sort,
    commit,
    reduce,
    iterator,
  };
}
