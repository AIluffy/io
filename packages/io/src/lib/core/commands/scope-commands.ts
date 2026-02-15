import type { IoPatch } from '../../utils/types.js';
import type { NodeCreationDeps } from '../types.js';
import type { TreeNode, TreeScopeState, UnitInternal } from '../tree/io-tree-types.js';
import type { NodePath } from '../tree/path-trie.js';
import type { TreeCommand } from './command.js';

import { previousRevision } from '../../utils/branded.js';
import { executeCommitCommand } from './commit-command.js';
import { SkipExecution } from './command.js';

type ScopeCommitDeps = {
  snapshot: () => Record<string, unknown>;
  createDraft: NodeCreationDeps['createDraft'];
  finishDraft: NodeCreationDeps['finishDraft'];
  applyScopeCommitDiff: NodeCreationDeps['applyScopeCommitDiff'];
  commitDeps: Parameters<NodeCreationDeps['applyScopeCommitDiff']>[3];
};

type ScopeMutateCommandDeps = {
  path: NodePath;
  isUnit: NodeCreationDeps['isUnit'];
  requireInternalOfKind: NodeCreationDeps['requireInternalOfKind'];
  detachChildFromScope: NodeCreationDeps['detachChildFromScope'];
  unregisterSubtree: (path: NodePath, node: TreeNode) => void;
  createTreeNode: (path: NodePath, initial: unknown) => TreeNode;
  attachChildToScope: NodeCreationDeps['attachChildToScope'];
  markDirty: NodeCreationDeps['markDirty'];
};

export class ScopeCommitCommand implements TreeCommand<TreeScopeState> {
  readonly op = 'commit' as const;

  constructor(
    private readonly fn: (draft: Record<string, unknown>) => void,
    private readonly deps: ScopeCommitDeps,
  ) {}

  execute(state: TreeScopeState): IoPatch[] {
    return executeCommitCommand(state, {
      snapshot: this.deps.snapshot,
      createDraft: this.deps.createDraft,
      finishDraft: this.deps.finishDraft,
      runUserFn: (draft) => this.fn(draft as Record<string, unknown>),
      validateNext: (before, next) => {
        for (const key of Reflect.ownKeys(next as Record<PropertyKey, unknown>)) {
          if (!Reflect.has(before as object, key))
            throw new Error(`ioTree scope: unknown key ${String(key)}`);
        }
      },
      applyDiff: (currentState, before, next) =>
        this.deps.applyScopeCommitDiff(
          currentState as TreeScopeState,
          before,
          next as Record<PropertyKey, unknown>,
          this.deps.commitDeps,
        ),
    });
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
        state.revision = previousRevision(state.revision);
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
