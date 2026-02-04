import type { OinTreeNode } from '../utils/types.js';
import type { OinView } from './types.js';

export function lens<T>(
  root: OinTreeNode<unknown>,
  path: ReadonlyArray<PropertyKey>
): OinView<T> {
  let node: unknown = root;
  for (const segment of path) {
    node = (node as Record<PropertyKey, unknown>)[segment];
  }
  const unit = node as unknown as {
    (): T;
    (next: T | ((prev: T) => T)): void;
    subscribe(fn: (v: T) => void): () => void;
    snapshot(): T;
  };
  return {
    get: () => unit(),
    set: (next) => unit(next),
    subscribe: (fn) => unit.subscribe(fn),
    snapshot: () => unit.snapshot(),
  };
}
