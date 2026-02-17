import type {
  ArrayStateLike,
  DiffChildFn,
  PathStack,
  PathSegment,
  ScopeStateLike,
} from './diff-shared.js';
import { profileEnd, profileStart } from './commit-profile.js';

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
  tryDescendScope?: (
    node: TNode,
    prev: unknown,
    nextValue: unknown,
  ) =>
    | {
        state: TScopeState;
        prev: Record<PropertyKey, unknown>;
        next: Record<PropertyKey, unknown>;
      }
    | undefined,
) {
  const findSingleChangedKey = (
    scopeState: TScopeState,
    prevObj: Record<PropertyKey, unknown>,
    nextObj: Record<PropertyKey, unknown>,
  ): PropertyKey | undefined => {
    const size = scopeState.children.size;
    if (size === 0) return undefined;

    if (size === 1) {
      const only = scopeState.children.keys().next().value as PropertyKey | undefined;
      if (only === undefined) return undefined;
      return Object.is(prevObj[only], nextObj[only]) ? undefined : only;
    }

    // Fast lane for the hot deep benchmark shape: { value, child }.
    if (
      size === 2 &&
      scopeState.children.has('value') &&
      scopeState.children.has('child')
    ) {
      const valueChanged = !Object.is(prevObj.value, nextObj.value);
      const childChanged = !Object.is(prevObj.child, nextObj.child);
      if (valueChanged === childChanged) return undefined;
      return valueChanged ? 'value' : 'child';
    }

    let changedKey: PropertyKey | undefined;
    for (const [key] of scopeState.children.entries()) {
      if (Object.is(prevObj[key], nextObj[key])) continue;
      if (changedKey !== undefined) return undefined;
      changedKey = key;
    }
    return changedKey;
  };

  return (
    scopeState: TScopeState,
    prevObj: Record<PropertyKey, unknown>,
    nextObj: Record<PropertyKey, unknown>,
    pathStack: PathStack,
  ): boolean => {
    const baseDepth = pathStack.length;
    const depth = pathStack.length;
    const totalStart = profileStart();
    let currentState = scopeState;
    let currentPrev = prevObj;
    let currentNext = nextObj;

    while (true) {
      const currentDepth = pathStack.length;
      const shapeCheckStart = profileStart();
      for (const key of Reflect.ownKeys(currentNext)) {
        if (!currentState.children.has(key))
          throw new Error(`ioTree scope: unknown key ${String(key)}`);
      }
      profileEnd(
        `commit.diff.scope.depth.${currentDepth}.shapeCheck`,
        shapeCheckStart,
      );

      const fastPathCheckStart = profileStart();
      if (currentState.children.size <= 4) {
        const changedKey = findSingleChangedKey(
          currentState,
          currentPrev,
          currentNext,
        );
        profileEnd(
          `commit.diff.scope.depth.${currentDepth}.fastPathCheck`,
          fastPathCheckStart,
        );
        if (changedKey !== undefined) {
          const node = currentState.children.get(changedKey);
          if (node) {
            const prev = currentPrev[changedKey];
            const nextValue = currentNext[changedKey];
            const nested = tryDescendScope?.(node, prev, nextValue);
            if (nested) {
              pathStack.push(changedKey);
              currentState = nested.state;
              currentPrev = nested.prev;
              currentNext = nested.next;
              continue;
            }

            pathStack.push(changedKey);
            const childChanged = diffChild(
              currentState,
              changedKey,
              node,
              prev,
              nextValue,
              pathStack,
              true,
            );
            if (childChanged !== undefined) {
              pathStack.length = baseDepth;
              profileEnd(`commit.diff.scope.depth.${depth}.total`, totalStart);
              return childChanged;
            }

            const nodeChanged = applyNodeDiff(
              currentState,
              changedKey,
              node,
              prev,
              nextValue,
              pathStack,
            );
            pathStack.length = baseDepth;
            profileEnd(`commit.diff.scope.depth.${depth}.total`, totalStart);
            return nodeChanged;
          }
        }
      } else {
        profileEnd(
          `commit.diff.scope.depth.${currentDepth}.fastPathCheck`,
          fastPathCheckStart,
        );
      }

      let changed = false;
      const loopStart = profileStart();
      for (const [key, node] of currentState.children.entries()) {
        const prev = currentPrev[key];
        const nextValue = currentNext[key];
        if (Object.is(prev, nextValue)) continue;
        pathStack.push(key);
        try {
          const childChanged = diffChild(
            currentState,
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
            currentState,
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
      profileEnd(`commit.diff.scope.depth.${currentDepth}.loop`, loopStart);
      pathStack.length = baseDepth;
      profileEnd(`commit.diff.scope.depth.${depth}.total`, totalStart);
      return changed;
    }
  };
}
