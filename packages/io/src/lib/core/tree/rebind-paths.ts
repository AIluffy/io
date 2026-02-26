import type { NodePath } from './path-trie.js';

import { appendPath } from './path-utils.js';

type ScopeStateLike<TNode> = {
  path: NodePath;
  children: Map<PropertyKey, TNode>;
};

type ArrayStateLike<TNode> = {
  path: NodePath;
  children: TNode[];
};

type RebindDeps<TNode, TScopeState extends ScopeStateLike<TNode>, TArrayState extends ArrayStateLike<TNode>> = {
  getInternalKind: (
    node: TNode,
  ) => 'scope' | 'array' | 'unit' | 'derived' | undefined;
  getScopeState: (node: TNode) => TScopeState;
  getArrayState: (node: TNode) => TArrayState;
};

export function rebindSubtreePaths<
  TNode,
  TScopeState extends ScopeStateLike<TNode>,
  TArrayState extends ArrayStateLike<TNode>,
>(
  rootNode: TNode,
  rootPath: NodePath,
  deps: RebindDeps<TNode, TScopeState, TArrayState>,
): void {
  const seen = new WeakSet<object>();

  const visit = (node: TNode, path: NodePath): void => {
    if (typeof node !== 'object' || node === null) return;
    const obj = node as object;
    if (seen.has(obj)) return;
    seen.add(obj);

    const kind = deps.getInternalKind(node);
    if (kind === 'scope') {
      const scopeState = deps.getScopeState(node);
      scopeState.path = path;
      for (const [key, child] of scopeState.children.entries()) {
        visit(child, appendPath(path, key));
      }
      return;
    }

    if (kind === 'array') {
      const arrayState = deps.getArrayState(node);
      arrayState.path = path;
      for (let i = 0; i < arrayState.children.length; i += 1) {
        visit(arrayState.children[i], appendPath(path, i));
      }
    }
  };

  visit(rootNode, rootPath);
}
