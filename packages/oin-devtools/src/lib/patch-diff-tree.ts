import type { OinPatchDiff, OinPatchDiffTreeNode } from './types.js';

type Node = OinPatchDiffTreeNode & { childrenMap?: Map<PropertyKey, Node> };

function ensureChild(parent: Node, key: PropertyKey, path: PropertyKey[]): Node {
  if (!parent.childrenMap) parent.childrenMap = new Map();
  const existing = parent.childrenMap.get(key);
  if (existing) return existing;
  const next: Node = { key, path };
  parent.childrenMap.set(key, next);
  return next;
}

export function buildPatchDiffTree(
  patches: ReadonlyArray<OinPatchDiff>
): OinPatchDiffTreeNode[] {
  const root: Node = { key: '$', path: [] };

  for (const patch of patches) {
    let node = root;
    const path = patch.path ?? [];
    for (let i = 0; i < path.length; i += 1) {
      const segment = path[i];
      node = ensureChild(node, segment, path.slice(0, i + 1));
    }
    if (!node.patches) node.patches = [];
    node.patches.push(patch);
  }

  const toPublic = (n: Node): OinPatchDiffTreeNode => {
    const children = n.childrenMap
      ? Array.from(n.childrenMap.values()).map(toPublic)
      : undefined;
    return {
      key: n.key,
      path: n.path,
      children: children && children.length > 0 ? children : undefined,
      patches: n.patches && n.patches.length > 0 ? n.patches : undefined,
    };
  };

  const result = root.childrenMap
    ? Array.from(root.childrenMap.values()).map(toPublic)
    : [];

  return result;
}
