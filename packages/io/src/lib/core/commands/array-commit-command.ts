import type { IoPatch } from '../../utils/types.js';
import type { NodeCreationDeps } from '../types.js';
import type { TreeArrayState } from '../tree/io-tree-types.js';
import type { TreeCommand } from './command.js';

import { previousEpoch, previousRevision } from '../../utils/branded.js';
import { SkipExecution } from './command.js';

type ArrayCommitCommandDeps = {
  snapshot: () => unknown[];
  createDraft: NodeCreationDeps['createDraft'];
  finishDraft: NodeCreationDeps['finishDraft'];
  applyArrayCommitDiff: NodeCreationDeps['applyArrayCommitDiff'];
  commitDeps: Parameters<NodeCreationDeps['applyArrayCommitDiff']>[3];
};

export class ArrayCommitCommand implements TreeCommand<TreeArrayState> {
  readonly op = 'commit' as const;

  constructor(
    private readonly fn: (draft: unknown[]) => void,
    private readonly deps: ArrayCommitCommandDeps,
  ) {}

  execute(state: TreeArrayState): IoPatch[] {
    const before = this.deps.snapshot();
    const draft = this.deps.createDraft(before);
    this.fn(draft);
    const next = this.deps.finishDraft(draft);

    const { changed, patches } = this.deps.applyArrayCommitDiff(
      state,
      before,
      next as unknown[],
      this.deps.commitDeps,
    );
    if (!changed) {
      state.revision = previousRevision(state.revision);
      throw new SkipExecution();
    }

    // Commit diff already bumps valueEpoch when changed.
    state.valueEpoch = previousEpoch(state.valueEpoch);
    return patches;
  }
}
