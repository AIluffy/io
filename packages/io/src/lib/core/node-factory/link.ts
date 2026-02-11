import type { NodePath } from '../path-trie.js';
import type { TreeContext, TreeNode } from '../io-tree-types.js';

type TrieNode = {
  node: TreeNode | undefined;
  children: Map<PropertyKey, unknown>;
};

export function isPathPrefix(prefix: NodePath, path: NodePath): boolean {
  if (prefix.length > path.length) return false;
  for (let i = 0; i < prefix.length; i += 1) {
    if (!Object.is(prefix[i], path[i])) return false;
  }
  return true;
}

export function formatPath(path: NodePath): string {
  if (path.length === 0) return '<root>';
  return path.map((segment) => String(segment)).join('.');
}

export function collectTargetPaths(
  ctx: TreeContext,
  target: TreeNode,
): NodePath[] {
  if (!ctx.devtools) return [];
  const paths: NodePath[] = [];
  const walk = (node: TrieNode, current: NodePath) => {
    if (node.node === target) paths.push(current);
    for (const [segment, child] of node.children.entries()) {
      walk(child as TrieNode, [...current, segment]);
    }
  };
  walk(ctx.root as TrieNode, []);
  return paths;
}
