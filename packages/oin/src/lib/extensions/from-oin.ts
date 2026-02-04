import type { OinDerived, OinTreeNode, OinUnit } from '../utils/types.js';
import type { OinView } from './types.js';

type OinLike<T> = OinUnit<T> | OinDerived<T> | OinTreeNode<T>;

export function fromOin<T>(node: OinLike<T>): OinView<T> {
  const hasSnapshot = typeof (node as { snapshot?: unknown }).snapshot === 'function';
  const isCallable = typeof node === 'function';
  const isWritable = isCallable && typeof (node as { reset?: unknown }).reset === 'function';

  return {
    get: () => {
      if (isCallable) return (node as unknown as () => T)();
      if (hasSnapshot) return (node as unknown as { snapshot: () => T }).snapshot();
      throw new Error('fromOin: node is not readable');
    },
    set: isWritable
      ? (next) =>
          (node as unknown as (v: T | ((prev: T) => T)) => void)(
            next as T | ((prev: T) => T),
          )
      : undefined,
    subscribe: (fn) =>
      (node as unknown as { subscribe: (f: (v: T) => void) => () => void }).subscribe(fn),
    snapshot: hasSnapshot
      ? () => (node as unknown as { snapshot: () => T }).snapshot()
      : undefined,
  };
}
