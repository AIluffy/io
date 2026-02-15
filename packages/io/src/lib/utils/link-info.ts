import type { IoPath } from './types.js';
import type { PathTrieNode } from '../core/path-trie.js';
import type { TreeNode } from '../core/io-tree-types.js';

import { getInternal } from './internal-access.js';

export type IoLinkInfo = {
  multiParents: Array<{ paths: IoPath[] }>;
};

type CtxLike = {
  devtools?: boolean;
  root?: PathTrieNode<TreeNode>;
};

function getCtx(target: unknown): CtxLike | undefined {
  const internal = getInternal(target) as
    | { getState?: () => unknown; kind?: string }
    | undefined;
  const state = internal?.getState?.();
  if (!state || typeof state !== 'object') return undefined;
  const ctx = (state as { ctx?: CtxLike }).ctx;
  return ctx;
}

function collectPaths(
  node: PathTrieNode<TreeNode>,
  path: IoPath,
  map: Map<object, IoPath[]>,
): void {
  if (node.node && (typeof node.node === 'object' || typeof node.node === 'function')) {
    const obj = node.node as object;
    const existing = map.get(obj);
    if (existing) existing.push(path);
    else map.set(obj, [path]);
  }

  node.children.forEach((child, seg) => {
    collectPaths(child, [...path, seg], map);
  });
}

export function getLinkInfo(target: unknown): IoLinkInfo {
  const ctx = getCtx(target);
  if (!ctx || !ctx.devtools || !ctx.root) return { multiParents: [] };

  const map = new Map<object, IoPath[]>();
  collectPaths(ctx.root, [], map);

  const multiParents: Array<{ paths: IoPath[] }> = [];
  map.forEach((paths) => {
    if (paths.length <= 1) return;
    const sorted = paths.slice().sort((a, b) => {
      const ka = a.map((s) => String(s)).join('|');
      const kb = b.map((s) => String(s)).join('|');
      return ka.localeCompare(kb);
    });
    multiParents.push({ paths: sorted });
  });

  return { multiParents };
}
