import type { IoPatch } from '../../utils/types.js';
import type { NodeFactoryDeps } from '../node-factory/types.js';
import type { TreeNode, TreeScopeState, UnitInternal } from '../io-tree-types.js';
import type { NodePath } from '../path-trie.js';
import type { TreeCommand } from './command.js';

import { SkipExecution } from './command.js';

type ScopeCommitDeps = {
  snapshot: () => Record<string, unknown>;
  createDraft: NodeFactoryDeps['createDraft'];
  finishDraft: NodeFactoryDeps['finishDraft'];
  applyScopeCommitDiff: NodeFactoryDeps['applyScopeCommitDiff'];
  commitDeps: Parameters<NodeFactoryDeps['applyScopeCommitDiff']>[3];
};

type ScopeMutateCommandDeps = {
  path: NodePath;
  isUnit: NodeFactoryDeps['isUnit'];
  requireInternalOfKind: NodeFactoryDeps['requireInternalOfKind'];
  detachChildFromScope: NodeFactoryDeps['detachChildFromScope'];
  unregisterSubtree: (path: NodePath, node: TreeNode) => void;
  createTreeNode: (path: NodePath, initial: unknown) => TreeNode;
  attachChildToScope: NodeFactoryDeps['attachChildToScope'];
  markDirty: NodeFactoryDeps['markDirty'];
};

export class ScopeCommitCommand implements TreeCommand<TreeScopeState> {
  readonly op = 'commit' as const;

  constructor(
    private readonly fn: (draft: Record<string, unknown>) => void,
    private readonly deps: ScopeCommitDeps,
  ) {}

  execute(state: TreeScopeState): IoPatch[] {
    const before = this.deps.snapshot();
    const draft = this.deps.createDraft(before);
    this.fn(draft);
    const next = this.deps.finishDraft(draft);

    const nextAny = next as unknown as Record<PropertyKey, unknown>;
    for (const key of Reflect.ownKeys(nextAny)) {
      if (!Reflect.has(before as object, key))
        throw new Error(`ioTree scope: unknown key ${String(key)}`);
    }

    const { changed, patches } = this.deps.applyScopeCommitDiff(
      state,
      before,
      nextAny,
      this.deps.commitDeps,
    );
    if (!changed) {
      state.revision -= 1;
      throw new SkipExecution();
    }

    // Commit diff already bumps valueEpoch when changed.
    state.valueEpoch -= 1;
    return patches;
  }
}

export class ScopeMutateCommand implements TreeCommand<TreeScopeState> {
  readonly op = 'set' as const;

  constructor(
    private readonly deps: ScopeMutateCommandDeps,
    private readonly key: PropertyKey,
    private readonly next: unknown,
    private readonly options?: { emitUpdate?: boolean; emitValue?: boolean },
  ) {}

  execute(state: TreeScopeState): IoPatch[] {
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
      if (Object.is(before, after)) {
        state.revision -= 1;
        throw new SkipExecution();
      }
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
