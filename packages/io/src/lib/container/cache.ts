import type { ValueEpoch } from '../utils/branded.js';

export type VersionedCache<T> = {
  value: T | undefined;
  version: ValueEpoch;
  hasValue: boolean;
};

export const CACHE_MISS: unique symbol = Symbol.for('@iostore/store/cacheMiss');

export function readCachedByVersion<T>(
  cache: VersionedCache<T>,
  version: ValueEpoch,
): T | typeof CACHE_MISS {
  if (cache.hasValue && cache.version === version) return cache.value as T;
  return CACHE_MISS;
}

export function updateCachedByVersion<T>(
  cache: VersionedCache<T>,
  version: ValueEpoch,
  value: T,
): T {
  cache.value = value;
  cache.version = version;
  cache.hasValue = true;
  return value;
}
