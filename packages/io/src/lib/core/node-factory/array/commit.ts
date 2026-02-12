import { isLink } from '../../../utils/link.js';
import type { NodeFactoryDeps } from '../types.js';
import type { NodePath } from '../../path-trie.js';
import type {
  TreeArrayInternal,
  TreeArrayState,
  TreeContext,
  TreeNode,
  TreeScopeInternal,
  UnitInternal,
} from '../../io-tree-types.js';

type CreateArrayCommitOptions = {
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
  getNode: () => TreeNode;
};

export function createArrayCommit(
  options: CreateArrayCommitOptions,
): (fn: (draft: unknown[]) => void) => void {
  const {
    deps,
    ctx,
    path,
    state,
    createTreeNode,
    resolvePatchValue,
    snapshot,
    getNode,
  } = options;

  return (fn: (draft: unknown[]) => void): void => {
    state.isCommitting = true;
    try {
      const before = snapshot();
      const draft = deps.createDraft(before);
      fn(draft);
      const next = deps.finishDraft(draft);

      const baseRevision = state.revision;
      const { changed, patches } = deps.applyArrayCommitDiff(
        state,
        before,
        next as unknown[],
        {
          isPlainObject: deps.isPlainObject,
          isUnit: deps.isUnit,
          isLink,
          getInternalKind: (n: TreeNode) => deps.getInternal(n)?.kind,
          getScopeState: (n: TreeNode) =>
            (
              deps.requireInternalOfKind(
              n,
              'scope',
              'ioTree commit: invalid scope internal',
              ) as TreeScopeInternal
            ).getState(),
          getArrayState: (n: TreeNode) =>
            (
              deps.requireInternalOfKind(
              n,
              'array',
              'ioTree commit: invalid array internal',
              ) as TreeArrayInternal
            ).getState(),
          setUnitValue: (n: TreeNode, value: unknown) => {
            const internal = deps.requireInternalOfKind(
              n,
              'unit',
              'ioTree commit: invalid unit internal',
            ) as UnitInternal;
            internal.setValue(value, { emitUpdate: false, emitValue: true });
          },
          getNodeValue: (n: TreeNode) =>
            deps.getNodeValue(n, new WeakMap()),
          resolvePatchValue,
          createTreeNode: (absPath: NodePath, value: unknown) =>
            createTreeNode(ctx, absPath, value),
          detachChildFromScope: deps.detachChildFromScope,
          attachChildToScope: deps.attachChildToScope,
          detachChildFromArray: deps.detachChildFromArray,
          attachChildToArray: deps.attachChildToArray,
          unregisterSubtree: (absPath: NodePath, n: TreeNode) =>
            deps.unregisterSubtree(ctx, absPath, n),
          registerSubtree: (absPath: NodePath, n: TreeNode) =>
            deps.registerSubtree(ctx, absPath, n),
          getPathNode: (absPath: NodePath) => deps.getPathNode(ctx, absPath),
          emitScopeValue: deps.emitScopeValue,
          emitArrayValue: deps.emitArrayValue,
          markDirty: deps.markDirty,
          cloneValue: deps.cloneValue,
        },
      );

      if (!changed) return;
      state.revision += 1;
      deps.emitArrayUpdate(
        state,
        deps.createUpdate(baseRevision, state.revision, patches),
      );
      deps.emitArrayValue(state);
    } catch (error) {
      deps.emitError(getNode(), error, path, 'commit');
      throw error;
    } finally {
      state.isCommitting = false;
    }
  };
}
