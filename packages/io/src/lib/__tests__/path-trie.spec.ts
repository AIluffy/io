import { describe, expect, it, vi } from 'vitest';
import {
  createTrieNode,
  deletePathNode,
  getPathNode,
  rebuildSubtreeMapping,
  registerSubtree,
  setPathNode,
  unregisterSubtree,
} from '../core/tree/path-trie.js';

describe('core/tree/path-trie', () => {
  it('returns undefined when querying missing intermediate paths', () => {
    const ctx = {
      devtools: true,
      root: createTrieNode<number>(),
    };

    setPathNode(ctx, ['a', 'b'], 1);

    expect(getPathNode(ctx, ['a', 'c'])).toBeUndefined();
    expect(getPathNode(ctx, ['x'])).toBeUndefined();
  });

  it('deletes root node when path is empty', () => {
    const ctx = {
      devtools: true,
      root: createTrieNode<number>(),
    };
    setPathNode(ctx, [], 1);
    expect(getPathNode(ctx, [])).toBe(1);

    deletePathNode(ctx, []);
    expect(getPathNode(ctx, [])).toBeUndefined();
  });

  it('no-ops when devtools is disabled', () => {
    const ctx = {
      devtools: false,
      root: createTrieNode<number>(),
    };

    setPathNode(ctx, ['a'], 1);
    expect(getPathNode(ctx, ['a'])).toBeUndefined();
    deletePathNode(ctx, ['a']);
    expect(ctx.root.children.size).toBe(0);
    expect(ctx.root.node).toBeUndefined();
  });

  it('skips subtree traversal helpers when devtools is disabled', () => {
    const ctx = {
      devtools: false,
      root: createTrieNode<object>(),
    };
    const node = {};
    const access = {
      getScopeChildren: vi.fn(() => undefined),
      getArrayChildren: vi.fn(() => undefined),
    };

    registerSubtree(ctx, ['a'], node, access);
    unregisterSubtree(ctx, ['a'], node, access);
    rebuildSubtreeMapping({ ctx, path: ['a'] }, node, access);

    expect(access.getScopeChildren).not.toHaveBeenCalled();
    expect(access.getArrayChildren).not.toHaveBeenCalled();
  });
});
