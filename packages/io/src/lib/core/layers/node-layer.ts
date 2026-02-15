import type { NodeCreationDeps } from '../deps/node-creation-deps.js';
import type { SnapshotDeps } from '../deps/snapshot-deps.js';
import type { TreeInternal } from '../tree/io-tree-types.js';
import type { CommandLayer } from './command-layer.js';
import type { RegistryLayer } from './registry-layer.js';
import type { SubscriptionLayer } from './subscription-layer.js';

import { createUnit, isUnit } from '../../units/unit.js';
import {
  getInternal as getAnyInternal,
  registerInternal,
  requireInternalOfKind,
} from '../../utils/internal-access.js';
import { INTERNAL } from '../../utils/internal-symbol.js';
import { createNodeFactory } from '../node-factory/index.js';

type CreateNodeLayerDeps = {
  registry: RegistryLayer;
  snapshots: SnapshotDeps;
  subscriptions: SubscriptionLayer;
  commands: CommandLayer;
};

function getInternal(value: unknown): TreeInternal | undefined {
  return getAnyInternal(value) as TreeInternal | undefined;
}

export function createNodeLayer(
  deps: CreateNodeLayerDeps,
): ReturnType<typeof createNodeFactory> {
  const { registry, snapshots, subscriptions, commands } = deps;

  const nodeDeps: NodeCreationDeps = {
    isPlainObject: commands.isPlainObject,
    isUnit,
    createUnit,
    cloneValue: commands.cloneValue,
    emitError: commands.emitError,
    createDraft: commands.createDraft,
    finishDraft: commands.finishDraft,
    createUpdate: commands.createUpdate,
    applyScopeCommitDiff: commands.applyScopeCommitDiff,
    applyArrayCommitDiff: commands.applyArrayCommitDiff,
    getInternal,
    requireInternalOfKind,
    registerInternal,
    INTERNAL,
    registerSubtree: (_ctx, path, node) => registry.registerSubtree(path, node),
    unregisterSubtree: (_ctx, path, node) =>
      registry.unregisterSubtree(path, node),
    rebuildSubtreeMapping: (state, node) =>
      registry.rebuildSubtreeMapping({ path: state.path }, node),
    setPathNode: (_ctx, path, node) => registry.setPathNode(path, node),
    getPathNode: (_ctx, path) => registry.getPathNode(path),
    getScopeSnapshot: snapshots.getScopeSnapshot,
    getArraySnapshot: snapshots.getArraySnapshot,
    getNodeValue: snapshots.getNodeValue,
    emitScopeValue: subscriptions.emitScopeValue,
    emitScopeUpdate: subscriptions.emitScopeUpdate,
    emitArrayValue: subscriptions.emitArrayValue,
    emitArrayUpdate: subscriptions.emitArrayUpdate,
    trackRead: subscriptions.trackRead,
    markDirty: subscriptions.markDirty,
    attachChildToScope: subscriptions.attachChildToScope,
    detachChildFromScope: subscriptions.detachChildFromScope,
    attachChildToArray: subscriptions.attachChildToArray,
    detachChildFromArray: subscriptions.detachChildFromArray,
  };

  return createNodeFactory(nodeDeps);
}
