import type { IoPatch } from '../../utils/types/types.js';
import {
  createApplyArrayDiff,
  createRebuildArrayChildren,
} from './array-diff.js';
import {
  createApplyNodeDiff,
  createReplaceChild,
  toRecord,
  type ArrayStateLike,
  type DiffChildFn,
  type DiffOperationDeps,
  type ScopeStateLike,
} from './diff-shared.js';
import { createApplyScopeDiff } from './scope-diff.js';

type CommitResult = { changed: boolean; patches: IoPatch[] };

/**
 * Creates recursive diff appliers that mutate the live tree in-place while
 * accumulating deterministic patch records.
 */
function createDiffHelpers<
  TNode,
  TScopeState extends ScopeStateLike<TNode>,
  TArrayState extends ArrayStateLike<TNode>,
>(
  deps: DiffOperationDeps<TNode, TScopeState, TArrayState>,
  patches: IoPatch[],
) {
  const replaceChild = createReplaceChild(deps, patches);

  const diffChild: DiffChildFn<TNode, TScopeState, TArrayState> = (
    parentState,
    segment,
    node,
    prev,
    nextValue,
    relPath,
    markParentDirty,
  ) => {
    if (deps.isPlainObject(prev) && deps.isPlainObject(nextValue)) {
      const kind = deps.getInternalKind(node);
      if (kind === 'scope') {
        const childState = deps.getScopeState(node);
        const childChanged = applyScopeDiff(
          childState,
          toRecord(prev),
          toRecord(nextValue),
          relPath,
        );
        if (childChanged) deps.emitScopeValue(childState);
        if (childChanged && markParentDirty)
          deps.markDirty(parentState, segment);
        return childChanged;
      }
    }

    if (Array.isArray(prev) && Array.isArray(nextValue)) {
      const kind = deps.getInternalKind(node);
      if (kind === 'array') {
        const childState = deps.getArrayState(node);
        const childChanged = applyArrayDiff(
          childState,
          prev,
          nextValue,
          relPath,
        );
        if (childChanged) deps.emitArrayValue(childState);
        if (childChanged && markParentDirty)
          deps.markDirty(parentState, segment);
        return childChanged;
      }
    }

    return undefined;
  };

  const applyNodeDiff = createApplyNodeDiff(
    deps,
    patches,
    diffChild,
    replaceChild,
  );
  const rebuildArrayChildren = createRebuildArrayChildren(deps, patches);
  const applyScopeDiff = createApplyScopeDiff(diffChild, applyNodeDiff);
  const applyArrayDiff = createApplyArrayDiff(
    diffChild,
    applyNodeDiff,
    rebuildArrayChildren,
  );

  return { applyScopeDiff, applyArrayDiff, applyNodeDiff };
}

/**
 * Entry point for scope commit diff.
 *
 * @param state Scope state being mutated.
 * @param before Snapshot before mutation.
 * @param next Snapshot after mutation.
 * @returns `{ changed, patches }` where patches replay the same mutation.
 */
export function applyScopeCommitDiff<
  TNode,
  TScopeState extends ScopeStateLike<TNode>,
  TArrayState extends ArrayStateLike<TNode>,
>(
  state: TScopeState,
  before: Record<PropertyKey, unknown>,
  next: Record<PropertyKey, unknown>,
  deps: DiffOperationDeps<TNode, TScopeState, TArrayState>,
): CommitResult {
  const patches: IoPatch[] = [];
  const helpers = createDiffHelpers(deps, patches);
  const changed = helpers.applyScopeDiff(state, before, next, []);
  return { changed, patches };
}

/**
 * Entry point for array commit diff.
 *
 * @param state Array state being mutated.
 * @param before Snapshot before mutation.
 * @param next Snapshot after mutation.
 * @returns `{ changed, patches }` where patches replay the same mutation.
 */
export function applyArrayCommitDiff<
  TNode,
  TScopeState extends ScopeStateLike<TNode>,
  TArrayState extends ArrayStateLike<TNode>,
>(
  state: TArrayState,
  before: unknown[],
  next: unknown[],
  deps: DiffOperationDeps<TNode, TScopeState, TArrayState>,
): CommitResult {
  const patches: IoPatch[] = [];
  const helpers = createDiffHelpers(deps, patches);
  const changed = helpers.applyArrayDiff(state, before, next, []);
  return { changed, patches };
}
