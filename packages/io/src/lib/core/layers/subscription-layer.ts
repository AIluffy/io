import type { LifecycleDeps } from '../deps/node-creation-deps.js';
import type { SnapshotDeps } from '../deps/snapshot-deps.js';
import type { SubscriptionDeps } from '../deps/subscription-deps.js';
import type {
  TreeArrayState,
  TreeNode,
  TreeScopeState,
} from '../io-tree-types.js';

import { trackRead } from '../../utils/signals.js';
import { createSubscriptions } from '../subscriptions.js';

export type SubscriptionLayer = SubscriptionDeps & LifecycleDeps;

export function createSubscriptionLayer(
  snapshots: SnapshotDeps,
): SubscriptionLayer {
  const subscriptions = createSubscriptions<
    TreeNode,
    TreeScopeState,
    TreeArrayState
  >({
    getScopeSnapshot: snapshots.getScopeSnapshot,
    getArraySnapshot: snapshots.getArraySnapshot,
  });

  return {
    ...snapshots,
    ...subscriptions,
    trackRead,
  };
}
