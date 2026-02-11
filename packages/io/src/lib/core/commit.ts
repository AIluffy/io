import type { IoPatch } from '../utils/types.js';
import type { DirtyIndexState } from './dirty-indices.js';
import { resetDirtyIndices } from './dirty-indices.js';

type PathSegment = PropertyKey;
type NodePath = readonly PathSegment[];

type ScopeStateLike<TNode> = {
  children: Map<PropertyKey, TNode>;
  path: NodePath;
  dirtyKeys: Set<PropertyKey>;
  dirtyStructure: boolean;
  isCommitting: boolean;
};

type ArrayStateLike<TNode> = {
  children: TNode[];
  path: NodePath;
  dirtyIndices: DirtyIndexState;
  dirtyStructure: boolean;
  isCommitting: boolean;
};

type CommitDeps<
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
  setUnitValue: (node: TNode, next: unknown) => void;
  getNodeValue: (node: TNode) => unknown;
  resolvePatchValue: (value: unknown) => unknown;
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
  emitScopeValue: (state: TScopeState) => void;
  emitArrayValue: (state: TArrayState) => void;
  markDirty: (state: TScopeState | TArrayState, segment: PathSegment) => void;
  cloneValue: (value: unknown) => unknown;
};

type CommitResult = { changed: boolean; patches: IoPatch[] };

const toRecord = (value: unknown): Record<PropertyKey, unknown> =>
  value as Record<PropertyKey, unknown>;

type DiffHelpers<
  TNode,
  TScopeState extends ScopeStateLike<TNode>,
  TArrayState extends ArrayStateLike<TNode>,
> = {
  applyScopeDiff: (
    scopeState: TScopeState,
    prevObj: Record<PropertyKey, unknown>,
    nextObj: Record<PropertyKey, unknown>,
    relPath: PathSegment[],
  ) => boolean;
  applyArrayDiff: (
    arrayState: TArrayState,
    prevArr: unknown[],
    nextArr: unknown[],
    relPath: PathSegment[],
  ) => boolean;
  applyNodeDiff: (
    parentState: TScopeState | TArrayState,
    segment: PathSegment,
    node: TNode,
    prev: unknown,
    nextValue: unknown,
    relPath: PathSegment[],
  ) => boolean;
};

function createDiffHelpers<
  TNode,
  TScopeState extends ScopeStateLike<TNode>,
  TArrayState extends ArrayStateLike<TNode>,
