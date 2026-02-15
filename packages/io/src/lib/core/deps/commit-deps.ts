import type { IoPatch, IoUpdate } from '../../utils/types.js';

export type CommitDeps = {
  isPlainObject: (value: unknown) => boolean;
  cloneValue: (value: unknown) => unknown;
  createDraft: <T>(value: T) => T;
  finishDraft: <T>(draft: T) => T;
  createUpdate: (base: number, next: number, patches: IoPatch[]) => IoUpdate;
  applyScopeCommitDiff: typeof import('../commit.js').applyScopeCommitDiff;
  applyArrayCommitDiff: typeof import('../commit.js').applyArrayCommitDiff;
};
