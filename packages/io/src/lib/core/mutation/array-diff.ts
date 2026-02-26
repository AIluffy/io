import type { IoPatch } from '../../utils/types/types.js';
import { resetDirtyIndices } from './dirty-indices.js';
import type {
  ArrayStateLike,
  DiffChildFn,
  DiffOperationDeps,
  PathStack,
  PathSegment,
  ScopeStateLike,
} from './diff-shared.js';
import { appendPath } from '../tree/path-utils.js';
import { rebindSubtreePaths } from '../tree/rebind-paths.js';

export function createRebuildArrayChildren<
  TNode,
  TScopeState extends ScopeStateLike<TNode>,
  TArrayState extends ArrayStateLike<TNode>,
>(
  deps: DiffOperationDeps<TNode, TScopeState, TArrayState>,
  patches: IoPatch[],
) {
  return (
    arrayState: TArrayState,
    prevArr: unknown[],
    nextArr: unknown[],
    pathStack: PathStack,
  ): boolean => {
    const prevLen = prevArr.length;
    const nextLen = nextArr.length;
    const minLen = Math.min(prevLen, nextLen);

    let start = 0;
    while (start < minLen && Object.is(prevArr[start], nextArr[start])) {
      start += 1;
    }

    let suffix = 0;
    while (
      suffix < prevLen - start &&
      suffix < nextLen - start &&
      Object.is(prevArr[prevLen - 1 - suffix], nextArr[nextLen - 1 - suffix])
    ) {
      suffix += 1;
    }

    const deleteCount = prevLen - start - suffix;
    const insertCount = nextLen - start - suffix;
    if (deleteCount === 0 && insertCount === 0) return false;

    arrayState.dirtyStructure = true;
    resetDirtyIndices(arrayState.dirtyIndices, nextLen);
    const arrayNode = deps.getPathNode(arrayState.path);
    if (arrayNode) deps.unregisterSubtree(arrayState.path, arrayNode);

    const prevChildren = arrayState.children;
    for (let i = 0; i < deleteCount; i += 1) {
      const index = start + i;
      const child = prevChildren[index];
      deps.detachChildFromArray(arrayState, child);
      deps.unregisterSubtree(appendPath(arrayState.path, index), child);
    }

    const insertedChildren = new Array<TNode>(insertCount);
    for (let i = 0; i < insertCount; i += 1) {
      insertedChildren[i] = deps.createTreeNode(
        appendPath(arrayState.path, start + i),
        nextArr[start + i],
      );
      deps.attachChildToArray(arrayState, insertedChildren[i]);
    }

    const nextChildren = new Array<TNode>(nextLen);
    for (let i = 0; i < start; i += 1) {
      nextChildren[i] = prevChildren[i];
    }
    for (let i = 0; i < insertCount; i += 1) {
      nextChildren[start + i] = insertedChildren[i];
    }
    for (let i = 0; i < suffix; i += 1) {
      nextChildren[nextLen - suffix + i] = prevChildren[prevLen - suffix + i];
    }

    arrayState.children = nextChildren;
    if ('childIndicesDirty' in arrayState) arrayState.childIndicesDirty = true;
    for (let i = 0; i < nextChildren.length; i += 1) {
      rebindSubtreePaths(nextChildren[i], appendPath(arrayState.path, i), deps);
    }

    if (arrayNode) deps.registerSubtree(arrayState.path, arrayNode);

    patches.push({
      op: 'splice',
      path: pathStack.slice(),
      start,
      deleteCount,
      deleted: prevArr
        .slice(start, start + deleteCount)
        .map((v) => deps.resolvePatchValue(v)),
      items: nextArr
        .slice(start, start + insertCount)
        .map((v) => deps.resolvePatchValue(v)),
    });
    return true;
  };
}

export function createApplyArrayDiff<
  TNode,
  TScopeState extends ScopeStateLike<TNode>,
  TArrayState extends ArrayStateLike<TNode>,
>(
  diffChild: DiffChildFn<TNode, TScopeState, TArrayState>,
  applyNodeDiff: (
    parentState: TScopeState | TArrayState,
    segment: PathSegment,
    node: TNode,
    prev: unknown,
    nextValue: unknown,
    pathStack: PathStack,
  ) => boolean,
  rebuildArrayChildren: (
    arrayState: TArrayState,
    prevArr: unknown[],
    nextArr: unknown[],
    pathStack: PathStack,
  ) => boolean,
) {
  return (
    arrayState: TArrayState,
    prevArr: unknown[],
    nextArr: unknown[],
    pathStack: PathStack,
  ): boolean => {
    let changed = false;
    if (prevArr.length !== nextArr.length) {
      changed = rebuildArrayChildren(arrayState, prevArr, nextArr, pathStack);
    } else {
      for (let i = 0; i < prevArr.length; i += 1) {
        const node = arrayState.children[i];
        const prev = prevArr[i];
        const nextValue = nextArr[i];
        if (Object.is(prev, nextValue)) continue;
        pathStack.push(i);
        try {
          const childChanged = diffChild(
            arrayState,
            i,
            node,
            prev,
            nextValue,
            pathStack,
            true,
          );
          if (childChanged !== undefined) {
            changed = changed || childChanged;
            continue;
          }

          const nodeChanged = applyNodeDiff(
            arrayState,
            i,
            node,
            prev,
            nextValue,
            pathStack,
          );
          changed = changed || nodeChanged;
        } finally {
          pathStack.pop();
        }
      }
    }
    return changed;
  };
}
