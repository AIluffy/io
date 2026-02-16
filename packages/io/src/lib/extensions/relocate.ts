import type { IoView } from './types.js';
import type { IoInternal } from '../utils/internal/internal-access.js';

import { getInternal } from '../utils/internal/internal-access.js';
import { formatPath } from '../utils/debug/format-path.js';
import { isIndexKey } from '../utils/internal/is-index-key.js';
import { traversePath } from '../utils/internal/traverse-path.js';

type ReadableNode<T> = {
  get(): T;
  snapshot(): T;
  subscribe(fn: (v: T) => void): () => void;
};

export function relocate<T>(
  root: unknown,
  path: ReadonlyArray<PropertyKey>,
): IoView<T> {
  const node = traversePath<IoInternal>(root, path, {
    getInternal,
    isArraySegment: (segment) =>
      typeof segment === 'number' || isIndexKey(segment),
    onNonNode: (fullPath, index) => {
      return `relocate: path traversed into non-node at ${formatPath(fullPath.slice(0, index))}`;
    },
    onInvalidScopeSegment: (fullPath, index) => {
      return `relocate: invalid scope key at ${formatPath(fullPath.slice(0, index + 1))}`;
    },
    onInvalidArraySegment: (fullPath, index) => {
      return `relocate: invalid array index at ${formatPath(fullPath.slice(0, index + 1))}`;
    },
    onLeaf: (fullPath, index) => {
      return `relocate: path traversed into leaf at ${formatPath(fullPath.slice(0, index))}`;
    },
  });

  const internal = getInternal(node);
  if (!internal)
    throw new Error(`relocate: target is not a node at ${formatPath(path)}`);

  if (internal.kind === 'unit') {
    const unit = node as {
      get(): T;
      set(next: T | ((prev: T) => T)): void;
      subscribe(fn: (v: T) => void): () => void;
      snapshot(): T;
    };
    return {
      get: () => unit.get(),
      set: (next) => unit.set(next),
      subscribe: (fn) => unit.subscribe(fn),
      snapshot: () => unit.snapshot(),
    };
  }

  if (internal.kind === 'derived') {
    const derived = node as ReadableNode<T>;
    return {
      get: () => derived.get(),
      subscribe: (fn) => derived.subscribe(fn),
      snapshot: () => derived.snapshot(),
    };
  }

  if (internal.kind === 'scope' || internal.kind === 'array') {
    const readable = node as ReadableNode<T>;
    if (
      typeof readable.get !== 'function' ||
      typeof readable.snapshot !== 'function' ||
      typeof readable.subscribe !== 'function'
    ) {
      throw new Error(
        `relocate: target is not readable at ${formatPath(path)}`,
      );
    }
    return {
      get: () => readable.get(),
      subscribe: (fn) => readable.subscribe(fn),
      snapshot: () => readable.snapshot(),
    };
  }

  throw new Error(`relocate: unsupported target at ${formatPath(path)}`);
}
