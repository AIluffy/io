import type { IoPatch } from '../../utils/types/types.js';
import type { DirtyIndexState } from './dirty-indices.js';
import type { ValueEpoch } from '../../utils/types/branded.js';
import { profileEnd, profileStart } from './commit-profile.js';

export type PathSegment = PropertyKey;
export type NodePath = readonly PathSegment[];
export type PathStack = PathSegment[];

export type ScopeStateLike<TNode> = {
  children: Map<PropertyKey, TNode>;
  path: NodePath;
  valueEpoch: ValueEpoch;
  dirtyKeys: Set<PropertyKey>;
  dirtyStructure: boolean;
  isCommitting: boolean;
};

export type ArrayStateLike<TNode> = {
  children: TNode[];
  path: NodePath;
  valueEpoch: ValueEpoch;
  dirtyIndices: DirtyIndexState;
  dirtyStructure: boolean;
  isCommitting: boolean;
};

export type DiffNodeReadDeps<
  TNode,
  TScopeState extends ScopeStateLike<TNode>,
  TArrayState extends ArrayStateLike<TNode>,
> = {
  isPlainObject: (value: unknown) => boolean;
  isUnit: (node: TNode) => boolean;
  isLink: (value: unknown) => boolean;
  getInternalKind: (
    node: TNode,
  ) => 'scope' | 'array' | 'unit' | 'derived' | undefined;
  getScopeState: (node: TNode) => TScopeState;
  getArrayState: (node: TNode) => TArrayState;
  getNodeValue: (node: TNode) => unknown;
  cloneValue: (value: unknown) => unknown;
};

export type DiffNodeWriteDeps<
  TNode,
  TScopeState extends ScopeStateLike<TNode>,
  TArrayState extends ArrayStateLike<TNode>,
> = {
  setUnitValue: (node: TNode, next: unknown) => void;
  createTreeNode: (path: NodePath, next: unknown) => TNode;
  detachChildFromScope: (state: TScopeState, key: PropertyKey) => void;
  attachChildToScope: (
    state: TScopeState,
    key: PropertyKey,
    child: TNode,
  ) => void;
  detachChildFromArray: (state: TArrayState, child: TNode) => void;
  attachChildToArray: (state: TArrayState, child: TNode) => void;
  unregisterSubtree: (path: NodePath, node: TNode) => void;
  registerSubtree: (path: NodePath, node: TNode) => void;
  getPathNode: (path: NodePath) => TNode | undefined;
  markDirty: (state: TScopeState | TArrayState, segment: PathSegment) => void;
};

export type DiffPatchDeps<
  TNode,
  TScopeState extends ScopeStateLike<TNode>,
  TArrayState extends ArrayStateLike<TNode>,
> = {
  resolvePatchValue: (value: unknown) => unknown;
  emitScopeValue: (state: TScopeState) => void;
  emitArrayValue: (state: TArrayState) => void;
};

export type DiffOperationDeps<
  TNode,
  TScopeState extends ScopeStateLike<TNode>,
  TArrayState extends ArrayStateLike<TNode>,
> = DiffNodeReadDeps<TNode, TScopeState, TArrayState> &
  DiffNodeWriteDeps<TNode, TScopeState, TArrayState> &
  DiffPatchDeps<TNode, TScopeState, TArrayState>;

export type ReplaceChildFn<
  TNode,
  TScopeState extends ScopeStateLike<TNode>,
  TArrayState extends ArrayStateLike<TNode>,
> = (
  parentState: TScopeState | TArrayState,
  segment: PathSegment,
  node: TNode,
  nextValue: unknown,
  pathStack: PathStack,
  patchPrev: unknown,
  getPatchNext: (replaced: TNode) => unknown,
) => boolean;

export type DiffChildFn<
  TNode,
  TScopeState extends ScopeStateLike<TNode>,
  TArrayState extends ArrayStateLike<TNode>,
