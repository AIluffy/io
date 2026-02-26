import type { NodePath } from './path-trie.js';

export function appendPath(path: NodePath, segment: PropertyKey): NodePath {
  const next = new Array<PropertyKey>(path.length + 1);
  for (let i = 0; i < path.length; i += 1) {
    next[i] = path[i];
  }
  next[path.length] = segment;
  return next;
}
