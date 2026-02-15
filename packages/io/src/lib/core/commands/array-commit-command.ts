import type { IoPatch } from '../../utils/types.js';
import type { CommitLayer, UtilsLayer } from '../types.js';
import type { TreeArrayState } from '../tree/io-tree-types.js';
import type { TreeCommand } from './command.js';

import { executeCommitCommand } from './commit-command.js';

type ArrayCommitCommandDeps = {
  snapshot: () => unknown[];
  createDraft: UtilsLayer['createDraft'];
  finishDraft: UtilsLayer['finishDraft'];
  applyArrayCommitDiff: CommitLayer['applyArrayCommitDiff'];
  commitDeps: Parameters<CommitLayer['applyArrayCommitDiff']>[3];
};

export class ArrayCommitCommand implements TreeCommand<TreeArrayState> {
  readonly op = 'commit' as const;

  constructor(
    private readonly fn: (draft: unknown[]) => void,
    private readonly deps: ArrayCommitCommandDeps,
  ) {}

  execute(state: TreeArrayState): IoPatch[] {
    return executeCommitCommand(state, {
      snapshot: this.deps.snapshot,
      createDraft: this.deps.createDraft,
      finishDraft: this.deps.finishDraft,
      runUserFn: (draft) => this.fn(draft as unknown[]),
      applyDiff: (currentState, before, next) =>
        this.deps.applyArrayCommitDiff(
          currentState as TreeArrayState,
          before,
          next as unknown[],
          this.deps.commitDeps,
        ),
    });
  }
}
