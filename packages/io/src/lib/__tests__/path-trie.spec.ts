import { describe, expect, it } from 'vitest';
import {
  createTrieNode,
  deletePathNode,
  getPathNode,
  setPathNode,
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
});
