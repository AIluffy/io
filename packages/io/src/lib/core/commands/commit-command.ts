import type { IoPatch } from '../../utils/types.js';
import type { Revision, ValueEpoch } from '../../utils/branded.js';

type CommitState = {
  revision: Revision;
  valueEpoch: ValueEpoch;
};

type CommitDiffResult = {
  changed: boolean;
  patches: IoPatch[];
};

export type CommitCommandDeps<TBefore, TNext> = {
  snapshot: () => TBefore;
  createDraft: (value: TBefore) => unknown;
  finishDraft: (draft: unknown) => unknown;
  runUserFn: (draft: unknown) => void;
  validateNext?: (before: TBefore, next: TNext) => void;
  applyDiff: (state: CommitState, before: TBefore, next: TNext) => CommitDiffResult;
};

export function executeCommitCommand<TBefore, TNext>(
  state: CommitState,
  deps: CommitCommandDeps<TBefore, TNext>,
): IoPatch[] | null {
  const before = deps.snapshot();
  const draft = deps.createDraft(before);
  deps.runUserFn(draft);
  const next = deps.finishDraft(draft) as TNext;
  deps.validateNext?.(before, next);

  const { changed, patches } = deps.applyDiff(state, before, next);
  if (!changed) return null;
  return patches;
}
