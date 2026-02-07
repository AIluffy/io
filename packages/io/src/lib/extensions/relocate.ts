import type { IoView } from './types.js';

import { getInternal } from '../utils/internal-access.js';

type ReadableNode<T> = {
  get(): T;
  snapshot(): T;
  subscribe(fn: (v: T) => void): () => void;
};

function formatPath(path: ReadonlyArray<PropertyKey>): string {
  if (path.length === 0) return '<root>';
  return path.map((segment) => String(segment)).join('.');
}

function isNumericString(value: PropertyKey): value is string {
  return typeof value === 'string' && /^[0-9]+$/.test(value);
}

export function relocate<T>(
  root: unknown,
  path: ReadonlyArray<PropertyKey>,
): IoView<T> {
  let node: unknown = root;
  for (let i = 0; i < path.length; i += 1) {
    const segment = path[i];
    const internal = getInternal(node);
    if (!internal)
      throw new Error(
        `relocate: path traversed into non-node at ${formatPath(path.slice(0, i))}`,
      );

    if (internal.kind === 'scope') {
      if (typeof segment !== 'string' && typeof segment !== 'symbol') {
        throw new Error(
          `relocate: invalid scope key at ${formatPath(path.slice(0, i + 1))}`,
        );
      }
      node = (node as Record<PropertyKey, unknown>)[segment];
      continue;
    }

    if (internal.kind === 'array') {
      if (typeof segment !== 'number' && !isNumericString(segment)) {
        throw new Error(
          `relocate: invalid array index at ${formatPath(path.slice(0, i + 1))}`,
        );
      }
      node = (node as Record<PropertyKey, unknown>)[segment];
      continue;
    }

    throw new Error(
      `relocate: path traversed into leaf at ${formatPath(path.slice(0, i))}`,
    );
  }

  const internal = getInternal(node);
  if (!internal)
    throw new Error(`relocate: target is not a node at ${formatPath(path)}`);

  if (internal.kind === 'unit') {
    const unit = node as {
      get(): T;
      set(next: T): void;
      update(fn: (prev: T) => T): void;
      subscribe(fn: (v: T) => void): () => void;
      snapshot(): T;
    };
    return {
      get: () => unit.get(),
      set: (next) => unit.set(next),
      update: (fn) => unit.update(fn),
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
