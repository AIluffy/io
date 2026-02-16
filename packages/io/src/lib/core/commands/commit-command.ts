import type { IoPatch } from '../../utils/types/types.js';
import type { Revision, ValueEpoch } from '../../utils/types/branded.js';
import type { TreeCommand } from './command.js';

type CommitState = {
  revision: Revision;
  valueEpoch: ValueEpoch;
};

type CommitDiffResult = {
  changed: boolean;
  patches: IoPatch[];
};

export type CommitCommandDeps<TData> = {
  snapshot: () => TData;
  createDraft: (value: TData) => unknown;
  finishDraft: (draft: unknown) => unknown;
  validateNext?: (before: TData, next: TData) => void;
  applyDiff: (state: CommitState, before: TData, next: TData) => CommitDiffResult;
};

type ExecuteCommitCommandDeps<TData> = CommitCommandDeps<TData> & {
  runUserFn: (draft: unknown) => void;
};

export function executeCommitCommand<TData>(
  state: CommitState,
  deps: ExecuteCommitCommandDeps<TData>,
): IoPatch[] | null {
  const before = deps.snapshot();
  const draft = deps.createDraft(before);
  deps.runUserFn(draft);
  const next = deps.finishDraft(draft) as TData;
  deps.validateNext?.(before, next);

  const { changed, patches } = deps.applyDiff(state, before, next);
  if (!changed) return null;
  return patches;
}

export class CommitCommand<TState, TData> implements TreeCommand<TState> {
  readonly op = 'commit' as const;

  constructor(
    private readonly fn: (draft: TData) => void,
    private readonly deps: CommitCommandDeps<TData>,
  ) {}

  execute(state: TState): IoPatch[] | null {
    return executeCommitCommand(state as CommitState, {
      ...this.deps,
      runUserFn: (draft) => this.fn(draft as TData),
    });
  }
}
