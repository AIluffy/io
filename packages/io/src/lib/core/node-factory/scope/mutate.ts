import type { NodeFactoryDeps } from '../types.js';
import type { NodePath } from '../../path-trie.js';
import type {
  TreeContext,
  TreeNode,
  TreeScopeState,
  UnitInternal,
} from '../../io-tree-types.js';

type CreateScopeMutationsOptions = {
  deps: NodeFactoryDeps;
  ctx: TreeContext;
  path: NodePath;
  state: TreeScopeState;
  createTreeNode: (
    ctx: TreeContext,
    path: NodePath,
    initial: unknown,
  ) => TreeNode;
  getNode: () => TreeNode;
};

export function createScopeMutations(
  options: CreateScopeMutationsOptions,
): {
  applySet: (
    key: PropertyKey,
    next: unknown,
    options?: { emitUpdate?: boolean; emitValue?: boolean },
  ) => void;
} {
  const { deps, ctx, path, state, createTreeNode, getNode } = options;

  const applySet = (
    key: PropertyKey,
    next: unknown,
    options?: { emitUpdate?: boolean; emitValue?: boolean },
  ): void => {
    try {
      const existing = state.children.get(key);
      if (!existing)
        throw new Error(`ioTree scope: missing key ${String(key)}`);

      if (deps.isUnit(existing)) {
        const internal = deps.requireInternalOfKind(
          existing,
          'unit',
          'ioTree scope: invalid unit internal',
        ) as UnitInternal;
        const before = internal.getValue();
        const emitValue = options?.emitValue !== false;
        internal.setValue(next, {
          emitUpdate: false,
          emitValue,
        });
        const after = internal.getValue();
        if (!Object.is(before, after)) {
          state.revision += 1;
          if (!emitValue) {
            state.valueEpoch += 1;
            deps.markDirty(state, key);
          }
        }
        return;
      }

      deps.detachChildFromScope(state, key);
      deps.unregisterSubtree(ctx, [...path, key], existing);
      const replaced = createTreeNode(ctx, [...path, key], next);
      state.children.set(key, replaced);
      deps.attachChildToScope(state, key, replaced);
      state.revision += 1;
      state.dirtyKeys.add(key);
      state.valueEpoch += 1;
      if (options?.emitValue !== false) deps.emitScopeValue(state);
    } catch (error) {
      deps.emitError(getNode(), error, [...path, key], 'set');
      throw error;
    }
  };

  return { applySet };
}
