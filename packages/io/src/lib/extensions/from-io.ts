import type { IoDerived, IoTreeNode, IoUnit } from '../utils/types.js';
import type { IoView } from './types.js';

type IoLike<T> = IoUnit<T> | IoDerived<T> | IoTreeNode<T>;

export function fromIo<T>(node: IoLike<T>): IoView<T> {
  const hasSnapshot = typeof (node as { snapshot?: unknown }).snapshot === 'function';
  const isCallable = typeof node === 'function';
  const isWritable = isCallable && typeof (node as { reset?: unknown }).reset === 'function';

  return {
    get: () => {
      if (isCallable) return (node as unknown as () => T)();
      if (hasSnapshot) return (node as unknown as { snapshot: () => T }).snapshot();
      throw new Error('fromIo: node is not readable');
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