> = (
  parentState: TScopeState | TArrayState,
  segment: PathSegment,
  node: TNode,
  prev: unknown,
  nextValue: unknown,
  pathStack: PathStack,
  markParentDirty: boolean,
) => boolean | undefined;

export const toRecord = (value: unknown): Record<PropertyKey, unknown> =>
  value as Record<PropertyKey, unknown>;

export function createReplaceChild<
  TNode,
  TScopeState extends ScopeStateLike<TNode>,
  TArrayState extends ArrayStateLike<TNode>,
>(
  deps: DiffOperationDeps<TNode, TScopeState, TArrayState>,
  patches: IoPatch[],
): ReplaceChildFn<TNode, TScopeState, TArrayState> {
  return (
    parentState,
    segment,
    node,
    nextValue,
    pathStack,
    patchPrev,
    getPatchNext,
  ) => {
    if (typeof segment === 'string') {
      const absPath = [...parentState.path, segment] as NodePath;
      deps.detachChildFromScope(parentState as TScopeState, segment);
      deps.unregisterSubtree(absPath, node);
      const replaced = deps.createTreeNode(absPath, nextValue);
      (parentState as TScopeState).children.set(segment, replaced);
      deps.attachChildToScope(parentState as TScopeState, segment, replaced);
      const patchStart = profileStart();
      patches.push({
        op: 'set',
        path: pathStack.slice(),
        prev: deps.cloneValue(patchPrev),
        next: deps.cloneValue(getPatchNext(replaced)),
      });
      profileEnd('commit.patch.generate', patchStart);
      return true;
    }

    if (typeof segment !== 'number')
      throw new Error('ioTree array: invalid segment');
    const absPath = [...parentState.path, segment] as NodePath;
    deps.detachChildFromArray(parentState as TArrayState, node);
    deps.unregisterSubtree(absPath, node);
    const replaced = deps.createTreeNode(absPath, nextValue);
    (parentState as TArrayState).children[segment] = replaced;
    deps.attachChildToArray(parentState as TArrayState, replaced);
    const patchStart = profileStart();
    patches.push({
      op: 'set',
      path: pathStack.slice(),
      prev: deps.cloneValue(patchPrev),
      next: deps.cloneValue(getPatchNext(replaced)),
    });
    profileEnd('commit.patch.generate', patchStart);
    return true;
  };
}

export function createApplyNodeDiff<
  TNode,
  TScopeState extends ScopeStateLike<TNode>,
  TArrayState extends ArrayStateLike<TNode>,
>(
  deps: DiffOperationDeps<TNode, TScopeState, TArrayState>,
  patches: IoPatch[],
  diffChild: DiffChildFn<TNode, TScopeState, TArrayState>,
  replaceChild: ReplaceChildFn<TNode, TScopeState, TArrayState>,
) {
  return (
    parentState: TScopeState | TArrayState,
    segment: PathSegment,
    node: TNode,
    prev: unknown,
    nextValue: unknown,
    pathStack: PathStack,
  ): boolean => {
    const nestedChanged = diffChild(
      parentState,
      segment,
      node,
      prev,
      nextValue,
      pathStack,
      false,
    );
    if (nestedChanged !== undefined) return nestedChanged;

    if (deps.isLink(nextValue)) {
      const prevValue = deps.getNodeValue(node);
      return replaceChild(
        parentState,
        segment,
        node,
        nextValue,
        pathStack,
        prevValue,
        (replaced) => deps.getNodeValue(replaced),
      );
    }

    if (Object.is(prev, nextValue)) return false;

    if (deps.isUnit(node)) {
      deps.setUnitValue(node, nextValue);
      const patchStart = profileStart();
      patches.push({
        op: 'set',
        path: pathStack.slice(),
        prev: deps.cloneValue(prev),
        next: deps.cloneValue(nextValue),
      });
      profileEnd('commit.patch.generate', patchStart);
      deps.markDirty(parentState, segment);
      return true;
    }

    return replaceChild(
      parentState,
      segment,
      node,
      nextValue,
      pathStack,
      prev,
      () => nextValue,
    );
  };
}
