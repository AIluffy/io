import type { IoTreeNode } from '../../utils/types.js';

import { createTreeNodeFactory } from '../create-context.js';
import { createTreeContext, type IoTreeOptions } from '../tree/tree-context.js';

export function ioTree<T>(initial: T, options?: IoTreeOptions): IoTreeNode<T> {
  const ctx = createTreeContext(options);
  const factory = createTreeNodeFactory(ctx);
  return factory.createTreeNode(ctx, [], initial) as IoTreeNode<T>;
}
