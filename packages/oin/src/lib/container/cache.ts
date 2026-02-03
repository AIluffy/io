export type VersionedCache<T> = {
  value: T | undefined;
  version: number;
  hasValue: boolean;
};

export function readCachedByVersion<T>(
  cache: VersionedCache<T>,
  version: number,
  compute: () => T,
): T {
  if (cache.hasValue && cache.version === version) return cache.value as T;
  const next = compute();
  cache.value = next;
  cache.version = version;
  cache.hasValue = true;
  return next;
}
