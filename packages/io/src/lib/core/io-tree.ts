import type { IoTreeNode } from '../utils/types.js';
import { createCommandLayer } from './layers/command-layer.js';
import { createNodeLayer } from './layers/node-layer.js';
import { createRegistryLayer } from './layers/registry-layer.js';
import { createSnapshotLayer } from './layers/snapshot-layer.js';
import { createSubscriptionLayer } from './layers/subscription-layer.js';
import { createTreeContext, type IoTreeOptions } from './tree-context.js';

export function ioTree<T>(initial: T, options?: IoTreeOptions): IoTreeNode<T> {
  const ctx = createTreeContext(options);
  const registry = createRegistryLayer(ctx);
  const snapshots = createSnapshotLayer();
  const subscriptions = createSubscriptionLayer(snapshots);
  const commands = createCommandLayer({ registry, subscriptions });
  const nodes = createNodeLayer({ registry, snapshots, subscriptions, commands });
  return nodes.createTreeNode(ctx, [], initial) as IoTreeNode<T>;
}
