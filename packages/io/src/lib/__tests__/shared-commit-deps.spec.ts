import { describe, expect, it, vi } from 'vitest';
import { createSharedCommitDeps } from '../core/node-factory/shared-commit-deps.js';

describe('core/node-factory/shared-commit-deps', () => {
  it('reuses and invalidates snapshot cache across lifecycle wrappers', () => {
    const scopeState = { kind: 'scope-state' };
    const arrayState = { kind: 'array-state' };
    const unitSetValue = vi.fn();
    const cacheRefs: Array<{ clear: () => void }> = [];
    const getNodeValue = vi.fn((node: unknown, cache: { clear: () => void }) => {
      cacheRefs.push(cache);
      return (node as { value: unknown }).value;
    });
    const detachChildFromScope = vi.fn();
    const attachChildToScope = vi.fn();
    const detachChildFromArray = vi.fn();
    const attachChildToArray = vi.fn();
    const unregisterSubtree = vi.fn();
    const registerSubtree = vi.fn();
    const emitScopeValue = vi.fn();
    const emitArrayValue = vi.fn();
    const markDirty = vi.fn();
    const getPathNode = vi.fn();

    const deps = createSharedCommitDeps(
      {
        snapshots: { getNodeValue },
        internals: {
          getInternal: () => ({ kind: 'scope' }),
          requireInternalOfKind: (_node: unknown, kind: string) => {
            if (kind === 'scope') {
              return { kind: 'scope', getState: () => scopeState } as never;
            }
            if (kind === 'array') {
              return { kind: 'array', getState: () => arrayState } as never;
            }
            return { kind: 'unit', setValue: unitSetValue } as never;
          },
        },
        lifecycle: {
          detachChildFromScope,
          attachChildToScope,
          detachChildFromArray,
          attachChildToArray,
        },
        registry: {
          unregisterSubtree,
          registerSubtree,
          getPathNode,
        },
        subscriptions: {
          emitScopeValue,
          emitArrayValue,
          markDirty,
        },
      } as never,
      {} as never,
      vi.fn((_ctx, _path, value) => ({ value })) as never,
      (value) => ({ wrapped: value }),
    );

    expect(deps.getScopeState({})).toBe(scopeState);
    expect(deps.getArrayState({})).toBe(arrayState);
    expect(deps.getInternalKind({})).toBe('scope');
    expect(deps.resolvePatchValue(1)).toEqual({ wrapped: 1 });
    deps.createTreeNode(['a'], 1);

    expect(deps.getNodeValue({ value: 1 })).toBe(1);
    expect(deps.getNodeValue({ value: 2 })).toBe(2);
    expect(getNodeValue).toHaveBeenCalledTimes(2);
    expect(cacheRefs[0]).toBe(cacheRefs[1]);

    const clearSpy = vi.spyOn(cacheRefs[0], 'clear');
    deps.setUnitValue({}, 3);
    expect(unitSetValue).toHaveBeenCalledWith(3, {
      emitUpdate: false,
      emitValue: true,
    });
    expect(clearSpy).toHaveBeenCalledTimes(1);

    deps.detachChildFromScope(scopeState as never, 'k');
    deps.attachChildToScope(scopeState as never, 'k', {} as never);
    deps.detachChildFromArray(arrayState as never, {} as never);
    deps.attachChildToArray(arrayState as never, {} as never);
    deps.unregisterSubtree(['a'], {} as never);
    deps.registerSubtree(['a'], {} as never);
    deps.emitScopeValue(scopeState as never);
    deps.emitArrayValue(arrayState as never);
    deps.markDirty(scopeState as never, 'k');
    deps.getPathNode(['a']);

    expect(detachChildFromScope).toHaveBeenCalled();
    expect(attachChildToScope).toHaveBeenCalled();
    expect(detachChildFromArray).toHaveBeenCalled();
    expect(attachChildToArray).toHaveBeenCalled();
    expect(unregisterSubtree).toHaveBeenCalled();
    expect(registerSubtree).toHaveBeenCalled();
    expect(emitScopeValue).toHaveBeenCalledWith(scopeState);
    expect(emitArrayValue).toHaveBeenCalledWith(arrayState);
    expect(markDirty).toHaveBeenCalledWith(scopeState, 'k');
    expect(getPathNode).toHaveBeenCalledWith(['a']);
  });
});
