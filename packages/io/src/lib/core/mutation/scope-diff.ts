import type {
  ArrayStateLike,
  DiffChildFn,
  PathStack,
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
    pathStack: PathStack,
  ) => boolean,
) {
  return (
    scopeState: TScopeState,
    prevObj: Record<PropertyKey, unknown>,
    nextObj: Record<PropertyKey, unknown>,
    pathStack: PathStack,
  ): boolean => {
    let changed = false;
    for (const key of Reflect.ownKeys(nextObj)) {
      if (!scopeState.children.has(key))
        throw new Error(`ioTree scope: unknown key ${String(key)}`);
    }
    for (const [key, node] of scopeState.children.entries()) {
      const prev = prevObj[key];
      const nextValue = nextObj[key];
      if (Object.is(prev, nextValue)) continue;
      pathStack.push(key);
      try {
        const childChanged = diffChild(
          scopeState,
          key,
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
          scopeState,
          key,
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
    return changed;
  };
}
