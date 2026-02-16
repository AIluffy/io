import type { IoPatch } from '../../utils/types/types.js';
import type {
  InternalDeps,
  LifecycleDeps,
  SubscriptionDeps,
} from '../types.js';
import type { TreeNode, TreeScopeState, UnitInternal } from '../tree/io-tree-types.js';
import type { NodePath } from '../tree/path-trie.js';
import type { TreeCommand } from './command.js';

type ScopeMutateCommandDeps = {
  path: NodePath;
  isUnit: (value: unknown) => boolean;
  requireInternalOfKind: InternalDeps['requireInternalOfKind'];
  detachChildFromScope: LifecycleDeps['detachChildFromScope'];
  unregisterSubtree: (path: NodePath, node: TreeNode) => void;
  createTreeNode: (path: NodePath, initial: unknown) => TreeNode;
  attachChildToScope: LifecycleDeps['attachChildToScope'];
  markDirty: SubscriptionDeps['markDirty'];
};

export class ScopeMutateCommand implements TreeCommand<TreeScopeState> {
  readonly op = 'set' as const;

  constructor(
    private readonly deps: ScopeMutateCommandDeps,
    private readonly key: PropertyKey,
    private readonly next: unknown,
    private readonly options?: { emitUpdate?: boolean; emitValue?: boolean },
  ) {}

  execute(state: TreeScopeState): IoPatch[] | null {
    const existing = state.children.get(this.key);
    if (!existing)
      throw new Error(`ioTree scope: missing key ${String(this.key)}`);

    const emitValue = this.options?.emitValue !== false;
    if (this.deps.isUnit(existing)) {
      const internal = this.deps.requireInternalOfKind(
        existing,
        'unit',
        'ioTree scope: invalid unit internal',
      ) as UnitInternal;
      const before = internal.getValue();
      internal.setValue(this.next, {
        emitUpdate: false,
        emitValue,
      });
      const after = internal.getValue();
      if (Object.is(before, after)) return null;
      if (emitValue) {
        state.dirtyKeys.add(this.key);
      } else {
        this.deps.markDirty(state, this.key);
      }
      return [];
    }

    this.deps.detachChildFromScope(state, this.key);
    this.deps.unregisterSubtree([...this.deps.path, this.key], existing);
    const replaced = this.deps.createTreeNode(
      [...this.deps.path, this.key],
      this.next,
    );
    state.children.set(this.key, replaced);
    this.deps.attachChildToScope(state, this.key, replaced);
    state.dirtyKeys.add(this.key);
    return [];
  }
}
