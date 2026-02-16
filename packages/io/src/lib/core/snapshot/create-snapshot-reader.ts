import type { VersionedCache } from './versioned-cache.js';
import type { ValueEpoch } from '../../utils/types/branded.js';
import type { TreeNode } from '../tree/io-tree-types.js';
import type { SnapshotCache } from './snapshot-cache.js';

import { freezeRootShallow } from '../../utils/immutable/immutable.js';
import {
  CACHE_MISS,
  readCachedByVersion,
  updateCachedByVersion,
} from './versioned-cache.js';
import { createSnapshotCache } from './snapshot-cache.js';

export type GetNodeValue = (node: TreeNode, cache: SnapshotCache) => unknown;

export type SnapshotReaderConfig<TState, TResult> = {
  hasDirtySegments: (state: TState) => boolean;
  buildFull: (
    state: TState,
    getNodeValue: GetNodeValue,
    cache: SnapshotCache,
  ) => TResult;
  buildIncremental: (
    state: TState,
    prev: TResult,
    getNodeValue: GetNodeValue,
    cache: SnapshotCache,
  ) => TResult;
  clearDirty: (state: TState) => void;
};

type SnapshotState<TResult> = {
  node: unknown;
  snapshotCache: VersionedCache<TResult>;
  valueEpoch: ValueEpoch;
  dirtyStructure: boolean;
};

export function createSnapshotReader<
  TState extends SnapshotState<TResult>,
  TResult,
>(
  config: SnapshotReaderConfig<TState, TResult>,
): (state: TState, getNodeValue: GetNodeValue, cache?: SnapshotCache) => TResult {
  return (state: TState, getNodeValue: GetNodeValue, cache?: SnapshotCache): TResult => {
    const snapshot = readCachedByVersion(state.snapshotCache, state.valueEpoch);
    if (snapshot !== CACHE_MISS) return snapshot as TResult;

    const local = cache ?? createSnapshotCache();
    const cached = local.get(state.node as object);
    if (cached) return cached as TResult;

    const prev = state.snapshotCache.hasValue
      ? (state.snapshotCache.value as TResult)
      : undefined;

    if (prev && !state.dirtyStructure && !config.hasDirtySegments(state)) {
      local.set(state.node as object, prev);
      return prev;
    }

    const next =
      prev && !state.dirtyStructure
        ? config.buildIncremental(state, prev, getNodeValue, local)
        : config.buildFull(state, getNodeValue, local);

    config.clearDirty(state);
    state.dirtyStructure = false;

    const value = freezeRootShallow(next) as TResult;
    local.set(state.node as object, value);
    return updateCachedByVersion(state.snapshotCache, state.valueEpoch, value);
  };
}
