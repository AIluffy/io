import { describe, expect, it } from 'vitest';
import { buildPatchDiffTree } from './patch-diff-tree.js';

const patches = [
  { op: 'set', path: ['user', 'name'], prev: 'a', next: 'b' },
  { op: 'set', path: ['user', 'age'], prev: 1, next: 2 },
  { op: 'splice', path: ['items'], start: 0, deleteCount: 0, deleted: [], items: [1] },
] as const;

describe('oin-devtools: buildPatchDiffTree', () => {
  it('groups patches by path prefixes', () => {
    const tree = buildPatchDiffTree(patches);
    const userNode = tree.find((n) => n.key === 'user');
    expect(userNode?.children?.length).toBe(2);
    const itemsNode = tree.find((n) => n.key === 'items');
    expect(itemsNode?.patches?.[0].op).toBe('splice');
  });

  it('returns empty array for no patches', () => {
    expect(buildPatchDiffTree([])).toEqual([]);
  });
});
