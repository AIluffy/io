import type { CommitDeps } from '../deps/commit-deps.js';
import type { InternalDeps } from '../deps/node-creation-deps.js';
import type { RegistryLayer } from './registry-layer.js';
import type { SubscriptionLayer } from './subscription-layer.js';

import { createDraft, finishDraft } from '../../utils/cow.js';
import { emitError } from '../../utils/debug.js';
import { isPlainObject } from '../../utils/plain-object.js';
import { cloneValue } from '../../utils/snapshot.js';
import { createUpdate } from '../../utils/updates.js';
import { applyArrayCommitDiff, applyScopeCommitDiff } from '../commit.js';

type CreateCommandLayerDeps = {
  registry: RegistryLayer;
  subscriptions: SubscriptionLayer;
};

export type CommandLayer = CommitDeps
  & Pick<InternalDeps, 'emitError'>
  & CreateCommandLayerDeps;

export function createCommandLayer(
  deps: CreateCommandLayerDeps,
): CommandLayer {
  return {
    registry: deps.registry,
    subscriptions: deps.subscriptions,
    isPlainObject,
    cloneValue,
    createDraft,
    finishDraft,
    createUpdate,
    applyScopeCommitDiff,
    applyArrayCommitDiff,
    emitError,
  };
}
