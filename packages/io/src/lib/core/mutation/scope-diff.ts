import type {
  ArrayStateLike,
  DiffChildFn,
  PathSegment,
  ScopeStateLike,
} from './diff-shared.js';

export function createApplyScopeDiff<
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
    relPath: PathSegment[],
  ) => boolean,
) {
  return (
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

      const childChanged = diffChild(
        scopeState,
        key,
        node,
        prev,
        nextValue,
        [...relPath, key],
        true,
      );
      if (childChanged !== undefined) {
        changed = changed || childChanged;
        continue;
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
}
