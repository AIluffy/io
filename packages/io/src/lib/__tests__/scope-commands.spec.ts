import { describe, expect, it, vi } from 'vitest';
import { ScopeMutateCommand } from '../core/commands/scope-commands.js';

describe('core/commands: ScopeMutateCommand', () => {
  it('throws when target key is missing', () => {
    const state = {
      children: new Map<PropertyKey, unknown>(),
      dirtyKeys: new Set<PropertyKey>(),
    };
    const command = new ScopeMutateCommand(
      {
        getPath: () => [],
        isUnit: () => false,
        requireInternalOfKind: vi.fn(),
        detachChildFromScope: vi.fn(),
        unregisterSubtree: vi.fn(),
        createTreeNode: vi.fn(),
        attachChildToScope: vi.fn(),
        markDirty: vi.fn(),
      },
      'missing',
      1,
    );

    expect(() => command.execute(state as never)).toThrow(
      'ioTree scope: missing key missing',
    );
  });

  it('returns null when unit value does not change', () => {
    const unit = {};
    const setValue = vi.fn();
    const state = {
      children: new Map<PropertyKey, unknown>([['count', unit]]),
      dirtyKeys: new Set<PropertyKey>(),
    };
    const command = new ScopeMutateCommand(
      {
        getPath: () => [],
        isUnit: () => true,
        requireInternalOfKind: () =>
          ({
            kind: 'unit',
            getValue: () => 1,
            setValue,
          }) as never,
        detachChildFromScope: vi.fn(),
        unregisterSubtree: vi.fn(),
        createTreeNode: vi.fn(),
        attachChildToScope: vi.fn(),
        markDirty: vi.fn(),
      },
      'count',
      1,
    );

    expect(command.execute(state as never)).toBeNull();
    expect(setValue).toHaveBeenCalledTimes(1);
    expect(state.dirtyKeys.size).toBe(0);
  });

  it('marks dirty via subscription deps when emitValue is false', () => {
    const unit = {};
    let current = 1;
    const markDirty = vi.fn();
    const state = {
      children: new Map<PropertyKey, unknown>([['count', unit]]),
      dirtyKeys: new Set<PropertyKey>(),
    };
    const command = new ScopeMutateCommand(
      {
        getPath: () => ['root'],
        isUnit: () => true,
        requireInternalOfKind: () =>
          ({
            kind: 'unit',
            getValue: () => current,
            setValue: (next: unknown) => {
              current = next as number;
            },
          }) as never,
        detachChildFromScope: vi.fn(),
        unregisterSubtree: vi.fn(),
        createTreeNode: vi.fn(),
        attachChildToScope: vi.fn(),
        markDirty,
      },
      'count',
      2,
      { emitValue: false },
    );

    expect(command.execute(state as never)).toEqual([]);
    expect(markDirty).toHaveBeenCalledWith(state, 'count');
    expect(state.dirtyKeys.size).toBe(0);
  });

  it('replaces non-unit scope children', () => {
    const existing = { kind: 'scope-child' };
    const replaced = { kind: 'new-child' };
    const detachChildFromScope = vi.fn();
    const unregisterSubtree = vi.fn();
    const createTreeNode = vi.fn(() => replaced as never);
    const attachChildToScope = vi.fn();
    const state = {
      children: new Map<PropertyKey, unknown>([['profile', existing]]),
      dirtyKeys: new Set<PropertyKey>(),
    };
    const command = new ScopeMutateCommand(
      {
        getPath: () => ['root'],
        isUnit: () => false,
        requireInternalOfKind: vi.fn(),
        detachChildFromScope,
        unregisterSubtree,
        createTreeNode,
        attachChildToScope,
        markDirty: vi.fn(),
      },
      'profile',
      { age: 2 },
    );

    expect(command.execute(state as never)).toEqual([]);
    expect(detachChildFromScope).toHaveBeenCalledWith(state, 'profile');
    expect(unregisterSubtree).toHaveBeenCalledWith(['root', 'profile'], existing);
    expect(createTreeNode).toHaveBeenCalledWith(['root', 'profile'], { age: 2 });
    expect(attachChildToScope).toHaveBeenCalledWith(state, 'profile', replaced);
    expect(state.children.get('profile')).toBe(replaced);
    expect(state.dirtyKeys.has('profile')).toBe(true);
  });
});
