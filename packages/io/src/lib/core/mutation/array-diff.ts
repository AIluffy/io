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
    arrayState.dirtyStructure = true;
    resetDirtyIndices(arrayState.dirtyIndices, nextArr.length);
    const arrayNode = deps.getPathNode(arrayState.path);
    if (arrayNode) deps.unregisterSubtree(arrayState.path, arrayNode);

    for (let i = 0; i < arrayState.children.length; i += 1) {
      const child = arrayState.children[i];
      deps.detachChildFromArray(arrayState, child);
      deps.unregisterSubtree([...arrayState.path, i], child);
    }
    arrayState.children = nextArr.map((v, index) =>
      deps.createTreeNode([...arrayState.path, index], v),
    );
    for (const child of arrayState.children) deps.attachChildToArray(arrayState, child);

    if (arrayNode) deps.registerSubtree(arrayState.path, arrayNode);

    patches.push({
      op: 'splice',
      path: pathStack.slice(),
      start: 0,
      deleteCount: prevArr.length,
      deleted: prevArr.map((v) => deps.resolvePatchValue(v)),
      items: nextArr.map((v) => deps.resolvePatchValue(v)),
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