>(
  deps: CommitDeps<TNode, TScopeState, TArrayState>,
  patches: IoPatch[],
): DiffHelpers<TNode, TScopeState, TArrayState> {
  const replaceChild = (
    parentState: TScopeState | TArrayState,
    segment: PathSegment,
    node: TNode,
    nextValue: unknown,
    relPath: PathSegment[],
    patchPrev: unknown,
    getPatchNext: (replaced: TNode) => unknown,
  ): boolean => {
    if (typeof segment === 'string') {
      deps.detachChildFromScope(parentState as TScopeState, segment);
      deps.unregisterSubtree([...parentState.path, segment], node);
      const replaced = deps.createTreeNode(
        [...parentState.path, segment],
        nextValue,
      );
      (parentState as TScopeState).children.set(segment, replaced);
      deps.attachChildToScope(parentState as TScopeState, segment, replaced);
      patches.push({
        op: 'set',
        path: relPath,
        prev: deps.cloneValue(patchPrev),
        next: deps.cloneValue(getPatchNext(replaced)),
      });
      return true;
    }

    if (typeof segment !== 'number')
      throw new Error('ioTree array: invalid segment');
    deps.detachChildFromArray(parentState as TArrayState, node);
    deps.unregisterSubtree([...parentState.path, segment], node);
    const replaced = deps.createTreeNode(
      [...parentState.path, segment],
      nextValue,
    );
    (parentState as TArrayState).children[segment] = replaced;
    deps.attachChildToArray(parentState as TArrayState, replaced);
    patches.push({
      op: 'set',
      path: relPath,
      prev: deps.cloneValue(patchPrev),
      next: deps.cloneValue(getPatchNext(replaced)),
    });
    return true;
  };

  const rebuildArrayChildren = (
    arrayState: TArrayState,
    prevArr: unknown[],
    nextArr: unknown[],
    relPath: PathSegment[],
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
    for (const child of arrayState.children)
      deps.attachChildToArray(arrayState, child);

    if (arrayNode) deps.registerSubtree(arrayState.path, arrayNode);

    patches.push({
      op: 'splice',
      path: relPath,
      start: 0,
      deleteCount: prevArr.length,
      deleted: prevArr.map((v) => deps.resolvePatchValue(v)),
      items: nextArr.map((v) => deps.resolvePatchValue(v)),
    });
    return true;
  };

  const applyNodeDiff = (
    parentState: TScopeState | TArrayState,
    segment: PathSegment,
    node: TNode,
    prev: unknown,
    nextValue: unknown,
    relPath: PathSegment[],
  ): boolean => {
    if (deps.isLink(nextValue)) {
      const prevValue = deps.getNodeValue(node);
      return replaceChild(
        parentState,
        segment,
        node,
        nextValue,
        relPath,
        prevValue,
        (replaced) => deps.getNodeValue(replaced),
      );
    }

    if (deps.isPlainObject(prev) && deps.isPlainObject(nextValue)) {
      const kind = deps.getInternalKind(node);
      if (kind === 'scope') {
        const childState = deps.getScopeState(node);
        childState.isCommitting = true;
        const changed = applyScopeDiff(
          childState,
          toRecord(prev),
          toRecord(nextValue),
          relPath,
        );
        childState.isCommitting = false;
        if (changed) deps.emitScopeValue(childState);
        return changed;
      }
    }

    if (Array.isArray(prev) && Array.isArray(nextValue)) {
      const kind = deps.getInternalKind(node);
      if (kind === 'array') {
        const childState = deps.getArrayState(node);
        childState.isCommitting = true;
        const changed = applyArrayDiff(childState, prev, nextValue, relPath);
        childState.isCommitting = false;
        if (changed) deps.emitArrayValue(childState);
        return changed;
      }
    }

    if (Object.is(prev, nextValue)) return false;

    if (deps.isUnit(node)) {
      deps.setUnitValue(node, nextValue);
      patches.push({
        op: 'set',
        path: relPath,
        prev: deps.cloneValue(prev),
        next: deps.cloneValue(nextValue),
      });
      deps.markDirty(parentState, segment);
      return true;
    }

    return replaceChild(
      parentState,
      segment,
      node,
      nextValue,
      relPath,
      prev,
      () => nextValue,
    );
  };

  const applyScopeDiff = (
    scopeState: TScopeState,
    prevObj: Record<PropertyKey, unknown>,
    nextObj: Record<PropertyKey, unknown>,
    relPath: PathSegment[],
  ): boolean => {
    let changed = false;
    for (const key of Reflect.ownKeys(nextObj)) {
      if (!Reflect.has(prevObj as object, key))
        throw new Error(`ioTree scope: unknown key ${String(key)}`);
    }
    for (const key of Reflect.ownKeys(prevObj)) {
      const node = scopeState.children.get(key);
      if (!node) continue;
      const prev = prevObj[key];
      const nextValue = nextObj[key];

      if (deps.isPlainObject(prev) && deps.isPlainObject(nextValue)) {
        const kind = deps.getInternalKind(node);
        if (kind === 'scope') {
          const childState = deps.getScopeState(node);
          childState.isCommitting = true;
          const childChanged = applyScopeDiff(
            childState,
            toRecord(prev),
            toRecord(nextValue),
            [...relPath, key],
          );
          childState.isCommitting = false;
          if (childChanged) deps.emitScopeValue(childState);
          if (childChanged) deps.markDirty(scopeState, key);
          changed = changed || childChanged;
          continue;
        }
      }

      if (Array.isArray(prev) && Array.isArray(nextValue)) {
        const kind = deps.getInternalKind(node);
        if (kind === 'array') {
          const childState = deps.getArrayState(node);
          childState.isCommitting = true;
          const childChanged = applyArrayDiff(childState, prev, nextValue, [
            ...relPath,
            key,
          ]);
          childState.isCommitting = false;
          if (childChanged) deps.emitArrayValue(childState);
          if (childChanged) deps.markDirty(scopeState, key);
          changed = changed || childChanged;
          continue;
        }
      }

      const nodeChanged = applyNodeDiff(
        scopeState,
        key,
        node,
        prev,
        nextValue,
        [...relPath, key],
      );
      changed = changed || nodeChanged;
    }
    return changed;
  };

  const applyArrayDiff = (
    arrayState: TArrayState,
    prevArr: unknown[],
    nextArr: unknown[],
    relPath: PathSegment[],
  ): boolean => {
    if (prevArr.length !== nextArr.length) {
      return rebuildArrayChildren(arrayState, prevArr, nextArr, relPath);
    }

    let changed = false;
    for (let i = 0; i < prevArr.length; i += 1) {
      const node = arrayState.children[i];
      const prev = prevArr[i];
      const nextValue = nextArr[i];

      if (deps.isPlainObject(prev) && deps.isPlainObject(nextValue)) {
        const kind = deps.getInternalKind(node);
        if (kind === 'scope') {
          const childState = deps.getScopeState(node);
          childState.isCommitting = true;
          const childChanged = applyScopeDiff(
            childState,
            toRecord(prev),
            toRecord(nextValue),
            [...relPath, i],
          );
          childState.isCommitting = false;
          if (childChanged) deps.emitScopeValue(childState);
          if (childChanged) deps.markDirty(arrayState, i);
          changed = changed || childChanged;
          continue;
        }
      }

      if (Array.isArray(prev) && Array.isArray(nextValue)) {
        const kind = deps.getInternalKind(node);
        if (kind === 'array') {
          const childState = deps.getArrayState(node);
          childState.isCommitting = true;
          const childChanged = applyArrayDiff(childState, prev, nextValue, [
            ...relPath,
            i,
          ]);
          childState.isCommitting = false;
          if (childChanged) deps.emitArrayValue(childState);
          if (childChanged) deps.markDirty(arrayState, i);
          changed = changed || childChanged;
          continue;
        }
      }

      const nodeChanged = applyNodeDiff(arrayState, i, node, prev, nextValue, [
        ...relPath,
        i,
      ]);
      changed = changed || nodeChanged;
    }
    return changed;
  };

  return { applyScopeDiff, applyArrayDiff, applyNodeDiff };
}

export function applyScopeCommitDiff<
  TNode,
  TScopeState extends ScopeStateLike<TNode>,
  TArrayState extends ArrayStateLike<TNode>,
>(
  state: TScopeState,
  before: Record<PropertyKey, unknown>,
  next: Record<PropertyKey, unknown>,
  deps: CommitDeps<TNode, TScopeState, TArrayState>,
): CommitResult {
  const patches: IoPatch[] = [];
  const helpers = createDiffHelpers(deps, patches);
  const changed = helpers.applyScopeDiff(state, before, next, []);
  return { changed, patches };
}

export function applyArrayCommitDiff<
  TNode,
  TScopeState extends ScopeStateLike<TNode>,
  TArrayState extends ArrayStateLike<TNode>,
>(
  state: TArrayState,
  before: unknown[],
  next: unknown[],
  deps: CommitDeps<TNode, TScopeState, TArrayState>,
): CommitResult {
  const patches: IoPatch[] = [];
  const helpers = createDiffHelpers(deps, patches);
  const changed = helpers.applyArrayDiff(state, before, next, []);
  return { changed, patches };
}
