import type { OinTreeNode } from '../utils/types.js';

import { oinTree } from './oin-tree.js';

export function oinDeep<T>(initial: T): OinTreeNode<T> {
  return oinTree(initial);
}
