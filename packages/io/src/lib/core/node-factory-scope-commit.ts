import { isLink } from '../utils/link.js';
import type { NodeFactoryDeps } from './node-factory-types.js';
import type { NodePath } from './path-trie.js';
import type {
  TreeArrayState,
  TreeContext,
  TreeNode,
  TreeScopeState,
  UnitInternal,
} from './io-tree-types.js';

type CreateScopeCommitOptions = {
  deps: NodeFactoryDeps;
  ctx: TreeContext;
  path: NodePath;
  state: TreeScopeState;
  createTreeNode: (
    ctx: TreeContext,
    path: NodePath,
    initial: unknown,
  ) => TreeNode;
  resolvePatchValue: (value: unknown) => unknown;
  snapshot: () => Record<string, unknown>;
  getNode: () => TreeNode;
};

export function createScopeCommit(
  options: CreateScopeCommitOptions,
): (fn: (draft: Record<string, unknown>) => void) => void {
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

  return (fn: (draft: Record<string, unknown>) => void): void => {
    try {
      const before = snapshot();
      const draft = deps.createDraft(before);
      fn(draft);
      const next = deps.finishDraft(draft);

      const nextAny = next as unknown as Record<PropertyKey, unknown>;
      for (const key of Reflect.ownKeys(nextAny)) {
        if (!Reflect.has(before as object, key))
          throw new Error(`ioTree scope: unknown key ${String(key)}`);
      }

      const baseRevision = state.revision;
      const { changed, patches } = deps.applyScopeCommitDiff(
        state,
        before,
        nextAny,
        {
          isPlainObject: deps.isPlainObject,
          isUnit: deps.isUnit,
          isLink,
          getInternalKind: (node: TreeNode) => deps.getInternal(node)?.kind,
          getScopeState: (node: TreeNode) =>
            deps.requireInternalOfKind(
              node,
              'scope',
              'ioTree commit: invalid scope internal',
            ) as TreeScopeState,
          getArrayState: (node: TreeNode) =>
            deps.requireInternalOfKind(
              node,
              'array',
              'ioTree commit: invalid array internal',
            ) as TreeArrayState,
          setUnitValue: (node: TreeNode, value: unknown) => {
            const internal = deps.requireInternalOfKind(
              node,
              'unit',
              'ioTree commit: invalid unit internal',
            ) as UnitInternal;
            internal.setValue(value, { emitUpdate: false, emitValue: true });
          },
          getNodeValue: (node: TreeNode) =>
            deps.getNodeValue(node, new WeakMap()),
          resolvePatchValue,
          createTreeNode: (absPath: NodePath, value: unknown) =>
            createTreeNode(ctx, absPath, value),
          detachChildFromScope: deps.detachChildFromScope,
          attachChildToScope: deps.attachChildToScope,
          detachChildFromArray: deps.detachChildFromArray,
          attachChildToArray: deps.attachChildToArray,
          unregisterSubtree: (absPath: NodePath, node: TreeNode) =>
            deps.unregisterSubtree(ctx, absPath, node),
          registerSubtree: (absPath: NodePath, node: TreeNode) =>
            deps.registerSubtree(ctx, absPath, node),
          getPathNode: (absPath: NodePath) => deps.getPathNode(ctx, absPath),
          emitScopeValue: deps.emitScopeValue,
          emitArrayValue: deps.emitArrayValue,
          markDirty: deps.markDirty,
          cloneValue: deps.cloneValue,
        },
      );

      if (!changed) return;
      state.revision += 1;
      state.valueEpoch += 1;
      deps.emitScopeUpdate(
        state,
        deps.createUpdate(baseRevision, state.revision, patches),
      );
      deps.emitScopeValue(state);
    } catch (error) {
      state.isCommitting = false;
      deps.emitError(getNode(), error, path, 'commit');
      throw error;
    }
  };
}
