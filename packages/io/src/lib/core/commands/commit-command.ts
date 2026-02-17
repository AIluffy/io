import type { IoPatch } from '../../utils/types/types.js';
import type { Revision, ValueEpoch } from '../../utils/types/branded.js';
import type { TreeCommand } from './command.js';
import { profileEnd, profileStart } from '../mutation/commit-profile.js';

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
  const totalStart = profileStart();

  const snapshotStart = profileStart();
  const before = deps.snapshot();
  profileEnd('commit.snapshot', snapshotStart);

  const createDraftStart = profileStart();
  const draft = deps.createDraft(before);
  profileEnd('commit.createDraft', createDraftStart);

  const userFnStart = profileStart();
  deps.runUserFn(draft);
  profileEnd('commit.runUserFn', userFnStart);

  const finishDraftStart = profileStart();
  const next = deps.finishDraft(draft) as TData;
  profileEnd('commit.finishDraft', finishDraftStart);

  const validateStart = profileStart();
  deps.validateNext?.(before, next);
  profileEnd('commit.validateNext', validateStart);

  const applyDiffStart = profileStart();
  const { changed, patches } = deps.applyDiff(state, before, next);
  profileEnd('commit.applyDiff.total', applyDiffStart);
  profileEnd('commit.total', totalStart);

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
