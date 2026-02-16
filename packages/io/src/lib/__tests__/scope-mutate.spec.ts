import { describe, expect, it, vi } from 'vitest';
import { createScopeMutations } from '../core/node-factory/scope/mutate.js';
import { initialEpoch, initialRevision } from '../utils/types/branded.js';

describe('core/node-factory/scope/mutate', () => {
  it('wires command deps through applySet for non-unit replacements', () => {
    const existing = { id: 'existing' };
    const replaced = { id: 'replaced' };
    const unregisterSubtree = vi.fn();
    const createTreeNode = vi.fn(() => replaced);
    const emitScopeValue = vi.fn();
    const state = {
      children: new Map<PropertyKey, unknown>([['profile', existing]]),
      revision: initialRevision(),
      isCommitting: false,
      valueEpoch: initialEpoch(),
      dirtyKeys: new Set<PropertyKey>(),
      dirtyStructure: false,
      valueListeners: new Set([(value: unknown) => value]),
      updateListeners: new Set<(update: unknown) => void>(),
      childValueUnsubs: new Map<PropertyKey, () => void>(),
      childUpdateUnsubs: new Map<PropertyKey, () => void>(),
    };

    const mutations = createScopeMutations({
      deps: {
        emitError: vi.fn(),
        subscriptions: {
          emitArrayValue: vi.fn(),
          emitArrayUpdate: vi.fn(),
          emitScopeValue,
          emitScopeUpdate: vi.fn(),
          markDirty: vi.fn(),
        },
        internals: {
          requireInternalOfKind: vi.fn(),
        },
        lifecycle: {
          detachChildFromScope: vi.fn(),
          attachChildToScope: vi.fn(),
        },
        registry: {
          unregisterSubtree,
        },
      } as never,
      ctx: { seen: new WeakMap<object, unknown>() } as never,
      path: ['root'],
      state: state as never,
      createTreeNode: createTreeNode as never,
      getNode: () => state as never,
    });

    mutations.applySet('profile', { age: 2 });

    expect(unregisterSubtree).toHaveBeenCalledWith(['root', 'profile'], existing);
    expect(createTreeNode).toHaveBeenCalledWith(
      expect.objectContaining({ seen: expect.any(WeakMap) }),
      ['root', 'profile'],
      { age: 2 },
    );
    expect(state.children.get('profile')).toBe(replaced);
    expect(emitScopeValue).toHaveBeenCalledTimes(1);
  });
});
