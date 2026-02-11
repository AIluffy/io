type PathSegment = PropertyKey;
export type NodePath = readonly PathSegment[];

export type PathTrieNode<TNode> = {
  node: TNode | undefined;
  children: Map<PathSegment, PathTrieNode<TNode>>;
};

export type PathTrieContext<TNode> = {
  root: PathTrieNode<TNode>;
  devtools: boolean;
};

export function createTrieNode<TNode>(): PathTrieNode<TNode> {
  return { node: undefined, children: new Map() };
}

export function setPathNode<TNode>(
  ctx: PathTrieContext<TNode>,
  path: NodePath,
  node: TNode,
): void {
  if (!ctx.devtools) return;
  let current = ctx.root;
  for (const seg of path) {
    const next = current.children.get(seg);
    if (next) {
      current = next;
      continue;
    }
    const created = createTrieNode<TNode>();
    current.children.set(seg, created);
    current = created;
  }
  current.node = node;
}

export function getPathNode<TNode>(
  ctx: PathTrieContext<TNode>,
  path: NodePath,
): TNode | undefined {
  if (!ctx.devtools) return undefined;
  let current = ctx.root;
  for (const seg of path) {
    const next = current.children.get(seg);
    if (!next) return undefined;
    current = next;
  }
  return current.node;
}

export function deletePathNode<TNode>(
  ctx: PathTrieContext<TNode>,
  path: NodePath,
): void {
  if (!ctx.devtools) return;
  if (path.length === 0) {
    ctx.root.node = undefined;
    return;
  }
  const stack: PathTrieNode<TNode>[] = [ctx.root];
  let current = ctx.root;
  for (const seg of path) {
    const next = current.children.get(seg);
    if (!next) return;
    current = next;
    stack.push(current);
  }
  current.node = undefined;

  for (let i = path.length - 1; i >= 0; i -= 1) {
    const parent = stack[i];
    const seg = path[i];
    const child = parent.children.get(seg);
    if (!child) continue;
    if (child.node !== undefined) break;
    if (child.children.size > 0) break;
    parent.children.delete(seg);
  }
}

type SubtreeAccess<TNode> = {
  getScopeChildren: (node: TNode) => Iterable<[PropertyKey, TNode]> | undefined;
  getArrayChildren: (node: TNode) => TNode[] | undefined;
};

export function registerSubtree<TNode>(
  ctx: PathTrieContext<TNode>,
  path: NodePath,
  node: TNode,
  access: SubtreeAccess<TNode>,
  visited?: WeakSet<object>,
): void {
  const seen = visited ?? new WeakSet<object>();
  const obj = node as unknown as object;
  if (seen.has(obj)) return;
  seen.add(obj);
  setPathNode(ctx, path, node);

  const scopeChildren = access.getScopeChildren(node);
  if (scopeChildren) {
    for (const [key, child] of scopeChildren) {
      registerSubtree(ctx, [...path, key], child, access, seen);
    }
    return;
  }

  const arrayChildren = access.getArrayChildren(node);
  if (!arrayChildren) return;
  for (let i = 0; i < arrayChildren.length; i += 1) {
    registerSubtree(ctx, [...path, i], arrayChildren[i], access, seen);
  }
}

export function unregisterSubtree<TNode>(
  ctx: PathTrieContext<TNode>,
  path: NodePath,
  node: TNode,
  access: SubtreeAccess<TNode>,
  visited?: WeakSet<object>,
): void {
  const seen = visited ?? new WeakSet<object>();
  const obj = node as unknown as object;
  if (seen.has(obj)) return;
  seen.add(obj);
  deletePathNode(ctx, path);

  const scopeChildren = access.getScopeChildren(node);
  if (scopeChildren) {
    for (const [key, child] of scopeChildren) {
      unregisterSubtree(ctx, [...path, key], child, access, seen);
    }
    return;
  }

  const arrayChildren = access.getArrayChildren(node);
  if (!arrayChildren) return;
  for (let i = 0; i < arrayChildren.length; i += 1) {
    unregisterSubtree(ctx, [...path, i], arrayChildren[i], access, seen);
  }
}

export function rebuildSubtreeMapping<TNode>(
  state: { ctx: PathTrieContext<TNode>; path: NodePath },
  node: TNode,
  access: SubtreeAccess<TNode>,
): void {
  unregisterSubtree(state.ctx, state.path, node, access);
  registerSubtree(state.ctx, state.path, node, access);
}
