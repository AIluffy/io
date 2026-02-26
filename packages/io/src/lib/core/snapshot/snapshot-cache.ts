export type SnapshotCache = {
  get: (key: object) => unknown | undefined;
  set: (key: object, value: unknown) => void;
  has: (key: object) => boolean;
  delete: (key: object) => boolean;
  clear: () => void;
};

export function createSnapshotCache(): SnapshotCache {
  return new Map<object, unknown>();
}
